const { Worker } = require("bullmq");
const mongoose = require("mongoose");
const { getRedisConnectionOptions } = require("../../config/queue");
const Product = require("../../modules/products/products.model");
const Stock = require("../../modules/inventory/stock.model");
const User = require("../../modules/auth/auth.model");
const { sendLowStockNotification } = require("./notification.service");
const { addLowStockFollowUpJob } = require("./low-stock.queue");

const QUEUE_NAME = "low-stock-alerts";
let workerInstance = null;

const createLowStockWorker = () => {
  if (workerInstance) {
    return workerInstance;
  }

  workerInstance = new Worker(
    QUEUE_NAME,
    async (job) => {
      // Handler A: Immediate Low-Stock Alert Job
      if (job.name === "process-low-stock-alert") {
        const {
          tenantId,
          branchId,
          productId,
          currentQuantity,
          reorderLevel,
          minimumStock,
        } = job.data;

        // 1. Tenant-scoped Product Lookup
        const product = await Product.findOne({
          _id: productId,
          tenantId: new mongoose.Types.ObjectId(tenantId),
        }).lean();

        if (!product) {
          console.warn(`[BullMQ Worker] Product ${productId} not found for tenant ${tenantId}. Skipping alert.`);
          return { skipped: true, reason: "Product not found" };
        }

        // 2. Tenant-scoped User Lookup for active managers / admins
        const recipients = await User.find({
          tenantId: new mongoose.Types.ObjectId(tenantId),
          isActive: true,
          role: { $in: ["admin", "inventory_manager", "manager"] },
        })
          .select("name email role branchIds")
          .lean();

        const isCritical = currentQuantity <= (minimumStock ?? 0);

        // 3. Dispatch immediate notification
        const result = await sendLowStockNotification({
          tenantId,
          recipients,
          product,
          branchId,
          currentQuantity,
          reorderLevel,
          minimumStock,
          isCritical,
          isFollowUp: false,
        });

        // 4. Schedule delayed follow-up job
        await addLowStockFollowUpJob({
          tenantId,
          branchId,
          productId,
          reorderLevel,
          minimumStock,
        });

        return {
          success: true,
          type: "initial",
          productId,
          productName: product.name,
          recipientsNotified: recipients.length,
          result,
        };
      }

      // Handler B: Delayed Low-Stock Follow-Up / Escalation Job
      if (job.name === "process-low-stock-followup") {
        const {
          tenantId,
          branchId,
          productId,
          reorderLevel,
          minimumStock,
        } = job.data;

        console.log(`[BullMQ] Low-stock follow-up processing for product ${productId} at branch ${branchId}`);

        // 1. Query CURRENT Stock balance directly from MongoDB
        const stock = await Stock.findOne({
          tenantId: new mongoose.Types.ObjectId(tenantId),
          branchId: new mongoose.Types.ObjectId(branchId),
          productId: new mongoose.Types.ObjectId(productId),
        }).lean();

        const currentQuantity = stock ? stock.quantity : 0;
        console.log(`[BullMQ] Current stock checked for product ${productId} at branch ${branchId}: ${currentQuantity} (ReorderLevel: ${reorderLevel})`);

        // 2. Load Tenant-scoped Product
        const product = await Product.findOne({
          _id: productId,
          tenantId: new mongoose.Types.ObjectId(tenantId),
        }).lean();

        if (!product) {
          console.warn(`[BullMQ Worker] Product ${productId} not found for tenant ${tenantId}. Skipping follow-up.`);
          return { skipped: true, reason: "Product not found" };
        }

        const effectiveReorderLevel = product.reorderLevel ?? reorderLevel;
        const effectiveMinimumStock = product.minimumStock ?? minimumStock;

        // 3. Check if stock recovered
        if (currentQuantity > effectiveReorderLevel) {
          console.log(`[BullMQ] Follow-up skipped — stock recovered: current quantity (${currentQuantity}) > reorderLevel (${effectiveReorderLevel}) for product ${product.name}`);
          return {
            skipped: true,
            reason: "Stock recovered",
            currentQuantity,
            reorderLevel: effectiveReorderLevel,
          };
        }

        // 4. Stock is STILL low -> Resolve managers and dispatch escalation
        const recipients = await User.find({
          tenantId: new mongoose.Types.ObjectId(tenantId),
          isActive: true,
          role: { $in: ["admin", "inventory_manager", "manager"] },
        })
          .select("name email role branchIds")
          .lean();

        const isCritical = currentQuantity <= (effectiveMinimumStock ?? 0);

        console.log(`[BullMQ] Follow-up notification dispatched: stock still low (${currentQuantity} <= ${effectiveReorderLevel}) for product ${product.name}`);

        const result = await sendLowStockNotification({
          tenantId,
          recipients,
          product,
          branchId,
          currentQuantity,
          reorderLevel: effectiveReorderLevel,
          minimumStock: effectiveMinimumStock,
          isCritical,
          isFollowUp: true,
        });

        return {
          success: true,
          type: "followup",
          productId,
          productName: product.name,
          currentQuantity,
          recipientsNotified: recipients.length,
          result,
        };
      }

      return { skipped: true, reason: "Unknown job name" };
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 5,
    }
  );

  workerInstance.on("active", (job) => {
    const attempt = (job.attemptsMade || 0) + 1;
    const maxAttempts = job.opts?.attempts || 1;
    console.log(
      `[BullMQ Worker] Job ${job.id} [${job.name}] ACTIVE (Attempt ${attempt}/${maxAttempts}) | Tenant: ${job.data?.tenantId} | Branch: ${job.data?.branchId} | Product: ${job.data?.productId}`
    );
  });

  workerInstance.on("completed", (job, returnvalue) => {
    const attemptsUsed = (job.attemptsMade || 0) + 1;
    const maxAttempts = job.opts?.attempts || 1;
    console.log(
      `[BullMQ Worker] Job ${job.id} [${job.name}] COMPLETED (Attempt ${attemptsUsed}/${maxAttempts}) for product ${returnvalue?.productName || job.data.productId}.`
    );
  });

  workerInstance.on("failed", (job, err) => {
    const attempt = job ? (job.attemptsMade || 0) : 0;
    const maxAttempts = job?.opts?.attempts || 1;
    const isExhausted = attempt >= maxAttempts;

    if (isExhausted) {
      console.error(
        `\n[BullMQ Worker] ❌ Job ${job?.id} [${job?.name}] PERMANENTLY FAILED after ${attempt}/${maxAttempts} attempts.\n` +
        `  Tenant:   ${job?.data?.tenantId}\n` +
        `  Branch:   ${job?.data?.branchId}\n` +
        `  Product:  ${job?.data?.productId}\n` +
        `  Error:    ${err.message}\n` +
        `  Job retained in failed set for inspection.\n`
      );
    } else {
      console.warn(
        `[BullMQ Worker] ⚠️ Job ${job?.id} [${job?.name}] FAILED on attempt ${attempt}/${maxAttempts}. Backoff retry scheduled. Reason: ${err.message}`
      );
    }
  });

  workerInstance.on("error", (err) => {
    console.error("[BullMQ Worker] Unexpected worker error:", err.message);
  });

  return workerInstance;
};

module.exports = {
  createLowStockWorker,
};
