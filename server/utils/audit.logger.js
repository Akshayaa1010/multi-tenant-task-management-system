'use strict';

const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/db');

/**
 * logAudit
 * standard utility to insert a record into the audit_logs table.
 * 
 * @param {Object} req - Express request object (used for orgId, userId, ip)
 * @param {Object} options - Log details
 * @param {string} options.action       - Dot-namespaced action string (e.g. 'task.created')
 * @param {string} options.actionType   - Enum value (e.g. 'TASK_CREATED', 'LOGIN_SUCCESS')
 * @param {string} options.entityType   - affected entity type ('task', 'user', etc)
 * @param {string} options.entityId     - UUID of the affected row
 * @param {string} options.description  - Human-readable summary
 * @param {Object} options.metadata     - Optional extra context
 */
async function logAudit(req, { action, actionType, entityType, entityId, description, metadata = {} }) {
  try {
    const orgId = req.orgId || (req.user && req.user.orgId);
    const userId = req.user ? (req.user.userId || req.user.id) : null;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // We need at least an orgId to link the log to a tenant
    if (!orgId) {
      console.warn(`⚠️ Skipping audit log [${actionType}] - No orgId found in request context.`);
      return;
    }

    await query(
      `INSERT INTO audit_logs 
        (id, org_id, user_id, actor_id, action, action_type, entity_type, entity_id, description, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        uuidv4(),
        orgId,
        userId,          // legacy user_id column
        userId,          // new actor_id column
        action,
        actionType,
        entityType,
        entityId || userId, // default to userId if no specific entity
        description,
        ipAddress,
        JSON.stringify(metadata)
      ]
    );

    console.log(`📝 Audit Logged: ${actionType} for Org: ${orgId}`);
  } catch (err) {
    // Audit logging should not break the main transaction/response flow
    console.error('❌ Failed to save audit log:', err.message);
  }
}

module.exports = {
  logAudit
};
