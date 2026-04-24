'use strict';

const { Pool } = require('pg');

// ─────────────────────────────────────────────
//  PostgreSQL Connection Pool
//
//  Uses DATABASE_URL from the environment.
//  Falls back to individual PG* vars if the URL
//  is not available (handy for local dev without
//  Docker).
// ─────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Pool sizing — sensible defaults for a small service.
  max             : parseInt(process.env.PG_POOL_MAX  || '20', 10),
  idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '60000', 10),
  connectionTimeoutMillis: parseInt(process.env.PG_CONN_TIMEOUT || '10000', 10),

  // Keep SSL flexible: disabled locally, required in managed cloud DBs.
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : false,
});

// ── Pool-level error handler ──────────────────
// Prevents unhandled rejection crashes if an idle
// client encounters a network hiccup.
pool.on('error', (err) => {
  console.error('❌  Unexpected PostgreSQL pool error:', err.message);
});

// ─────────────────────────────────────────────
//  connectDB
//  Called once at startup to verify connectivity
//  before the server begins accepting requests.
// ─────────────────────────────────────────────
async function connectDB() {
  try {
    const client = await pool.connect();
    const { rows } = await client.query('SELECT NOW() AS now');
    client.release();
    console.log(`✅  PostgreSQL connected — server time: ${rows[0].now}`);
  } catch (err) {
    console.error('❌  PostgreSQL connection failed:', err.message);
    throw err; // bubble up so bootstrap() can exit(1)
  }
}

// ─────────────────────────────────────────────
//  query  — thin wrapper around pool.query
//  Usage: const { rows } = await query(sql, params)
// ─────────────────────────────────────────────
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV !== 'production') {
    // Log slow queries (> 200 ms) during development
    if (duration > 200) {
      console.warn(`⚠️  Slow query (${duration}ms): ${text}`);
    }
  }

  return result;
}

// ─────────────────────────────────────────────
//  getClient  — returns a raw client for
//  multi-statement transactions.
//
//  Usage:
//    const client = await getClient();
//    try {
//      await client.query('BEGIN');
//      ...
//      await client.query('COMMIT');
//    } catch (e) {
//      await client.query('ROLLBACK');
//      throw e;
//    } finally {
//      client.release();
//    }
// ─────────────────────────────────────────────
async function getClient() {
  return pool.connect();
}

module.exports = {
  pool,
  query,
  getClient,
  connectDB,
};
