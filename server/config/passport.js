'use strict';

const passport           = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { Strategy: GoogleStrategy }           = require('passport-google-oauth20');
const { Strategy: LocalStrategy }            = require('passport-local');
const bcrypt             = require('bcryptjs');
const { query, getClient } = require('./db');
const { v4: uuidv4 }      = require('uuid');

// ─────────────────────────────────────────────
//  Passport Configuration
//
//  Three strategies are wired up:
//    1. Local    — email + password (native login)
//    2. JWT      — stateless Bearer token auth
//    3. Google   — OAuth 2.0 via passport-google-oauth20
// ─────────────────────────────────────────────

// ── 1. Local Strategy ─────────────────────────
passport.use(
  new LocalStrategy(
    { 
      usernameField: 'email', 
      passwordField: 'password',
      passReqToCallback: true 
    },
    async (req, email, password, done) => {
      try {
        const { username } = req.body;

        if (!username) {
          return done(null, false, { message: 'Username is required.' });
        }

        const { rows } = await query(
          'SELECT * FROM users WHERE email = $1 LIMIT 1',
          [email.toLowerCase().trim()],
        );

        const user = rows[0];
        if (!user) {
          return done(null, false, { message: 'Invalid credentials.' });
        }

        // 1. Verify Username matches name in DB (case-insensitive)
        if (!user.name || user.name.toLowerCase() !== username.trim().toLowerCase()) {
          console.log(`[Auth] Username mismatch for ${email}. Expected: "${user.name}", Got: "${username}"`);
          return done(null, false, { message: 'Invalid credentials.' });
        }

        if (!user.password_hash) {
          // Account registered via OAuth — no local password set
          return done(null, false, { message: 'Please sign in with your OAuth provider.' });
        }

        // 2. Verify Password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
          console.log(`[Auth] Password mismatch for ${email}.`);
          return done(null, false, { message: 'Invalid credentials.' });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    },
  ),
);

// ── 2. JWT Strategy ───────────────────────────
passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey   : process.env.JWT_SECRET,
      algorithms    : ['HS256'],
    },
    async (payload, done) => {
      try {
        const { rows } = await query(
          'SELECT id, org_id, email, name, role FROM users WHERE id = $1 LIMIT 1',
          [payload.userId],
        );

        const user = rows[0];
        if (!user) return done(null, false);

        // Return consistent keys
        return done(null, {
          userId: user.id,
          orgId:  user.org_id,
          email:  user.email,
          name:   user.name,
          role:   user.role
        });
      } catch (err) {
        return done(err);
      }
    },
  ),
);

// ── 3. Google OAuth 2.0 Strategy ─────────────
passport.use(
  new GoogleStrategy(
    {
      clientID    : process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Callback URL must match the one registered in Google Cloud Console
      callbackURL : process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',
      scope       : ['profile', 'email'],
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email        = profile.emails?.[0]?.value?.toLowerCase();
        const providerId   = profile.id;

        if (!email) {
          return done(new Error('Google account has no email address.'));
        }

        // 1. Check if this OAuth identity already exists
        const { rows: existingLinks } = await query(
          `SELECT u.* FROM oauth_providers op
             JOIN users u ON u.id = op.user_id
            WHERE op.provider = 'google'
              AND op.provider_user_id = $1
            LIMIT 1`,
          [providerId],
        );

        if (existingLinks.length) {
          return done(null, existingLinks[0]);
        }

        // 2. Check if a user with this email already exists (link accounts)
        const { rows: existingUsers } = await query(
          'SELECT * FROM users WHERE email = $1 LIMIT 1',
          [email],
        );

        let user = existingUsers[0];

        if (!user) {
          // 3. Auto-provision a new user & organization
          // We'll create a "Personal" organization for now.
          const client = await getClient();
          try {
            await client.query('BEGIN');
            
            const orgTitle = `${profile.displayName || 'Personal'}'s Org`;
            const orgId = uuidv4();
            await client.query(
              'INSERT INTO organizations (id, name) VALUES ($1, $2)',
              [orgId, orgTitle]
            );

            const userId = uuidv4();
            const userResult = await client.query(
              `INSERT INTO users (id, org_id, email, role)
               VALUES ($1, $2, $3, 'admin') RETURNING *`,
              [userId, orgId, email]
            );
            user = userResult.rows[0];

            await client.query(
              `INSERT INTO oauth_providers (user_id, provider, provider_user_id)
               VALUES ($1, 'google', $2)`,
              [user.id, providerId]
            );

            await client.query('COMMIT');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        } else {
          // 4. Link this Google identity to the existing user
          await query(
            `INSERT INTO oauth_providers (user_id, provider, provider_user_id)
             VALUES ($1, 'google', $2)
             ON CONFLICT (provider, provider_user_id) DO NOTHING`,
            [user.id, providerId],
          );
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    },
  ),
);

// ── Session serialization (not used with JWT, but
//    required by Passport internals when initialized) ──
passport.serializeUser((user, done)   => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, rows[0] || null);
  } catch (err) {
    done(err);
  }
});

// ─────────────────────────────────────────────
//  initPassport
//  Called in server.js to attach passport middleware.
// ─────────────────────────────────────────────
function initPassport(app) {
  app.use(passport.initialize());
  // NOTE: passport.session() is intentionally omitted —
  // this API is stateless (JWT). Sessions are only
  // needed for the OAuth redirect dance.
}

module.exports = { initPassport, passport };
