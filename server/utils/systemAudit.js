'use strict';

const { query } = require('../config/db');
const { getIO } = require('./socket');

/**
 * logSystemEvent
 * Logs a platform-wide security event to system_audit_logs 
 * and emits it in real-time to connected Super Admins.
 * 
 * @param {string} eventType  - LOGIN, TENANT_CREATE, TENANT_SUSPEND, SECURITY_ALERT
 * @param {string} tenantName - Name of the affected organization
 * @param {string} performedBy - Email or ID of the actor
 * @param {string} description - Human readable details
 */
async function logSystemEvent(eventType, tenantName, performedBy, description) {
  try {
    const { rows } = await query(
      `INSERT INTO system_audit_logs (event_type, tenant_name, performed_by, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [eventType, tenantName, performedBy, description]
    );

    const newLog = rows[0];

    // Emit via Socket.io
    try {
      const io = getIO();
      io.emit('new_system_audit_log', newLog);
      console.log(`📡 Emitted system audit log: ${eventType}`);
    } catch (ioErr) {
      // Socket might not be initialized in some contexts (e.g. scripts)
      console.warn('⚠️ Could not emit socket event:', ioErr.message);
    }

    return newLog;
  } catch (err) {
    console.error('❌ Failed to log system event:', err.message);
  }
}

module.exports = {
  logSystemEvent
};
