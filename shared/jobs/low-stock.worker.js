const { Worker } = require("bullmq");
const mongoose = require("mongoose");
const { getRedisConnectionOptions } = require("../../config/queue");
const Product = require("../../modules/products/products.model");
const User = require("../../modules/auth/auth.model");
const { sendLowStockNotification } = require("./notification.service");

const QUEUE_NAME = "low-stock-alerts";
let workerInstance = null;

const createLowStockWorker = () => {
  if (workerInstance) {
    return workerInstance;
  }

  workerInstance = new Worker(
    QUEUE_NAME,
    async (job) => {
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

      // 3. Dispatch notification
      const result = await sendLowStockNotification({
        tenantId,
        recipients,
        product,
        branchId,
        currentQuantity,
        reorderLevel,
        minimumStock,
        isCritical,
      });

      return {
        success: true,
        productId,
        productName: product.name,
        recipientsNotified: recipients.length,
        result,
      };
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 5,
    }
  );

  workerInstance.on("completed", (job, returnvalue) => {
    console.log(`[BullMQ Worker] Low-stock alert job ${job.id} completed successfully for product ${returnvalue?.productName || job.data.productId}.`);
  });

  workerInstance.on("failed", (job, err) => {
    console.error(`[BullMQ Worker] Low-stock alert job ${job?.id} failed:`, err.message);
  });

  workerInstance.on("error", (err) => {
    console.error("[BullMQ Worker] Worker error:", err.message);
  });

  return workerInstance;
};

module.exports = {
  createLowStockWorker,
};
