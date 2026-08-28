/**
 * Restrict a route to one or more user roles.
 *
 * Use this after the `authenticate` middleware, which sets `req.user` from
 * the JWT payload.
 *
 * Example:
 * router.delete("/:id", authenticate, authorizeRoles("admin"), removeUser);
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }

    next();
  };
};

module.exports = authorizeRoles;
