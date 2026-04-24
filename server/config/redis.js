'use strict';

const Redis = require('ioredis');

// ─────────────────────────────────────────────
//  ioredis Client
//
//  A single shared client is exported and reused
//  across the application (rate-limiter, session
//  cache, queue, etc.).
// ─────────────────────────────────────────────
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  // Automatically reconnect on disconnect
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000); // cap at 3 s
    return delay;
  },

  // Surface errors without crashing the process
  lazyConnect        : true,  // connect() is called explicitly in connectRedis()
  maxRetriesPerRequest: 3,
  enableReadyCheck   : true,
  connectTimeout     : 5000,
});

// ── Event hooks ───────────────────────────────
redis.on('error', (err) => {
  console.error('❌  Redis error:', err.message);
});

redis.on('reconnecting', () => {
  console.warn('⚠️  Redis reconnecting…');
});

// ─────────────────────────────────────────────
//  connectRedis
//  Called once at startup to verify connectivity.
// ─────────────────────────────────────────────
async function connectRedis() {
  try {
    await redis.connect();
    const pong = await redis.ping();
    console.log(`✅  Redis connected — PING: ${pong}`);
  } catch (err) {
    console.error('❌  Redis connection failed:', err.message);
    throw err; // bubble up so bootstrap() can exit(1)
  }
}

module.exports = { redis, connectRedis };
