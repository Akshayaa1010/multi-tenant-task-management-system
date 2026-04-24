'use strict';

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getClient, pool } = require('./config/db');

async function seed() {
  const client = await getClient();

  try {
    console.log('🚀 Starting database seed...');

    await client.query('BEGIN');

    // 1. Clear existing data (in correct dependency order)
    console.log('🧹 Clearing existing data...');
    await client.query('TRUNCATE audit_logs, tasks, oauth_providers, users, organizations CASCADE');

    const hashedPassword = await bcrypt.hash('password123', 12);

    // 2. Create Organizations
    console.log('🏢 Creating organizations...');
    const orgSystemId = uuidv4();
    const orgAcmeId = uuidv4();
    const orgGlobexId = uuidv4();

    await client.query(
      'INSERT INTO organizations (id, name) VALUES ($1, $2), ($3, $4), ($5, $6)',
      [orgSystemId, 'CredZen Administration', orgAcmeId, 'Acme Corp', orgGlobexId, 'Globex Inc']
    );

    // 3. Create Users
    console.log('👤 Creating users...');
    
    // System Super Admin
    const superAdminId = uuidv4();
    const superAdminHash = await bcrypt.hash('superadmin', 12);
    await client.query(
      `INSERT INTO users (id, org_id, email, name, password_hash, role) VALUES 
       ($1, $2, $3, 'Super_Admin', $4, 'super_admin')`,
      [superAdminId, orgSystemId, 'superadmin1@gmail.com', superAdminHash]
    );

    // Acme Users
    const aliceId = uuidv4();
    const bobId = uuidv4();
    const carolId = uuidv4();
    await client.query(
      `INSERT INTO users (id, org_id, email, name, password_hash, role) VALUES 
       ($1, $2, $3, 'Alice Smith', $4, 'admin'),
       ($5, $2, $6, 'Bob Jones', $4, 'member'),
       ($7, $2, $8, 'Carol White', $4, 'viewer')`,
      [aliceId, orgAcmeId, 'alice@acme.com', hashedPassword, bobId, 'bob@acme.com', carolId, 'carol@acme.com']
    );

    // Globex Users
    const daveId = uuidv4();
    const eveId = uuidv4();
    await client.query(
      `INSERT INTO users (id, org_id, email, name, password_hash, role) VALUES 
       ($1, $2, $3, 'Dave Brown', $4, 'admin'),
       ($5, $2, $6, 'Eve Green', $4, 'member')`,
      [daveId, orgGlobexId, 'dave@globex.com', hashedPassword, eveId, 'eve@globex.com']
    );

    // 4. Create Tasks
    console.log('📝 Creating tasks...');
    
    // Acme Tasks
    await client.query(
      `INSERT INTO tasks (id, org_id, created_by, assigned_to, title, description, status, priority) VALUES 
       ($1, $2, $3, $4, 'Setup tenant routing', 'Define how subdomains map to orgs', 'done', 'high'),
       ($5, $2, $3, $4, 'Implement RBAC', 'Add checkRole middleware to routes', 'in_progress', 'high'),
       ($6, $2, $4, $4, 'Design dashboard UI', 'Create mockups for the main view', 'todo', 'medium'),
       ($7, $2, $3, NULL, 'Audit log cleanup', 'Schedule a cron job for old logs', 'todo', 'low'),
       ($8, $2, $4, $3, 'Write API documentation', 'Document all endpoints in Swagger', 'todo', 'medium')`,
      [uuidv4(), orgAcmeId, aliceId, bobId, uuidv4(), uuidv4(), uuidv4(), uuidv4()]
    );

    // Globex Tasks
    await client.query(
      `INSERT INTO tasks (id, org_id, created_by, assigned_to, title, description, status, priority) VALUES 
       ($1, $2, $3, $4, 'Market research', 'Analyze competitors in the region', 'done', 'low'),
       ($5, $2, $3, $3, 'Investor pitch deck', 'Prepare slides for Series A', 'in_progress', 'high'),
       ($6, $2, $3, NULL, 'New office search', 'Look for spaces in downtown', 'todo', 'medium')`,
      [uuidv4(), orgGlobexId, daveId, eveId, uuidv4(), uuidv4()]
    );

    // 5. Create Audit Logs
    console.log('📑 Creating audit logs...');
    await client.query(
      `INSERT INTO audit_logs (id, org_id, user_id, action, entity_type, entity_id) VALUES 
       ($1, $2, $3, 'user.registered', 'user', $3),
       ($4, $2, $3, 'task.created', 'task', $5),
       ($6, $7, $8, 'user.registered', 'user', $8)`,
      [uuidv4(), orgAcmeId, aliceId, uuidv4(), uuidv4(), uuidv4(), orgGlobexId, daveId]
    );

    await client.query('COMMIT');
    console.log('✨ Seeding completed successfully!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err.message);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

seed();
