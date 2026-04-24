'use strict';

const router   = require('express').Router();
const passport = require('passport');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, getClient } = require('../config/db');
const { createLimiter } = require('../middleware/rateLimiter');
const { logSystemEvent } = require('../utils/systemAudit');
const { logAudit } = require('../utils/audit.logger');


// Strict limiter for auth endpoints — 10 attempts per 15 min per IP
const authLimiter = createLimiter({ max: 10 });

/**
 * Helper: signToken
 * Signs a JWT with the required payload and expiration.
 */
function signToken(user) {
  const payload = {
    userId : user.userId || user.id,
    orgId  : user.orgId  || user.org_id,
    name   : user.name,
    role   : user.role,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '7d',
    algorithm: 'HS256',
  });
}

// ─────────────────────────────────────────────
//  POST /api/auth/register
// ─────────────────────────────────────────────
router.post('/register', authLimiter, async (req, res, next) => {
  const client = await getClient();
  try {
    const { orgName, email, password, name } = req.body;

    if (!orgName || !email || !password) {
      return res.status(400).json({ error: 'orgName, email, and password are required.' });
    }

    await client.query('BEGIN');

    // 1. Create organization
    const orgResult = await client.query(
      'INSERT INTO organizations (id, name) VALUES ($1, $2) RETURNING *',
      [uuidv4(), orgName.trim()],
    );
    const org = orgResult.rows[0];

    // 2. Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // 3. Create admin user
    const userResult = await client.query(
      `INSERT INTO users (id, org_id, email, password_hash, role, name)
       VALUES ($1, $2, $3, $4, 'admin', $5) 
       RETURNING id, org_id, email, name, role, created_at`,
      [uuidv4(), org.id, email.toLowerCase().trim(), passwordHash, name || 'Admin'],
    );
    const user = userResult.rows[0];

    await client.query('COMMIT');

    // System Audit: TENANT_CREATE
    await logSystemEvent('TENANT_CREATE', org.name, email, `New organization registered: ${org.name}`);

    // Detailed Audit: TENANT_CREATED
    await logAudit(req, {
      action: 'tenant.created',
      actionType: 'TENANT_CREATED',
      entityType: 'organization',
      entityId: org.id,
      description: `New organization "${org.name}" registered by ${email}`,
      metadata: { orgName, email, name }
    });

    const token = signToken(user);
    res.status(201).json({ token, user });

  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered.' });
    }
    next(err);
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────
//  POST /api/auth/login
// ─────────────────────────────────────────────
router.post('/login', authLimiter, (req, res, next) => {
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      // System Audit: SECURITY_ALERT for failed login
      logSystemEvent('SECURITY_ALERT', 'Platform', req.body.email || 'unknown', `Failed login attempt from ${req.ip}`);
      
      // If we have organization info (passed via info object), log to tenant audit logs
      if (info && info.orgId) {
        req.orgId = info.orgId; // attach for logAudit helper
        logAudit(req, {
          action: 'user.login_failure',
          actionType: 'LOGIN_FAILURE',
          entityType: 'user',
          entityId: info.userId || null,
          description: `Failed login attempt for ${req.body.email || 'unknown'} from ${req.ip}`,
          metadata: { reason: info.message }
        });
      }

      return res.status(401).json({ error: info?.message || 'Unauthorized' });
    }

    const token = signToken(user);

    // System Audit: LOGIN
    logSystemEvent('LOGIN', info?.tenantName || 'Platform', user.email, `User logged in from ${req.ip}`);

    // Detailed Audit: LOGIN_SUCCESS
    req.orgId = user.org_id; // attach for logAudit helper
    logAudit(req, {
      action: 'user.login',
      actionType: 'LOGIN_SUCCESS',
      entityType: 'user',
      entityId: user.id,
      description: `User ${user.email} logged in successfully from ${req.ip}`,
      metadata: { role: user.role }
    });

    res.json({ 
      token, 
      user: { 
        id    : user.id, 
        orgId : user.org_id, 
        email : user.email, 
        name  : user.name,
        role  : user.role 
      } 
    });
  })(req, res, next);
});

// ─────────────────────────────────────────────
//  GET /api/auth/google
// ─────────────────────────────────────────────
router.get('/google', passport.authenticate('google', { 
  session: false, 
  scope: ['profile', 'email'] 
}));

// ─────────────────────────────────────────────
//  GET /api/auth/google/callback
// ─────────────────────────────────────────────
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/api/auth/google/failure' }),
  (req, res) => {
    // If the strategy returned "needsRegistration", we might need a special redirect.
    // However, the prompt says "Finds or creates user... Returns a signed JWT".
    // I'll handle the standard case where the user is found/created.
    
    if (!req.user) {
      return res.status(401).json({ error: 'Google authentication failed.' });
    }

    const token = signToken(req.user);
    const clientUrl = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
    
    // Redirect with token so frontend can store it
    res.redirect(`${clientUrl}/auth/callback?token=${token}`);
  },
);

router.get('/google/failure', (_req, res) => {
  res.status(401).json({ error: 'Google authentication failed.' });
});

// ─────────────────────────────────────────────
//  GET /api/auth/me (sanity check)
// ─────────────────────────────────────────────
router.get(
  '/me',
  passport.authenticate('jwt', { session: false }),
  (req, res) => {
    res.json({ 
      id    : req.user.userId, 
      orgId : req.user.orgId, 
      email : req.user.email, 
      name  : req.user.name,
      role  : req.user.role 
    });
  },
);

module.exports = router;
