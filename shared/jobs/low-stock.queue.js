const { Queue } = require("bullmq");
const { getRedisConnectionOptions } = require("../../config/queue");

const QUEUE_NAME = "low-stock-alerts";

// Initialize BullMQ Queue with connection options and job retention settings
const lowStockQueue = new Queue(QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000, // 2s, 4s, 8s retries on transient errors
    },
    removeOnComplete: {
      age: 86400, // Retain completed jobs for 24 hours (86400s)
      count: 500,  // Keep up to 500 latest completed jobs for audit
    },
    removeOnFail: {
      age: 604800, // Retain failed jobs for 7 days (604800s) for debugging
      count: 1000,
    },
  },
});

/**
 * Enqueue a low-stock alert background job.
 * Uses deterministic jobId format: low-stock:{tenantId}:{branchId}:{productId}:{YYYY-MM-DD}
 * to automatically prevent multiple identical alert jobs on the same day for the same product at the same branch.
 */
const addLowStockAlertJob = async ({
  tenantId,
  branchId,
  productId,
  currentQuantity,
  reorderLevel,
  minimumStock,
}) => {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const jobId = `low-stock_${tenantId}_${branchId}_${productId}_${today}`;

    const job = await lowStockQueue.add(
      "process-low-stock-alert",
      {
        tenantId: tenantId.toString(),
        branchId: branchId.toString(),
        productId: productId.toString(),
        currentQuantity,
        reorderLevel,
        minimumStock,
        detectedAt: new Date().toISOString(),
      },
      {
        jobId, // Deterministic deduplication key
      }
    );

    return job;
  } catch (err) {
    console.warn("BullMQ low-stock alert enqueue warning:", err.message);
    return null;
  }
};

module.exports = {
  lowStockQueue,
  addLowStockAlertJob,
};
