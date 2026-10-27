const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const VALID_ROLES = [
  "admin",
  "inventory_manager",
  "purchase_staff",
  "branch_staff",
  "manager",
  "viewer",
];

/**
 * Socket.IO Authentication Middleware
 * Validates JWT from handshake auth token or authorization header.
 * In development, also supports test bypass headers for automated tests.
 */
const socketAuthMiddleware = (socket, next) => {
  try {
    const auth = socket.handshake.auth || {};
    const headers = socket.handshake.headers || {};

    // 1. Extract Bearer token from auth payload or headers
    let rawToken = auth.token || headers.authorization || headers.token;
    if (rawToken && rawToken.startsWith("Bearer ")) {
      rawToken = rawToken.slice(7).trim();
    }

    if (rawToken) {
      try {
        const decoded = jwt.verify(rawToken, process.env.JWT_SECRET);
        socket.user = {
          userId: decoded.id || decoded.userId,
          email: decoded.email,
          role: decoded.role,
          tenantId: decoded.tenantId,
          branchIds: decoded.branchIds || (decoded.branchId ? [decoded.branchId] : []),
        };
        return next();
      } catch (err) {
        return next(new Error("Authentication error: Invalid or expired token"));
      }
    }

    // 2. Development/Testing Authentication Bypass (Only when NODE_ENV !== 'production')
    if (process.env.NODE_ENV !== "production") {
      const testTenantId = auth["x-test-tenant-id"] || headers["x-test-tenant-id"];
      const testUserId = auth["x-test-user-id"] || headers["x-test-user-id"];
      const testRole = auth["x-test-role"] || headers["x-test-role"];
      const testBranchId = auth["x-test-branch-id"] || headers["x-test-branch-id"];

      if (testTenantId || testUserId || testRole) {
        if (!testTenantId || !mongoose.Types.ObjectId.isValid(testTenantId)) {
          return next(new Error("Authentication error: Invalid or missing x-test-tenant-id"));
        }

        if (!testUserId || !mongoose.Types.ObjectId.isValid(testUserId)) {
          return next(new Error("Authentication error: Invalid or missing x-test-user-id"));
        }

        if (!testRole || !VALID_ROLES.includes(testRole)) {
          return next(new Error(`Authentication error: Invalid x-test-role. Must be one of: ${VALID_ROLES.join(", ")}`));
        }

        if (testBranchId && !mongoose.Types.ObjectId.isValid(testBranchId)) {
          return next(new Error("Authentication error: Invalid x-test-branch-id"));
        }

        socket.user = {
          userId: testUserId,
          role: testRole,
          tenantId: testTenantId,
          branchIds: testBranchId ? [testBranchId] : [],
        };

        return next();
      }
    }

    // 3. Reject if no valid credentials provided
    return next(new Error("Authentication error: Authentication token required"));
  } catch (error) {
    return next(new Error("Authentication error: " + error.message));
  }
};

module.exports = {
  socketAuthMiddleware,
};

