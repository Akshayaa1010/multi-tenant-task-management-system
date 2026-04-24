'use strict';

const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/db');
const verifyJWT = require('../middleware/verifyJWT');
const tenantScope = require('../middleware/tenantScope');
const { checkRole } = require('../middleware/rbac');
const upload = require('../middleware/upload');

const { logAudit } = require('../utils/audit.logger');
const { getIO } = require('../utils/socket');

// Apply core middlewares to all routes
router.use(verifyJWT);
router.use(tenantScope);

// ─────────────────────────────────────────────
//  GET /api/tasks
// ─────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { role, userId } = req.user;
    const orgId = req.orgId;

    let sql = `
      SELECT t.*, u.email as assigned_to_email, u.name as assigned_to_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.org_id = $1
    `;
    let params = [orgId];

    // Role-based filtering logic: Only Admins and Super Admins see everything
    if (role !== 'admin' && role !== 'super_admin') {
      sql += ' AND t.assigned_to = $2';
      params.push(userId);
    }

    sql += ' ORDER BY t.created_at DESC';

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  POST /api/tasks
// ─────────────────────────────────────────────
router.post('/', checkRole('admin', 'member'), upload.array('attachments', 5), async (req, res, next) => {
  try {
    const { title, description, status, priority, due_date, assigned_to } = req.body;
    const { userId } = req.user;
    const orgId = req.orgId;

    if (!title) return res.status(400).json({ error: 'Title is required.' });

    // Handle attachments
    let attachments = null;
    if (req.files && req.files.length > 0) {
      attachments = JSON.stringify(req.files.map(f => ({
        originalname: f.originalname,
        filename: f.filename,
        path: `/uploads/${f.filename}`,
        mimetype: f.mimetype,
        size: f.size
      })));
    }

    const taskId = uuidv4();
    const { rows } = await query(
      `INSERT INTO tasks
         (id, org_id, created_by, assigned_to, title, description, status, priority, due_date, attachments)
       VALUES ($1, $2, $3, $4, $5, $6,
               COALESCE($7,'todo')::task_status,
               COALESCE($8,'medium')::task_priority,
               $9, $10::jsonb)
       RETURNING *`,
      [taskId, orgId, userId, assigned_to || null, title, description || null,
       status || null, priority || null, due_date || null, attachments]
    );

    const task = rows[0];

    // Log the creation
    await logAudit(req, {
      action: 'task.created',
      actionType: 'TASK_CREATED',
      entityType: 'task',
      entityId: task.id,
      description: `Task "${task.title}" created by ${req.user.name || req.user.email}`,
      metadata: { title: task.title, assigned_to: task.assigned_to }
    });

    // REAL-TIME: Notify organization and assigned user
    const io = getIO();
    io.to(`org_${orgId}`).emit('task_created', task);
    if (task.assigned_to) {
      io.to(`user_${task.assigned_to}`).emit('task_assigned', task);
    }

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  PUT /api/tasks/:id
// ─────────────────────────────────────────────
router.put('/:id', upload.array('attachments', 5), async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    const orgId = req.orgId;
    const taskId = req.params.id;

    // 1. Fetch current task to check ownership/isolation
    const { rows: existing } = await query(
      'SELECT * FROM tasks WHERE id = $1 AND org_id = $2',
      [taskId, orgId]
    );

    if (!existing.length) return res.status(404).json({ error: 'Task not found.' });
    
    const task = existing[0];

    // 2. Permission Check
    // Admins can update any; Members can only update their own
    if (role !== 'admin' && task.created_by !== userId) {
      return res.status(403).json({ error: 'You do not have permission to update this task.' });
    }

    // 3. Perform update
    const { title, description, status, priority, due_date, assigned_to } = req.body;
    
    // Process new attachments if any
    let attachments = task.attachments; // keep existing attachments
    if (req.files && req.files.length > 0) {
      const newAttachments = req.files.map(f => ({
        originalname: f.originalname,
        filename: f.filename,
        path: `/uploads/${f.filename}`,
        mimetype: f.mimetype,
        size: f.size
      }));
      // Merge with existing or overwrite. Here we append to existing or create new.
      const currentAttach = typeof attachments === 'string' ? JSON.parse(attachments) : (attachments || []);
      attachments = JSON.stringify([...currentAttach, ...newAttachments]);
    } else {
      attachments = attachments ? JSON.stringify(attachments) : null;
    }
    
    const { rows: updated } = await query(
      `UPDATE tasks 
          SET title = COALESCE($1, title),
              description = $2,
              status = COALESCE($3, status),
              priority = COALESCE($4, priority),
              due_date = $5,
              assigned_to = $6,
              attachments = $7::jsonb
        WHERE id = $8 AND org_id = $9
        RETURNING *`,
      [
        title || null, 
        description !== undefined ? (description || null) : task.description, 
        status || null, 
        priority || null, 
        due_date !== undefined ? (due_date || null) : task.due_date, 
        assigned_to !== undefined ? (assigned_to || null) : task.assigned_to, 
        attachments, 
        taskId, 
        orgId
      ]
    );

    const updatedTask = updated[0];

    // 4. Log the action (Auto-detecting assignment or completion)
    let actionType = 'TASK_UPDATED';
    let auditDescription = `Task "${updatedTask.title}" updated by ${req.user.name || req.user.email}`;

    if (status === 'done' && task.status !== 'done') {
      actionType = 'TASK_COMPLETED';
      auditDescription = `Task "${updatedTask.title}" marked as COMPLETED by ${req.user.name || req.user.email}`;
    } else if (assigned_to && assigned_to !== task.assigned_to) {
      actionType = 'TASK_ASSIGNED';
      auditDescription = `Task "${updatedTask.title}" ASSIGNED to user ${assigned_to} by ${req.user.name || req.user.email}`;
    }

    await logAudit(req, {
      action: 'task.updated',
      actionType,
      entityType: 'task',
      entityId: taskId,
      description: auditDescription,
      metadata: { 
        changes: req.body,
        previous_status: task.status,
        previous_assignee: task.assigned_to
      }
    });

    // REAL-TIME: Notify transformation
    const io = getIO();
    io.to(`org_${orgId}`).emit('task_updated', updatedTask);
    if (updatedTask.assigned_to) {
      io.to(`user_${updatedTask.assigned_to}`).emit('task_updated', updatedTask);
    }

    res.json(updatedTask);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  DELETE /api/tasks/:id
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    const orgId = req.orgId;
    const taskId = req.params.id;

    // 1. Fetch current task to check ownership/isolation
    const { rows: existing } = await query(
      'SELECT * FROM tasks WHERE id = $1 AND org_id = $2',
      [taskId, orgId]
    );

    if (!existing.length) return res.status(404).json({ error: 'Task not found.' });
    
    const task = existing[0];

    // 2. Permission Check
    // Admins can delete any; Members can only delete their own
    if (role !== 'admin' && task.created_by !== userId) {
      return res.status(403).json({ error: 'You do not have permission to delete this task.' });
    }

    // 3. Perform delete
    await query(
      'DELETE FROM tasks WHERE id = $1 AND org_id = $2',
      [taskId, orgId]
    );

    // 4. Log the deletion
    await logAudit(req, {
      action: 'task.deleted',
      actionType: 'TASK_DELETED',
      entityType: 'task',
      entityId: taskId,
      description: `Task "${task.title}" permanently deleted by ${req.user.name || req.user.email}`,
      metadata: { title: task.title }
    });

    // REAL-TIME: Notify deletion
    getIO().to(`org_${orgId}`).emit('task_deleted', { id: taskId });

    res.json({ message: 'Task deleted successfully.', id: taskId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
