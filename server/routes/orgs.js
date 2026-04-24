'use strict';

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, getClient } = require('../config/db');
const verifyJWT = require('../middleware/verifyJWT');
const tenantScope = require('../middleware/tenantScope');
const { checkRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit.logger');
const { getIO } = require('../utils/socket');


// Apply core middlewares
router.use(verifyJWT);
router.use(tenantScope);

// ─────────────────────────────────────────────
//  GET /api/orgs/members
// ─────────────────────────────────────────────
router.get('/members', checkRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { orgId } = req;
    const { rows } = await query(
      'SELECT id, email, role, name, created_at FROM users WHERE org_id = $1 ORDER BY created_at ASC',
      [orgId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  POST /api/orgs/invite
// ─────────────────────────────────────────────
router.post('/invite', checkRole('admin', 'super_admin'), async (req, res, next) => {
  let client;
  try {
    client = await getClient();
    const { email, password, username, role, allottedTasks } = req.body;
    const { orgId } = req;

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Username, Email, and Password are required.' });
    }

    const targetRole = role || 'agent';

    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(password, 12);
    const newUserId = uuidv4();

    const { rows } = await client.query(
      `INSERT INTO users (id, org_id, email, password_hash, role, name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, role, created_at`,
      [newUserId, orgId, email.toLowerCase().trim(), passwordHash, targetRole, username.trim()]
    );

    const newUser = rows[0];

    if (Array.isArray(allottedTasks) && allottedTasks.length > 0) {
      for (const taskTitle of allottedTasks) {
        if (!taskTitle.trim()) continue;
        await client.query(
          `INSERT INTO tasks (id, org_id, created_by, assigned_to, title, description, status, priority)
           VALUES ($1, $2, $3, $4, $5, $6, 'todo', 'medium')`,
          [uuidv4(), orgId, req.user.userId, newUserId, taskTitle.trim(), 'Assigned during onboarding']
        );

        // REAL-TIME: Notify rooms
        const io = getIO();
        io.to(`org_${orgId}`).emit('task_created', { title: taskTitle.trim(), assigned_to: newUserId });
        io.to(`user_${newUserId}`).emit('task_assigned', { title: taskTitle.trim() });
      }
    }


    await client.query('COMMIT');

    // Detailed Audit: USER_CREATED
    await logAudit(req, {
      action: 'user.created',
      actionType: 'USER_CREATED',
      entityType: 'user',
      entityId: newUser.id,
      description: `New user ${newUser.email} (${newUser.role}) invited by ${req.user.name || req.user.email}`,
      metadata: { role: newUser.role, allottedTasks: allottedTasks }
    });

    res.status(201).json({ 
      user: newUser,
      message: 'User created and tasks allotted successfully.'
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'User with this email already exists in the organization.' });
    }
    next(err);
  } finally {
    if (client) client.release();
  }
});

// ─────────────────────────────────────────────
//  PATCH /api/orgs/members/:userId
// ─────────────────────────────────────────────
router.patch('/members/:userId', checkRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { role, name, email } = req.body;
    const { orgId } = req;
    const targetUserId = req.params.userId;

    // 1. Prevent self-role-change if it would lose admin status
    if (targetUserId === req.user.userId && role && role !== req.user.role) {
      // return res.status(400).json({ error: 'You cannot change your own role through this endpoint.' });
    }

    const { rows } = await query(
      `UPDATE users 
       SET role = COALESCE($1, role),
           name = COALESCE($2, name),
           email = COALESCE($3, email)
       WHERE id = $4 AND org_id = $5
       RETURNING id, email, name, role`,
      [role, name, email, targetUserId, orgId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'User not found in your organization.' });
    }

    const updatedUser = rows[0];

    // Detailed Audit: USER_ROLE_CHANGED (only if role was provided)
    if (role) {
      await logAudit(req, {
        action: 'user.role_changed',
        actionType: 'USER_ROLE_CHANGED',
        entityType: 'user',
        entityId: targetUserId,
        description: `Role for ${updatedUser.email} updated to ${updatedUser.role} by ${req.user.name || req.user.email}`,
        metadata: { newRole: updatedUser.role }
      });
    }

    res.json(updatedUser);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  DELETE /api/orgs/members/:userId
// ─────────────────────────────────────────────
router.delete('/members/:userId', checkRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { orgId } = req;
    const targetUserId = req.params.userId;

    if (targetUserId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot delete yourself.' });
    }

    const { rowCount } = await query(
      'DELETE FROM users WHERE id = $1 AND org_id = $2',
      [targetUserId, orgId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'User not found in your organization.' });
    }

    // Detailed Audit: USER_DELETED
    await logAudit(req, {
      action: 'user.deleted',
      actionType: 'USER_DELETED',
      entityType: 'user',
      entityId: targetUserId,
      description: `User ${targetUserId} (ID) removed from organization by ${req.user.name || req.user.email}`
    });

    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

router.patch('/members/:userId/role', checkRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { role } = req.body;
    const { orgId } = req;
    const targetUserId = req.params.userId;

    // 1. Prevent self-role-change
    if (targetUserId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot change your own role.' });
    }

    const { rows } = await query(
      `UPDATE users 
       SET role = $1::user_role
       WHERE id = $2 AND org_id = $3
       RETURNING id, email, role`,
      [role, targetUserId, orgId]
    );

    const updatedUser = rows[0];

    // Detailed Audit: USER_ROLE_CHANGED
    await logAudit(req, {
      action: 'user.role_changed',
      actionType: 'USER_ROLE_CHANGED',
      entityType: 'user',
      entityId: targetUserId,
      description: `Role for ${updatedUser.email} updated to ${updatedUser.role} by ${req.user.name || req.user.email}`,
      metadata: { newRole: updatedUser.role }
    });

    res.json(updatedUser);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
