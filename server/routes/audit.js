'use strict';

const router = require('express').Router();
const { query } = require('../config/db');
const verifyJWT = require('../middleware/verifyJWT');
const tenantScope = require('../middleware/tenantScope');
const { checkRole } = require('../middleware/rbac');

// Apply core middlewares
router.use(verifyJWT);
router.use(tenantScope);

// ─────────────────────────────────────────────
//  GET /api/audit
// ─────────────────────────────────────────────
router.get('/', checkRole('admin'), async (req, res, next) => {
  try {
    const { orgId } = req;
    
    // Support limit and offset with sensible defaults
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = parseInt(req.query.offset || '0', 10);

    const { rows } = await query(
      `SELECT al.*, 
              u.email as actor_email,
              u.name as actor_name
       FROM audit_logs al
       LEFT JOIN users u ON COALESCE(al.actor_id, al.user_id) = u.id
       WHERE al.org_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2 OFFSET $3`,
      [orgId, limit, offset]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
