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

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // 1. Real JWT takes first priority
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      return next();
    }

    // 2. Development/Testing Authentication Bypass (Only allowed when NODE_ENV !== 'production')
    if (process.env.NODE_ENV !== "production") {
      const testTenantId = req.headers["x-test-tenant-id"];
      const testUserId = req.headers["x-test-user-id"];
      const testRole = req.headers["x-test-role"];
      const testBranchId = req.headers["x-test-branch-id"];

      // If at least one dev test header is supplied, attempt bypass authentication
      if (testTenantId || testUserId || testRole) {
        if (!testTenantId || !mongoose.Types.ObjectId.isValid(testTenantId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid or missing x-test-tenant-id header. Must be a valid ObjectId.",
          });
        }

        if (!testUserId || !mongoose.Types.ObjectId.isValid(testUserId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid or missing x-test-user-id header. Must be a valid ObjectId.",
          });
        }

        if (!testRole || !VALID_ROLES.includes(testRole)) {
          return res.status(400).json({
            success: false,
            message: `Invalid or missing x-test-role header. Must be one of: ${VALID_ROLES.join(", ")}.`,
          });
        }

        if (testBranchId && !mongoose.Types.ObjectId.isValid(testBranchId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid x-test-branch-id header. Must be a valid ObjectId.",
          });
        }

        // Construct req.user matching the exact JWT decoded shape
        req.user = {
          userId: testUserId,
          role: testRole,
          tenantId: testTenantId,
          ...(testBranchId && { branchId: testBranchId }),
        };

        return next();
      }
    }

    // 3. Reject if neither JWT nor valid dev headers are present
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = authenticate;
