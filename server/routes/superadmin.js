'use strict';

const router = require('express').Router();
const { query } = require('../config/db');
const verifyJWT = require('../middleware/verifyJWT');
const { checkRole } = require('../middleware/rbac');

// Protect all routes
router.use(verifyJWT);
router.use(checkRole('super_admin'));

/**
 * GET /api/superadmin/audit-logs
 * Returns platform-wide system audit logs.
 * Supports filtering by tenant name.
 */
router.get('/audit-logs', async (req, res, next) => {
  try {
    const { tenant } = req.query;
    let sql = 'SELECT * FROM system_audit_logs';
    let params = [];

    if (tenant) {
      sql += ' WHERE tenant_name = $1';
      params.push(tenant);
    }

    sql += ' ORDER BY created_at DESC LIMIT 100';

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
