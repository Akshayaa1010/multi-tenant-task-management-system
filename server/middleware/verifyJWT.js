'use strict';

const jwt = require('jsonwebtoken');

/**
 * verifyJWT Middleware
 * 
 * 1. Extracts the Bearer token from the Authorization header.
 * 2. Verifies the token using JWT_SECRET.
 * 3. Attaches the decoded user payload to req.user.
 */
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user identity to request object
    req.user = {
      userId : decoded.userId,
      orgId  : decoded.orgId,
      role   : decoded.role,
      name   : decoded.name,
      email  : decoded.email
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = verifyJWT;
