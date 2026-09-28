const { Queue } = require("bullmq");
const { getRedisConnectionOptions } = require("../../config/queue");

const QUEUE_NAME = "scheduled-reports";

/**
 * Scheduled Reports Queue
 * Handles scheduled / recurring reporting generation jobs for multi-tenant analytics.
 */
const scheduledReportQueue = new Queue(QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: Number(process.env.QUEUE_MAX_ATTEMPTS) || 4,
    backoff: {
      type: "exponential",
      delay: Number(process.env.QUEUE_BACKOFF_DELAY_MS) || (process.env.NODE_ENV === "production" ? 5000 : 1000),
    },
    removeOnComplete: {
      age: Number(process.env.QUEUE_REMOVE_ON_COMPLETE_AGE_SEC) || 86400,
      count: Number(process.env.QUEUE_REMOVE_ON_COMPLETE_COUNT) || 500,
    },
    removeOnFail: {
      age: Number(process.env.QUEUE_REMOVE_ON_FAIL_AGE_SEC) || 604800,
      count: Number(process.env.QUEUE_REMOVE_ON_FAIL_COUNT) || 1000,
    },
  },
});

/**
 * Enqueue a one-off / ad-hoc report generation job.
 */
const addReportJob = async ({
  tenantId,
  reportType,
  branchId = null,
  filters = {},
}) => {
  try {
    const job = await scheduledReportQueue.add(
      `generate-${reportType}-report`,
      {
        tenantId: tenantId.toString(),
        reportType,
        branchId: branchId ? branchId.toString() : null,
        filters,
        requestedAt: new Date().toISOString(),
      }
    );

    return job;
  } catch (err) {
    console.warn(`[BullMQ Scheduled Reports] Enqueue warning for ${reportType}:`, err.message);
    return null;
  }
};

/**
 * Upsert a recurring scheduled report for a tenant.
 * Uses BullMQ 6.x upsertJobScheduler API.
 */
const scheduleRecurringReport = async ({
  tenantId,
  branchId = null,
  reportType = "daily-inventory",
  cronPattern = process.env.SCHEDULED_INVENTORY_REPORT_CRON || "0 0 * * *",
  every = null,
  filters = {},
}) => {
  try {
    const branchKey = branchId ? `_branch_${branchId}` : "";
    const schedulerId = `scheduler_${reportType}_tenant_${tenantId}${branchKey}`;

    const repeatOpts = every
      ? { every }
      : { pattern: cronPattern };

    const scheduler = await scheduledReportQueue.upsertJobScheduler(
      schedulerId,
      repeatOpts,
      {
        name: `scheduled-${reportType}-report`,
        data: {
          tenantId: tenantId.toString(),
          reportType,
          branchId: branchId ? branchId.toString() : null,
          filters,
          scheduledAt: new Date().toISOString(),
        },
        opts: {
          attempts: Number(process.env.QUEUE_MAX_ATTEMPTS) || 4,
          backoff: {
            type: "exponential",
            delay: Number(process.env.QUEUE_BACKOFF_DELAY_MS) || (process.env.NODE_ENV === "production" ? 5000 : 1000),
          },
        },
      }
    );

    console.log(
      `[BullMQ] Recurring report scheduler upserted: ${schedulerId} (${every ? `every ${every}ms` : `cron: ${cronPattern}`})`
    );

    return scheduler;
  } catch (err) {
    console.error(`[BullMQ] Failed to upsert recurring report scheduler:`, err.message);
    throw err;
  }
};

module.exports = {
  scheduledReportQueue,
  addReportJob,
  scheduleRecurringReport,
};
