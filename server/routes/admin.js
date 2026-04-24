'use strict';

const router = require('express').Router();
const { query } = require('../config/db');
const verifyJWT = require('../middleware/verifyJWT');
const { checkRole } = require('../middleware/rbac');
const { logSystemEvent } = require('../utils/systemAudit');

// Apply auth middlewares
router.use(verifyJWT);
router.use(checkRole('super_admin'));

/**
 * GET /api/admin/stats
 * Returns global counts across all tenants.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const orgsPromise = query('SELECT COUNT(*) FROM organizations');
    const adminsPromise = query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
    const agentsPromise = query("SELECT COUNT(*) FROM users WHERE role = 'agent'");

    const [orgs, admins, agents] = await Promise.all([
      orgsPromise,
      adminsPromise,
      agentsPromise
    ]);

    res.json({
      totalOrganizations: parseInt(orgs.rows[0].count),
      totalAdmins: parseInt(admins.rows[0].count),
      totalAgents: parseInt(agents.rows[0].count)
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/organizations
 * Returns a list of organizations with their admin name.
 */
router.get('/organizations', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT o.*, 
             u.name as admin_name, 
             u.email as admin_email,
             (SELECT COUNT(*) FROM users WHERE org_id = o.id) as user_count
      FROM organizations o
      LEFT JOIN users u ON u.org_id = o.id AND u.role = 'admin'
      ORDER BY o.name ASC
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/organizations/:id
 * Permanently deletes an organization and ALL its associated data
 * (users, tasks, audit_logs) via ON DELETE CASCADE.
 * Protected: Super Admin only.
 */
router.delete('/organizations/:id', async (req, res, next) => {
  const { id } = req.params;
  const currentUserOrgId = req.user.orgId;

  try {
    // Safety check: prevent a Super Admin from deleting the org they belong to
    if (id === currentUserOrgId) {
      return res.status(403).json({
        error: 'You cannot delete your own organization.'
      });
    }

    // Verify the organization exists
    const orgCheck = await query('SELECT name FROM organizations WHERE id = $1', [id]);
    if (orgCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Organization not found.' });
    }

    const orgName = orgCheck.rows[0].name;

    // Delete — cascades to users, tasks, audit_logs, oauth_providers automatically
    await query('DELETE FROM organizations WHERE id = $1', [id]);

    // System Audit: TENANT_SUSPEND (as requested for deletion)
    await logSystemEvent('TENANT_SUSPEND', orgName, req.user.email, `Organization "${orgName}" deleted by Super Admin`);

    console.log(`🗑️  Organization "${orgName}" (${id}) permanently deleted by ${req.user.email}`);

    res.json({
      message: `Organization "${orgName}" and all its data have been permanently deleted.`,
      deletedId: id
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
