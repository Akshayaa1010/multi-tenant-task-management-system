'use strict';

const rateLimit = require('express-rate-limit');

// ─────────────────────────────────────────────
//  Global Rate Limiter
//
//  Applied to every request in server.js.
//  More restrictive limiters (e.g. for /api/auth)
//  can be created using createLimiter() and
//  mounted directly on those routers.
// ─────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs          : 15 * 60 * 1000, // 15-minute sliding window
  max               : 1000,           // requests per window per IP (increased for dashboard polling)
  standardHeaders   : true,           // Return RateLimit-* headers (RFC 6585)
  legacyHeaders     : false,          // Disable deprecated X-RateLimit-* headers
  message           : {
    error: 'Too many requests. Please try again in a few minutes.',
  },
  skip: (req) => {
    // Never rate-limit health checks
    return req.path === '/health';
  },
});

// ─────────────────────────────────────────────
//  createLimiter  — factory for stricter limiters
//
//  Usage in a router:
//    const authLimiter = createLimiter({ max: 10 });
//    router.post('/login', authLimiter, handler);
// ─────────────────────────────────────────────
function createLimiter(options = {}) {
  return rateLimit({
    windowMs      : options.windowMs || 15 * 60 * 1000,
    max           : options.max      || 50,
    standardHeaders: true,
    legacyHeaders  : false,
    message       : options.message  || {
      error: 'Too many requests for this endpoint. Please slow down.',
    },
  });
}

module.exports = globalLimiter;
module.exports.createLimiter = createLimiter;
