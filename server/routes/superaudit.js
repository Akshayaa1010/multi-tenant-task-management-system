'use strict';

/**
 * Super-Admin Security Audit Routes
 * GET /api/superaudit/logs         – paginated audit log, supports tenant-filter
 * GET /api/superaudit/live-metrics – active tenants & security alerts in last hour
 * GET /api/superaudit/threats      – IPs with 5+ failed logins (active threats)
 * GET /api/superaudit/export       – download CSV
 */

const router  = require('express').Router();
const { query } = require('../config/db');
const verifyJWT  = require('../middleware/verifyJWT');
const { checkRole } = require('../middleware/rbac');

// All routes require a valid JWT and super_admin role
router.use(verifyJWT);
router.use(checkRole('super_admin'));

// ─────────────────────────────────────────────────────────
//  GET /api/superaudit/logs
//  Query params:
//    limit       (default 25)
//    offset      (default 0)
//    tenant_id   (optional UUID – filter to a single org)
//    action_type (optional enum string)
// ─────────────────────────────────────────────────────────
router.get('/logs', async (req, res, next) => {
  try {
    const limit     = Math.min(parseInt(req.query.limit  || '25', 10), 200);
    const offset    = parseInt(req.query.offset || '0', 10);
    const tenantId  = req.query.tenant_id   || null;
    const actionType = req.query.action_type || null;

    let whereClauses = [];
    let params = [limit, offset];
    let paramIdx = 3;

    if (tenantId) {
      whereClauses.push(`al.org_id = $${paramIdx}`);
      params.push(tenantId);
      paramIdx++;
    }
    if (actionType) {
      whereClauses.push(`al.action_type = $${paramIdx}::audit_action_type`);
      params.push(actionType);
      paramIdx++;
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT
         al.id,
         al.created_at          AS timestamp,
         al.actor_id,
         actor.email            AS actor_email,
         actor.name             AS actor_name,
         al.action_type,
         al.action,
         al.target_tenant_id,
         org.name               AS tenant_name,
         al.description,
         al.ip_address,
         al.entity_type,
         al.entity_id,
         al.metadata,
         al.org_id
       FROM audit_logs al
       LEFT JOIN users         actor ON al.actor_id = al.user_id
       LEFT JOIN organizations org   ON al.org_id   = org.id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    // Total count for pagination
    const countParams = params.slice(2); // drop limit/offset
    const countWhere  = whereClauses.length
      ? `WHERE ${whereClauses.map((c, i) => c.replace(`$${i + 3}`, `$${i + 1}`)).join(' AND ')}`
      : '';

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM audit_logs al ${countWhere}`,
      countParams
    );

    res.json({
      logs  : rows,
      total : parseInt(countRows[0].count, 10),
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────
//  GET /api/superaudit/live-metrics
//  Returns "Total Active Tenants" and "Security Alerts last 1 h"
// ─────────────────────────────────────────────────────────
router.get('/live-metrics', async (req, res, next) => {
  try {
    const [tenantsResult, alertsResult] = await Promise.all([
      query(`SELECT COUNT(DISTINCT org_id) FROM audit_logs WHERE created_at >= NOW() - INTERVAL '30 days'`),
      query(`
        SELECT COUNT(*) FROM audit_logs
        WHERE action_type IN ('LOGIN_FAILURE','SUSPICIOUS_ACTIVITY')
          AND created_at >= NOW() - INTERVAL '1 hour'
      `),
    ]);

    res.json({
      activeTenantsCount  : parseInt(tenantsResult.rows[0].count,  10),
      securityAlertsCount : parseInt(alertsResult.rows[0].count,   10),
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────
//  GET /api/superaudit/threats
//  IPs with 5+ failed logins across all tenants
// ─────────────────────────────────────────────────────────
router.get('/threats', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        ip_address,
        COUNT(*)                          AS failure_count,
        MAX(created_at)                   AS last_seen,
        COUNT(DISTINCT org_id)            AS affected_tenants,
        array_agg(DISTINCT org.name)      AS tenant_names
      FROM audit_logs al
      LEFT JOIN organizations org ON al.org_id = org.id
      WHERE al.action_type = 'LOGIN_FAILURE'
        AND al.ip_address IS NOT NULL
        AND al.created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY al.ip_address
      HAVING COUNT(*) >= 5
      ORDER BY failure_count DESC
      LIMIT 20
    `);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────
//  GET /api/superaudit/tenants
//  Simple list of all org IDs + names for the filter dropdown
// ─────────────────────────────────────────────────────────
router.get('/tenants', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name FROM organizations ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────
//  GET /api/superaudit/export?format=csv|pdf&tenant_id=...
//  Returns raw CSV data (browser will trigger download)
// ─────────────────────────────────────────────────────────
router.get('/export', async (req, res, next) => {
  try {
    const tenantId = req.query.tenant_id || null;
    const params   = [];
    const where    = tenantId ? 'WHERE al.org_id = $1' : '';
    if (tenantId) params.push(tenantId);

    const { rows } = await query(
      `SELECT
         al.created_at          AS timestamp,
         actor.email            AS actor_email,
         al.action_type,
         al.action,
         org.name               AS tenant_name,
         al.description,
         al.ip_address,
         al.entity_type,
         al.entity_id
       FROM audit_logs al
       LEFT JOIN users         actor ON al.actor_id = al.user_id
       LEFT JOIN organizations org   ON al.org_id   = org.id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT 10000`,
      params
    );

    // Build CSV
    const header = ['timestamp','actor_email','action_type','action','tenant_name','description','ip_address','entity_type','entity_id'];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvLines = [
      header.join(','),
      ...rows.map(r => header.map(h => escape(r[h])).join(',')),
    ];

    const csv = csvLines.join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="security_audit_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
