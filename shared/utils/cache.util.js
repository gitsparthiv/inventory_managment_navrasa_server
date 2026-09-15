const redis = require("../../config/redis");

/**
 * Invalidate affected dashboard cache keys after successful mutations.
 * Handles both tenant-wide and branch-specific keys, or multiple branches if specified.
 *
 * @param {string|ObjectId} tenantId - Tenant identifier
 * @param {string|ObjectId|Array<string|ObjectId>} [branchIds] - Single branch ID or array of branch IDs
 */
const invalidateDashboardCache = async (tenantId, branchIds) => {
  try {
    if (!tenantId) return;

    const keysToDelete = [`inventory:dashboard:tenant:${tenantId}:all`];

    if (branchIds) {
      const branches = Array.isArray(branchIds) ? branchIds : [branchIds];
      branches.forEach((branchId) => {
        if (branchId) {
          keysToDelete.push(`inventory:dashboard:tenant:${tenantId}:branch:${branchId}`);
        }
      });
    }

    await redis.del(...keysToDelete);
  } catch (err) {
    console.warn("Redis dashboard cache invalidation error:", err.message);
  }
};

module.exports = {
  invalidateDashboardCache,
};
