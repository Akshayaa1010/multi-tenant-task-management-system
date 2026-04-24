'use strict';

require('dotenv').config();
// Trigger restart

// Verify required environment variables
const requiredEnv = ['DATABASE_URL', 'JWT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'REDIS_URL'];
requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌ CRITICAL ERROR: Missing environment variable: ${key}. Please check your .env file.`);
    process.exit(1);
  }
});

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const http         = require('http');

const { connectDB }    = require('./config/db');
const { connectRedis } = require('./config/redis');
const { initPassport } = require('./config/passport');
const rateLimiter      = require('./middleware/rateLimiter');
const socketUtil       = require('./utils/socket');
const path             = require('path');

// ── Route modules ─────────────────────────────
const authRoutes       = require('./routes/auth');
const tasksRoutes      = require('./routes/tasks');
const orgsRoutes       = require('./routes/orgs');
const auditRoutes      = require('./routes/audit');
const superAuditRoutes = require('./routes/superaudit');
const superAdminRoutes = require('./routes/superadmin');

// ─────────────────────────────────────────────
//  Bootstrap
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 5005;
const ENV  = process.env.NODE_ENV || 'development';

async function bootstrap() {
  // 1. Verify external connections before accepting traffic
  await connectDB();
  await connectRedis();

  const app = express();

  // ── Security / Observability middleware ───────
  app.use(helmet());                    // Sets secure HTTP headers
  app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
    credentials: true,
  }));
  app.use(morgan(ENV === 'production' ? 'combined' : 'dev'));

  // ── Body parsers ──────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  // ── Rate limiting (global) ────────────────────
  app.use(rateLimiter);

  // ── Passport (JWT + Google OAuth) ────────────
  initPassport(app);

  // ── Health check (no auth required) ──────────
  app.get('/api/health', (_req, res) => {
    res.json({
      status : 'ok',
      env    : ENV,
      ts     : new Date().toISOString(),
    });
  });

  // ── API Routes ────────────────────────────────
  const adminRoutes = require('./routes/admin');

  app.use('/api/auth',       authRoutes);
  app.use('/api/tasks',      tasksRoutes);
  app.use('/api/orgs',       orgsRoutes);
  app.use('/api/audit',      auditRoutes);
  app.use('/api/admin',      adminRoutes);
  app.use('/api/superaudit', superAuditRoutes);
  app.use('/api/superadmin', superAdminRoutes);

  // ── 404 handler ───────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // ── Global error handler ──────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status  = err.status  || 500;
    const message = err.message || 'Internal Server Error';

    if (ENV !== 'production') console.error(err.stack);

    res.status(status).json({ error: message });
  });

  // ── Start listening ───────────────────────────
  const server = http.createServer(app);
  socketUtil.init(server);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅  API server listening on port ${PORT} [${ENV}]`);
  });
}

bootstrap().catch((err) => {
  console.error('❌  Failed to start server:', err.message);
  process.exit(1);
});
