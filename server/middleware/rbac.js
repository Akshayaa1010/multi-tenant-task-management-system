'use strict';

/**
 * RBAC (Role-Based Access Control) Middleware
 * 
 * @param {...string} allowedRoles - List of roles permitted to access the route.
 * @returns {Function} Middleware function that validates req.user.role.
 * 
 * Usage: router.delete('/tasks/:id', checkRole('admin', 'manager'), handler);
 */
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Access denied. Role '${req.user.role}' does not have sufficient permissions.` 
      });
    }

    next();
  };
};

module.exports = {
  checkRole
};
