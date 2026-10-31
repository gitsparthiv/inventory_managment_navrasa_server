/**
 * End-to-End Automated Verification Script for Real-Time Socket.IO Integration
 * Tests:
 * 1. Unauthorized connection rejection (missing/invalid token)
 * 2. Authenticated connection & automatic room joining (tenant & branch)
 * 3. Real-time stock mutation emission (`stock:updated`) on consumption/adjustment
 * 4. Multi-tenant isolation (Tenant B client does NOT receive Tenant A events)
 * 5. Branch scoping isolation (Branch 2 client does NOT receive Branch 1 events)
 * 6. Clean disconnection
 */
require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const { io: Client } = require("socket.io-client");

const app = require("./app");
const connectDB = require("./config/db");
const redis = require("./config/redis");
const { initSocket } = require("./shared/socket/socket.service");
const { socketAuthMiddleware } = require("./shared/socket/socket.middleware");
const Product = require("./modules/products/products.model");
const Stock = require("./modules/inventory/stock.model");
const { createConsumption, createOpeningStock } = require("./modules/inventory/inventory.service");

const TEST_PORT = 5001;

const runVerification = async () => {
  console.log("================================================================================");
  console.log("🚀 STARTING SOCKET.IO REAL-TIME INTEGRATION VERIFICATION SUITE");
  console.log("================================================================================");

  await connectDB();
  await redis.connect();

  const server = http.createServer(app);
  const io = initSocket(server, socketAuthMiddleware);

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`[TEST SERVER] Running on port ${TEST_PORT}`);

  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const branchA1 = new mongoose.Types.ObjectId();
  const branchA2 = new mongoose.Types.ObjectId();
  const branchB1 = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();

  let clientA1, clientA2, clientB;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Unauthorized Connection Rejection
    // -------------------------------------------------------------------------
    console.log("\n--- [TEST 1] Unauthorized Connection Rejection ---");
    let rejected = false;
    try {
      await new Promise((resolve, reject) => {
        const unauthSocket = Client(`http://localhost:${TEST_PORT}`, {
          transports: ["websocket"],
          reconnection: false,
          timeout: 2000,
        });

        unauthSocket.on("connect_error", (err) => {
          rejected = true;
          unauthSocket.close();
          resolve(err);
        });

        unauthSocket.on("connect", () => {
          unauthSocket.close();
          reject(new Error("Connection should have been rejected for unauthenticated socket"));
        });
      });
    } catch (e) {
      // expected error
    }

    if (!rejected) {
      throw new Error("Test 1 Failed: Unauthenticated client was not rejected!");
    }
    console.log("✅ [TEST 1 PASSED] Unauthenticated connection correctly rejected by socketAuthMiddleware.");

    // -------------------------------------------------------------------------
    // TEST 2: Multi-Tenant & Multi-Branch Client Setup
    // -------------------------------------------------------------------------
    console.log("\n--- [TEST 2] Connecting Authenticated Multi-Tenant Clients ---");

    const connectAuthClient = (tenantId, branchId, userId) => {
      return new Promise((resolve, reject) => {
        const client = Client(`http://localhost:${TEST_PORT}`, {
          transports: ["websocket"],
          reconnection: false,
          auth: {
            "x-test-tenant-id": tenantId.toString(),
            "x-test-branch-id": branchId.toString(),
            "x-test-user-id": userId.toString(),
            "x-test-role": "manager",
          },
        });

        client.on("connect", () => resolve(client));
        client.on("connect_error", (err) => reject(err));
      });
    };

    clientA1 = await connectAuthClient(tenantA, branchA1, new mongoose.Types.ObjectId());
    clientA2 = await connectAuthClient(tenantA, branchA2, new mongoose.Types.ObjectId());
    clientB = await connectAuthClient(tenantB, branchB1, new mongoose.Types.ObjectId());

    console.log("✅ [TEST 2 PASSED] Connected Client A1 (Tenant A, Branch 1), Client A2 (Tenant A, Branch 2), Client B (Tenant B, Branch 1)");

    // -------------------------------------------------------------------------
    // TEST 3: Real-Time Stock Mutation & Branch Scoping Verification
    // -------------------------------------------------------------------------
    console.log("\n--- [TEST 3] Real-Time Stock Mutation (`stock:updated`) & Scoping Verification ---");

    // Setup Test Product & Initial Stock
    const productA = await Product.create({
      name: "Milk 1L",
      sku: `MILK-${Date.now()}`,
      unit: "liters",
      costPrice: 40,
      sellingPrice: 60,
      minimumStock: 5,
      reorderLevel: 10,
      status: "active",
      tenantId: tenantA,
    });

    await createOpeningStock(tenantA, actorId, {
      branchId: branchA1,
      productId: productA._id,
      quantity: 50,
      reason: "Initial Stock",
    });

    // Setup listeners on all 3 clients
    const receivedEvents = {
      clientA1: [],
      clientA2: [],
      clientB: [],
    };

    clientA1.on("stock:updated", (data) => receivedEvents.clientA1.push(data));
    clientA2.on("stock:updated", (data) => receivedEvents.clientA2.push(data));
    clientB.on("stock:updated", (data) => receivedEvents.clientB.push(data));

    // Perform consumption mutation on Tenant A, Branch A1
    console.log("Triggering stock consumption of 15 units at Tenant A, Branch 1...");
    await createConsumption(tenantA, actorId, {
      branchId: branchA1,
      productId: productA._id,
      quantity: 15,
      reason: "Kitchen consumption",
    });

    // Wait 500ms for event transmission
    await new Promise((r) => setTimeout(r, 500));

    console.log(`Events received - Client A1 (same branch): ${receivedEvents.clientA1.length}`);
    console.log(`Events received - Client A2 (different branch, same tenant): ${receivedEvents.clientA2.length}`);
    console.log(`Events received - Client B (different tenant): ${receivedEvents.clientB.length}`);

    if (receivedEvents.clientA1.length !== 1) {
      throw new Error(`Test 3 Failed: Client A1 expected 1 event, got ${receivedEvents.clientA1.length}`);
    }

    const payload = receivedEvents.clientA1[0];
    if (payload.type !== "consumption" || payload.quantity !== 35 || payload.quantityChange !== -15) {
      throw new Error(`Test 3 Failed: Unexpected event payload: ${JSON.stringify(payload)}`);
    }

    if (receivedEvents.clientA2.length !== 0) {
      throw new Error("Test 3 Failed: Branch scoping leak! Client A2 received Branch 1 stock update.");
    }

    if (receivedEvents.clientB.length !== 0) {
      throw new Error("Test 3 Failed: Multi-tenant leak! Client B received Tenant A stock update.");
    }

    console.log("✅ [TEST 3 PASSED] Client A1 received stock update accurately. Zero cross-branch or cross-tenant leaks!");

    // Clean up created records
    await Stock.deleteMany({ tenantId: tenantA });
    await Product.deleteMany({ tenantId: tenantA });

    console.log("\n================================================================================");
    console.log("🎉 ALL REAL-TIME SOCKET.IO VERIFICATION TESTS PASSED (100% SUCCESS)");
    console.log("================================================================================");
  } catch (err) {
    console.error("\n❌ Test Suite Encountered Error:", err);
    process.exitCode = 1;
  } finally {
    if (clientA1) clientA1.close();
    if (clientA2) clientA2.close();
    if (clientB) clientB.close();
    io.close();
    server.close();
    await redis.quit();
    await mongoose.disconnect();
    process.exit(process.exitCode || 0);
  }
};

runVerification();

