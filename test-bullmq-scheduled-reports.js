/**
 * Automated Verification Suite for BullMQ Scheduled Reports Workflow
 */
require("dotenv").config();

process.env.QUEUE_MAX_ATTEMPTS = "3";
process.env.QUEUE_BACKOFF_DELAY_MS = "1000";

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const redis = require("./config/redis");
const Product = require("./modules/products/products.model");
const Stock = require("./modules/inventory/stock.model");
const StockMovement = require("./modules/inventory/stock-movement.model");
const { getInventoryReport } = require("./modules/reporting/reporting.service");
const {
  scheduledReportQueue,
  addReportJob,
  scheduleRecurringReport,
} = require("./shared/jobs/scheduled-reports.queue");
const { createScheduledReportWorker } = require("./shared/jobs/scheduled-reports.worker");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runSuite = async () => {
  console.log("================================================================================");
  console.log("🚀 STARTING BULLMQ SCHEDULED INVENTORY REPORTS TEST SUITE");
  console.log("================================================================================");

  await connectDB();
  await redis.connect();
  const worker = createScheduledReportWorker();

  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const branchA1 = new mongoose.Types.ObjectId();
  const branchA2 = new mongoose.Types.ObjectId();
  const branchB = new mongoose.Types.ObjectId();

  try {
    const productA1 = await Product.create({
      name: "Tenant A Product 1 (Milk)",
      sku: `SKU-A1-${Date.now()}`,
      unit: "liters",
      costPrice: 40,
      sellingPrice: 60,
      minimumStock: 5,
      reorderLevel: 10,
      status: "active",
      tenantId: tenantA,
    });

    const productA2 = await Product.create({
      name: "Tenant A Product 2 (Butter)",
      sku: `SKU-A2-${Date.now()}`,
      unit: "kg",
      costPrice: 200,
      sellingPrice: 280,
      minimumStock: 10,
      reorderLevel: 15,
      status: "active",
      tenantId: tenantA,
    });

    await Stock.create({
      tenantId: tenantA,
      branchId: branchA1,
      productId: productA1._id,
      quantity: 50,
    });

    await Stock.create({
      tenantId: tenantA,
      branchId: branchA2,
      productId: productA2._id,
      quantity: 20,
    });

    const productB = await Product.create({
      name: "Tenant B Product (Confidential Saffron)",
      sku: `SKU-B-${Date.now()}`,
      unit: "grams",
      costPrice: 5000,
      sellingPrice: 8000,
      minimumStock: 2,
      reorderLevel: 5,
      status: "active",
      tenantId: tenantB,
    });

    await Stock.create({
      tenantId: tenantB,
      branchId: branchB,
      productId: productB._id,
      quantity: 100,
    });

    console.log("[SETUP COMPLETE] Multi-tenant test products and branch stock records created.\n");

    console.log("--- [TEST 1] Scheduler Upsert & Idempotency (Duplicate Prevention) ---");
    await scheduleRecurringReport({
      tenantId: tenantA,
      reportType: "daily-inventory",
      cronPattern: "0 0 * * *",
    });

    await scheduleRecurringReport({
      tenantId: tenantA,
      reportType: "daily-inventory",
      cronPattern: "0 0 * * *",
    });

    const schedulers = await scheduledReportQueue.getJobSchedulers();
    const expectedKey = `scheduler_daily-inventory_tenant_${tenantA}`;
    const tenantASchedulers = schedulers.filter((s) => s.key === expectedKey || s.name === expectedKey || s.id === expectedKey);

    console.log(`[TEST 1 RESULT] Schedulers for Tenant A: ${tenantASchedulers.length} (Expected exactly 1)`);
    if (tenantASchedulers.length !== 1) {
      throw new Error(`Idempotency check failed: expected 1 scheduler instance but found ${tenantASchedulers.length}`);
    }

    console.log("\n--- [TEST 2] Processing Scheduled Daily Inventory Report (Tenant A) ---");
    const jobA = await addReportJob({
      tenantId: tenantA,
      reportType: "daily-inventory",
    });

    console.log(`Job ${jobA.id} enqueued. Waiting 2000ms for worker to process...`);
    await sleep(2000);

    const jobAState = await jobA.getState();
    const jobAResult = jobA.returnvalue;

    console.log(`[TEST 2 RESULT] Job State: ${jobAState}`);
    console.log(`[TEST 2 RESULT] Total Valuation: $${jobAResult?.summary?.totalCostValuation} (Expected: $6000)`);
    console.log(`[TEST 2 RESULT] Total Stock Units: ${jobAResult?.summary?.totalStockQuantity} (Expected: 70)`);

    if (jobAState !== "completed") {
      throw new Error(`Test 2 failed: expected job state 'completed' but got '${jobAState}'`);
    }
    if (jobAResult?.summary?.totalCostValuation !== 6000) {
      throw new Error(`Test 2 calculation mismatch: expected 6000, got ${jobAResult?.summary?.totalCostValuation}`);
    }

    console.log("\n--- [TEST 3] Multi-Tenant Isolation Verification ---");
    const jobB = await addReportJob({
      tenantId: tenantB,
      reportType: "daily-inventory",
    });

    await sleep(2000);
    const jobBResult = jobB.returnvalue;

    console.log(`[TEST 3 AUDIT] Tenant B Report Valuation: $${jobBResult?.summary?.totalCostValuation} (Expected: $500000)`);
    console.log(`[TEST 3 AUDIT] Tenant B Items Count: ${jobBResult?.totalItems} (Expected: 1)`);

    if (jobBResult?.summary?.totalCostValuation !== 500000 || jobBResult?.totalItems !== 1) {
      throw new Error("Tenant isolation failed! Tenant B report has incorrect cross-tenant or missing data.");
    }

    console.log("\n--- [TEST 4] Branch Scoping Filter ---");
    const jobBranch = await addReportJob({
      tenantId: tenantA,
      branchId: branchA1,
      reportType: "daily-inventory",
    });

    await sleep(2000);
    const branchResult = jobBranch.returnvalue;

    console.log(`[TEST 4 AUDIT] Branch A1 Valuation: $${branchResult?.summary?.totalCostValuation} (Expected: $2000 for Milk only)`);
    console.log(`[TEST 4 AUDIT] Branch A1 Units: ${branchResult?.summary?.totalStockQuantity} (Expected: 50)`);

    if (branchResult?.summary?.totalCostValuation !== 2000 || branchResult?.summary?.totalStockQuantity !== 50) {
      throw new Error("Branch scoping failed! Valuation did not match expected branch subset.");
    }

    console.log("\n--- [TEST 5] Non-Mutation Verification (Reporting Never Modifies Stock) ---");
    const stockCheckA1 = await Stock.findOne({ tenantId: tenantA, branchId: branchA1, productId: productA1._id });
    const stockMovements = await StockMovement.find({ tenantId: { $in: [tenantA, tenantB] } });

    console.log(`[TEST 5 AUDIT] Stock A1 Quantity: ${stockCheckA1.quantity} (Must remain 50)`);
    console.log(`[TEST 5 AUDIT] Total Stock Movement Mutations: ${stockMovements.length} (Must remain 0)`);

    if (stockCheckA1.quantity !== 50 || stockMovements.length !== 0) {
      throw new Error("Non-mutation guarantee violated! Stock balance or movements were altered by report worker.");
    }

    await scheduledReportQueue.removeJobScheduler(`scheduler_daily-inventory_tenant_${tenantA}`);
    await Stock.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    await Product.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });

    console.log("\n================================================================================");
    console.log("🎉 ALL BULLMQ SCHEDULED REPORTS TESTS PASSED WITH 100% SUCCESS!");
    console.log("================================================================================");
  } catch (err) {
    console.error("\n❌ Test Suite Encountered Error:", err);
    process.exitCode = 1;
  } finally {
    await worker.close();
    await scheduledReportQueue.close();
    await redis.quit();
    await mongoose.disconnect();
    process.exit(process.exitCode || 0);
  }
};

runSuite();
