const { Worker } = require("bullmq");
const mongoose = require("mongoose");
const { getRedisConnectionOptions } = require("../../config/queue");
const { getInventoryReport } = require("../../modules/reporting/reporting.service");

const QUEUE_NAME = "scheduled-reports";
let workerInstance = null;

const createScheduledReportWorker = () => {
  if (workerInstance) {
    return workerInstance;
  }

  workerInstance = new Worker(
    QUEUE_NAME,
    async (job) => {
      const startTime = performance.now();
      const {
        tenantId,
        reportType,
        branchId,
        filters = {},
      } = job.data;

      // 1. Tenant Context Validation
      if (!tenantId || !mongoose.isValidObjectId(tenantId)) {
        throw new Error(`Invalid or missing tenantId in report job payload: ${tenantId}`);
      }

      console.log(
        `[BullMQ Scheduled Report Worker] Processing report "${reportType}" for tenant ${tenantId}${branchId ? ` (Branch: ${branchId})` : ""}`
      );

      // 2. Dispatch to Existing Reporting Logic based on Report Type
      let reportResult;

      switch (reportType) {
        case "daily-inventory":
        case "inventory": {
          const reportFilters = {
            ...filters,
            branchId: branchId || filters.branchId,
            page: 1,
            limit: filters.limit || 1000,
          };

          // Calls the EXISTING reporting service aggregation pipeline
          reportResult = await getInventoryReport(tenantId, reportFilters);
          break;
        }

        default:
          throw new Error(`Unsupported scheduled report type: "${reportType}"`);
      }

      const durationMs = (performance.now() - startTime).toFixed(2);

      // 3. Log / Output Structured Report Generation Summary
      console.log(
        `\n================================================================================\n` +
        `📊 [SCHEDULED REPORT GENERATED SUCCESSFULLY]\n` +
        `================================================================================\n` +
        `Report Type:           ${reportType.toUpperCase()}\n` +
        `Tenant ID:             ${tenantId}\n` +
        `Branch ID:             ${branchId || "All Branches"}\n` +
        `Total Products:        ${reportResult.summary?.totalRecords ?? 0}\n` +
        `Total Stock Units:     ${reportResult.summary?.totalStockQuantity ?? 0}\n` +
        `Total Cost Valuation:  $${reportResult.summary?.totalCostValuation ?? 0}\n` +
        `Total Retail Value:    $${reportResult.summary?.totalRetailValuation ?? 0}\n` +
        `Low Stock Items:       ${reportResult.summary?.lowStockCount ?? 0}\n` +
        `Execution Duration:    ${durationMs}ms\n` +
        `Generated At:          ${new Date().toISOString()}\n` +
        `================================================================================\n`
      );

      return {
        success: true,
        reportType,
        tenantId,
        branchId,
        summary: reportResult.summary,
        totalItems: reportResult.data?.length ?? 0,
        durationMs: Number(durationMs),
      };
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 3,
    }
  );

  workerInstance.on("active", (job) => {
    const attempt = (job.attemptsMade || 0) + 1;
    const maxAttempts = job.opts?.attempts || 1;
    console.log(
      `[BullMQ Scheduled Report Worker] Job ${job.id} [${job.name}] ACTIVE (Attempt ${attempt}/${maxAttempts}) | Tenant: ${job.data?.tenantId} | Report: ${job.data?.reportType}`
    );
  });

  workerInstance.on("completed", (job, returnvalue) => {
    const attemptsUsed = (job.attemptsMade || 0) + 1;
    const maxAttempts = job.opts?.attempts || 1;
    console.log(
      `[BullMQ Scheduled Report Worker] Job ${job.id} [${job.name}] COMPLETED (Attempt ${attemptsUsed}/${maxAttempts}) in ${returnvalue?.durationMs}ms | Items: ${returnvalue?.totalItems}`
    );
  });

  workerInstance.on("failed", (job, err) => {
    const attempt = job ? (job.attemptsMade || 0) : 0;
    const maxAttempts = job?.opts?.attempts || 1;
    const isExhausted = attempt >= maxAttempts;

    if (isExhausted) {
      console.error(
        `\n[BullMQ Scheduled Report Worker] ❌ Job ${job?.id} [${job?.name}] PERMANENTLY FAILED after ${attempt}/${maxAttempts} attempts.\n` +
        `  Tenant:      ${job?.data?.tenantId}\n` +
        `  Report Type: ${job?.data?.reportType}\n` +
        `  Error:       ${err.message}\n` +
        `  Job retained in failed set for inspection.\n`
      );
    } else {
      console.warn(
        `[BullMQ Scheduled Report Worker] ⚠️ Job ${job?.id} [${job?.name}] FAILED on attempt ${attempt}/${maxAttempts}. Backoff retry scheduled. Reason: ${err.message}`
      );
    }
  });

  workerInstance.on("error", (err) => {
    console.error("[BullMQ Scheduled Report Worker] Unexpected worker error:", err.message);
  });

  return workerInstance;
};

module.exports = {
  createScheduledReportWorker,
};
