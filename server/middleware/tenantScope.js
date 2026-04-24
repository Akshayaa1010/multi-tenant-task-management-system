'use strict';

/**
 * tenantScope Middleware
 * 
 * Extracts the orgId from the authenticated user and attaches it
 * directly to the request object. This ensures all downstream 
 * handlers/services can easily access the current tenant context.
 */
const tenantScope = (req, res, next) => {
  if (!req.user || !req.user.orgId) {
    return res.status(401).json({ error: 'Tenant context missing' });
  }

  req.orgId = req.user.orgId;
  next();
};

module.exports = tenantScope;
