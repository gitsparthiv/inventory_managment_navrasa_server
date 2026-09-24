/**
 * Automated Verification Suite for BullMQ Retries, Exponential Backoff, and Failed Job Handling
 *
 * Tests:
 * TEST A: Successful First Attempt (Normal execution, attempt 1 -> SUCCESS, no retry)
 * TEST B: Temporary Failure -> Exponential Backoff Retry -> Success (Attempt 1 Fail -> Backoff -> Attempt 2 Success)
 * TEST C: Permanent Failure -> Max Attempts Exhausted -> Retained in Failed Set for Audit
 * TEST D: Delayed Follow-Up Failure -> Follow-up job executes retry policy after becoming active
 * TEST E: Transaction Isolation -> Unrelated background worker failure NEVER rolls back or modifies committed MongoDB stock/movement
 */
require("dotenv").config();

// Configure fast retry and backoff parameters for test environment
process.env.QUEUE_MAX_ATTEMPTS = "3";
process.env.QUEUE_BACKOFF_DELAY_MS = "1000"; // 1s base -> 1s, 2s exponential backoff
process.env.LOW_STOCK_FOLLOWUP_DELAY_MS = "2000"; // 2s follow-up delay

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const redis = require("./config/redis");
const Product = require("./modules/products/products.model");
const Stock = require("./modules/inventory/stock.model");
const StockMovement = require("./modules/inventory/stock-movement.model");
const User = require("./modules/auth/auth.model");
const { createAdjustment } = require("./modules/inventory/inventory.service");
const { createLowStockWorker } = require("./shared/jobs/low-stock.worker");
const { lowStockQueue } = require("./shared/jobs/low-stock.queue");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runSuite = async () => {
  console.log("================================================================================");
  console.log("🚀 STARTING BULLMQ RETRIES, BACKOFF & FAILURE HANDLING TEST SUITE");
  console.log("================================================================================");

  await connectDB();
  await redis.connect();
  const worker = createLowStockWorker();

  const tenantId = new mongoose.Types.ObjectId();
  const branchId = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();

  try {
    // Setup Manager
    const manager = await User.create({
      name: "Test Manager",
      email: `retry_mgr_${Date.now()}@navrasa.test`,
      password: "hashedpassword123",
      role: "manager",
      tenantId,
      branchIds: [branchId],
      isActive: true,
    });

    // Setup Test Products
    const productA = await Product.create({
      name: "Product Test A (Success First Attempt)",
      sku: `SKU-A-${Date.now()}`,
      unit: "pcs",
      costPrice: 50,
      sellingPrice: 100,
      minimumStock: 5,
      reorderLevel: 10,
      status: "active",
      tenantId,
    });

    const productB = await Product.create({
      name: "Product Test B (Transient Failure -> Retry -> Success)",
      sku: `SKU-B-${Date.now()}`,
      unit: "pcs",
      costPrice: 50,
      sellingPrice: 100,
      minimumStock: 5,
      reorderLevel: 10,
      status: "active",
      tenantId,
    });

    const productC = await Product.create({
      name: "Product Test C (Permanent Failure)",
      sku: `SKU-C-${Date.now()}`,
      unit: "pcs",
      costPrice: 50,
      sellingPrice: 100,
      minimumStock: 5,
      reorderLevel: 10,
      status: "active",
      tenantId,
    });

    const productD = await Product.create({
      name: "Product Test D (Delayed Follow-Up Retry)",
      sku: `SKU-D-${Date.now()}`,
      unit: "pcs",
      costPrice: 50,
      sellingPrice: 100,
      minimumStock: 5,
      reorderLevel: 10,
      status: "active",
      tenantId,
    });

    const productE = await Product.create({
      name: "Product Test E (Stock Isolation Verification)",
      sku: `SKU-E-${Date.now()}`,
      unit: "pcs",
      costPrice: 50,
      sellingPrice: 100,
      minimumStock: 5,
      reorderLevel: 10,
      status: "active",
      tenantId,
    });

    await Stock.create({
      tenantId,
      branchId,
      productId: productA._id,
      quantity: 20,
    });

    await Stock.create({
      tenantId,
      branchId,
      productId: productB._id,
      quantity: 20,
    });

    await Stock.create({
      tenantId,
      branchId,
      productId: productC._id,
      quantity: 20,
    });

    await Stock.create({
      tenantId,
      branchId,
      productId: productD._id,
      quantity: 5, // already low
    });

    await Stock.create({
      tenantId,
      branchId,
      productId: productE._id,
      quantity: 20,
    });

    console.log("[SETUP] Products, stock records, and managers created.\n");

    // -------------------------------------------------------------------------
    // TEST A: Successful First Attempt
    // -------------------------------------------------------------------------
    console.log("--- [TEST A] Successful First Attempt (No Failures) ---");
    const jobA = await lowStockQueue.add(
      "process-low-stock-alert",
      {
        tenantId: tenantId.toString(),
        branchId: branchId.toString(),
        productId: productA._id.toString(),
        currentQuantity: 4,
        reorderLevel: 10,
        minimumStock: 5,
      },
      { jobId: `test-a-job-${Date.now()}` }
    );

    await sleep(1500);
    const jobAState = await jobA.getState();
    console.log(`[TEST A RESULT] Job State: ${jobAState}, Attempts Made: ${jobA.attemptsMade}`);
    if (jobAState !== "completed") {
      throw new Error(`Test A Expected state 'completed' but got '${jobAState}'`);
    }

    // -------------------------------------------------------------------------
    // TEST B: Transient Failure -> Exponential Backoff -> Success
    // -------------------------------------------------------------------------
    console.log("\n--- [TEST B] Transient Failure -> Exponential Backoff -> Success ---");
    let productBAttempts = 0;
    global.__TEST_NOTIFICATION_FAIL_HOOK__ = async ({ productId }) => {
      if (productId.toString() === productB._id.toString()) {
        productBAttempts++;
        if (productBAttempts === 1) {
          console.log(`[TEST HOOK] Intentionally throwing transient network timeout for Product B (Attempt ${productBAttempts})...`);
          throw new Error("Transient SMTP socket connection timeout");
        }
        console.log(`[TEST HOOK] Allowing Product B to succeed on Attempt ${productBAttempts}...`);
      }
    };

    const tStartB = Date.now();
    const jobB = await lowStockQueue.add(
      "process-low-stock-alert",
      {
        tenantId: tenantId.toString(),
        branchId: branchId.toString(),
        productId: productB._id.toString(),
        currentQuantity: 3,
        reorderLevel: 10,
        minimumStock: 5,
      },
      { jobId: `test-b-job-${Date.now()}` }
    );

    // Wait for attempt 1 (fails) + 1s backoff + attempt 2 (succeeds)
    await sleep(3500);
    const jobBState = await jobB.getState();
    const durationB = Date.now() - tStartB;
    console.log(
      `[TEST B RESULT] Job State: ${jobBState}, Total Notification Calls: ${productBAttempts}, Elapsed: ${durationB}ms`
    );
    if (jobBState !== "completed" || productBAttempts < 2) {
      throw new Error(`Test B failed: expected completion after at least 2 attempts, got ${jobBState} (${productBAttempts} attempts)`);
    }

    // -------------------------------------------------------------------------
    // TEST C: Permanent Failure -> Max Attempts Exhausted -> Retained in Failed Set
    // -------------------------------------------------------------------------
    console.log("\n--- [TEST C] Permanent Failure -> Max Attempts Exhausted ---");
    let productCAttempts = 0;
    global.__TEST_NOTIFICATION_FAIL_HOOK__ = async ({ productId }) => {
      if (productId.toString() === productC._id.toString()) {
        productCAttempts++;
        console.log(`[TEST HOOK] Intentionally failing Product C (Attempt ${productCAttempts})...`);
        throw new Error("Permanent Mail Server 550 User Unknown / Connection Refused");
      }
    };

    const jobC = await lowStockQueue.add(
      "process-low-stock-alert",
      {
        tenantId: tenantId.toString(),
        branchId: branchId.toString(),
        productId: productC._id.toString(),
        currentQuantity: 2,
        reorderLevel: 10,
        minimumStock: 5,
      },
      { jobId: `test-c-job-${Date.now()}` }
    );

    // Wait for attempts: 1 + 1s backoff + 2 + 2s backoff + 3 (total ~5-6s)
    console.log("Waiting for exponential retries (Attempt 1 -> 1s delay -> Attempt 2 -> 2s delay -> Attempt 3 -> Permanent Fail)...");
    await sleep(6500);

    const jobCState = await jobC.getState();
    const failedReason = jobC.failedReason;
    console.log(
      `[TEST C RESULT] Job State: ${jobCState}, Attempts Made: ${jobC.attemptsMade}, Failed Reason: "${failedReason}"`
    );

    if (jobCState !== "failed") {
      throw new Error(`Test C failed: expected state 'failed', got '${jobCState}'`);
    }

    // Verify failed job is inspectable in Redis
    const failedJobs = await lowStockQueue.getFailed();
    const foundInFailed = failedJobs.find((j) => j.id === jobC.id);
    console.log(`[TEST C AUDIT] Job ${jobC.id} found in BullMQ Failed Set: ${Boolean(foundInFailed)}`);
    if (!foundInFailed) {
      throw new Error("Test C failed: job was not found in failed jobs collection for auditing!");
    }

    // -------------------------------------------------------------------------
    // TEST D: Delayed Follow-Up Job Retries upon Active Failure
    // -------------------------------------------------------------------------
    console.log("\n--- [TEST D] Delayed Follow-Up Job Retries ---");
    let productDAttempts = 0;
    global.__TEST_NOTIFICATION_FAIL_HOOK__ = async ({ productId, isFollowUp }) => {
      if (productId.toString() === productD._id.toString() && isFollowUp) {
        productDAttempts++;
        if (productDAttempts === 1) {
          console.log(`[TEST HOOK] Intentionally failing delayed follow-up on first active attempt...`);
          throw new Error("Delayed Notification Dispatch Service Down");
        }
        console.log(`[TEST HOOK] Delayed follow-up retry attempt ${productDAttempts} allowed.`);
      }
    };

    const jobD = await lowStockQueue.add(
      "process-low-stock-followup",
      {
        tenantId: tenantId.toString(),
        branchId: branchId.toString(),
        productId: productD._id.toString(),
        reorderLevel: 10,
        minimumStock: 5,
        scheduledAt: new Date().toISOString(),
      },
      {
        jobId: `test-d-followup-${Date.now()}`,
        delay: 2000, // 2s delay
      }
    );

    console.log("Waiting for delay expiration (2s) + Attempt 1 fail + Backoff (1s) + Attempt 2 success...");
    await sleep(5500);

    const jobDState = await jobD.getState();
    console.log(
      `[TEST D RESULT] Delayed Job State: ${jobDState}, Follow-Up Notification Attempts: ${productDAttempts}`
    );
    if (jobDState !== "completed" || productDAttempts < 2) {
      throw new Error(`Test D failed: delayed follow-up did not retry to completion. State: ${jobDState}`);
    }

    // -------------------------------------------------------------------------
    // TEST E: Stock Transaction Isolation
    // -------------------------------------------------------------------------
    console.log("\n--- [TEST E] Stock Transaction Isolation from Queue/Worker Failures ---");
    // We configure the notification hook to fail permanently for product E
    global.__TEST_NOTIFICATION_FAIL_HOOK__ = async ({ productId }) => {
      if (productId.toString() === productE._id.toString()) {
        console.log("[TEST HOOK] Intentional persistent failure for Product E alert worker");
        throw new Error("Fatal Notification Gateway Error");
      }
    };

    console.log(`Initial Stock for Product E: 20. Mutating stock: 20 -> 5 (-15)...`);
    const mutationResult = await createAdjustment(tenantId, actorId, {
      branchId,
      productId: productE._id,
      quantityChange: -15,
      reason: "Bulk kitchen stock consumption",
    });

    console.log(`Adjustment API result: Stock quantity = ${mutationResult.stock.quantity}`);
    console.log("Waiting 6500ms for worker to attempt and fail all retries...");
    await sleep(6500);

    // Verify Live MongoDB Stock Document
    const liveStock = await Stock.findOne({ tenantId, branchId, productId: productE._id }).lean();
    const liveMovements = await StockMovement.find({ tenantId, branchId, productId: productE._id }).lean();

    console.log(`[TEST E AUDIT] Live MongoDB Stock Quantity: ${liveStock.quantity}`);
    console.log(`[TEST E AUDIT] Total Movements Recorded in MongoDB: ${liveMovements.length}`);

    if (liveStock.quantity !== 5) {
      throw new Error(`Transaction Isolation Failed! Stock was corrupted or rolled back. Expected 5, got ${liveStock.quantity}`);
    }
    if (liveMovements.length < 1) {
      throw new Error("Transaction Isolation Failed! Stock movement ledger entry missing.");
    }

    console.log("✅ Verified: Stock remains securely committed at 5 with immutable audit ledger, despite notification worker failure!");

    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    delete global.__TEST_NOTIFICATION_FAIL_HOOK__;
    await Stock.deleteMany({ tenantId });
    await Product.deleteMany({ tenantId });
    await User.deleteMany({ tenantId });
    await StockMovement.deleteMany({ tenantId });

    console.log("\n================================================================================");
    console.log("🎉 ALL BULLMQ RETRY, BACKOFF & FAILURE HANDLING TESTS PASSED WITH 100% SUCCESS!");
    console.log("================================================================================");
  } catch (err) {
    console.error("\n❌ Test Suite Encountered Error:", err);
    process.exitCode = 1;
  } finally {
    await worker.close();
    await lowStockQueue.close();
    await redis.quit();
    await mongoose.disconnect();
    process.exit(process.exitCode || 0);
  }
};

runSuite();
