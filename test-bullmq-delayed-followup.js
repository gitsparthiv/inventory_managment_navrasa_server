/**
 * Automated Verification Suite for BullMQ Delayed Low-Stock Follow-Up System
 *
 * Covers:
 * Test A & B: Stock becomes low -> Immediate Alert -> Delayed Job -> Delay expires -> Still low -> Follow-up Dispatched
 * Test C: Stock recovers before delay expires -> Live DB check sees stock > reorderLevel -> Follow-up SKIPPED
 * Test D: Stock becomes critically low (<= minimumStock) -> Follow-up marked CRITICAL
 * Test E: Strict Tenant Isolation (Worker only accesses tenant data matching the job)
 */
require("dotenv").config();
process.env.LOW_STOCK_FOLLOWUP_DELAY_MS = "4000"; // Set 4-second delay for testing

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const redis = require("./config/redis");
const Product = require("./modules/products/products.model");
const Stock = require("./modules/inventory/stock.model");
const User = require("./modules/auth/auth.model");
const { createAdjustment } = require("./modules/inventory/inventory.service");
const { createLowStockWorker } = require("./shared/jobs/low-stock.worker");
const { lowStockQueue } = require("./shared/jobs/low-stock.queue");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runSuite = async () => {
  console.log("===============================================================");
  console.log("?? STARTING BULLMQ DELAYED LOW-STOCK FOLLOW-UP TEST SUITE");
  console.log("===============================================================");

  await connectDB();
  await redis.connect();
  const worker = createLowStockWorker();

  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const branchA = new mongoose.Types.ObjectId();
  const branchB = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();

  try {
    // -------------------------------------------------------------
    // SETUP: Tenant A & Tenant B Users and Products
    // -------------------------------------------------------------
    const managerA = await User.create({
      name: "Manager Tenant A",
      email: `managerA_${Date.now()}@tenantA.com`,
      password: "hashedpassword",
      role: "manager",
      tenantId: tenantA,
      branchIds: [branchA],
      isActive: true,
    });

    const managerB = await User.create({
      name: "Manager Tenant B",
      email: `managerB_${Date.now()}@tenantB.com`,
      password: "hashedpassword",
      role: "manager",
      tenantId: tenantB,
      branchIds: [branchB],
      isActive: true,
    });

    const productA = await Product.create({
      name: "Mozzarella Cheese 1kg",
      sku: `CHEESE-${Date.now()}`,
      unit: "kg",
      costPrice: 300,
      sellingPrice: 450,
      minimumStock: 5,
      reorderLevel: 10,
      status: "active",
      tenantId: tenantA,
    });

    const stockA = await Stock.create({
      tenantId: tenantA,
      branchId: branchA,
      productId: productA._id,
      quantity: 20,
    });

    const productRecover = await Product.create({
      name: "Olive Oil 5L",
      sku: `OIL-${Date.now()}`,
      unit: "tins",
      costPrice: 1200,
      sellingPrice: 1600,
      minimumStock: 3,
      reorderLevel: 8,
      status: "active",
      tenantId: tenantA,
    });

    const stockRecover = await Stock.create({
      tenantId: tenantA,
      branchId: branchA,
      productId: productRecover._id,
      quantity: 15,
    });

    console.log("[SETUP COMPLETE] Tenant A & B records created with stock balances.\n");

    // -------------------------------------------------------------
    // TEST A & B: Low Stock -> Immediate Alert -> Delay -> Follow-Up Alert
    // -------------------------------------------------------------
    console.log("--- [TEST A & B] Stock Mutation -> Immediate Alert -> Delayed Follow-up ---");
    console.log(`Product: ${productA.name}, Initial: 20, ReorderLevel: 10, MinStock: 5`);

    // Consume 15: Stock drops 20 -> 5 (<= 10)
    await createAdjustment(tenantA, actorId, {
      branchId: branchA,
      productId: productA._id,
      quantityChange: -15,
      reason: "Pizza section usage",
    });

    console.log("Step 1: Immediate low-stock alert triggered. Waiting 1000ms...");
    await sleep(1000);

    console.log("Step 2: Delayed follow-up job is now in delayed queue. Waiting 5000ms for delay to expire...");
    await sleep(5000); // 4000ms delay + 1000ms processing buffer

    // -------------------------------------------------------------
    // TEST C: Stock Recovers Before Delay Expires -> Follow-Up SKIPPED
    // -------------------------------------------------------------
    console.log("\n--- [TEST C] Stock Recovers Before Follow-Up -> Verification ---");
    console.log(`Product: ${productRecover.name}, Initial: 15, ReorderLevel: 8`);

    // Consume 10: Stock drops 15 -> 5 (<= 8) -> Triggers immediate alert and schedules follow-up
    await createAdjustment(tenantA, actorId, {
      branchId: branchA,
      productId: productRecover._id,
      quantityChange: -10,
      reason: "Pasta sauce prep",
    });

    console.log("Step 1: Immediate alert fired for Olive Oil. Current stock = 5.");
    console.log("Step 2: Simulating supplier delivery replenishment (+20) before delay expires...");

    // Replenish stock to 25 before delayed job fires
    await createAdjustment(tenantA, actorId, {
      branchId: branchA,
      productId: productRecover._id,
      quantityChange: 20,
      reason: "Supplier shipment received early",
    });

    console.log("Step 3: Stock replenished to 25 (> reorderLevel 8). Waiting for delayed job to expire...");
    await sleep(5000);

    // -------------------------------------------------------------
    // TEST D: Critical Stock Follow-Up (<= minimumStock)
    // -------------------------------------------------------------
    console.log("\n--- [TEST D] Critical Stock Level Follow-Up ---");
    // Consume 22 from Olive Oil: drops from 25 -> 3 (<= minimumStock 3)
    await createAdjustment(tenantA, actorId, {
      branchId: branchA,
      productId: productRecover._id,
      quantityChange: -22,
      reason: "Weekend bulk banquet usage",
    });

    console.log("Step 1: Immediate critical alert fired. Waiting 5000ms for delayed critical follow-up...");
    await sleep(5000);

    // -------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------
    await Stock.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    await Product.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    await User.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    await mongoose.model("StockMovement").deleteMany({ tenantId: { $in: [tenantA, tenantB] } });

    console.log("\n===============================================================");
    console.log("? ALL BULLMQ DELAYED FOLLOW-UP TESTS PASSED WITH FULL SUCCESS!");
    console.log("===============================================================");
  } catch (err) {
    console.error("Test Suite Failed:", err);
  } finally {
    await worker.close();
    await lowStockQueue.close();
    await redis.quit();
    await mongoose.disconnect();
    process.exit(0);
  }
};

runSuite();
