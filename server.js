const dotenv = require("dotenv");
// Load environment variables
dotenv.config();

const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const redis = require("./config/redis");
const { createLowStockWorker } = require("./shared/jobs/low-stock.worker");
const { lowStockQueue } = require("./shared/jobs/low-stock.queue");
const { createScheduledReportWorker } = require("./shared/jobs/scheduled-reports.worker");
const { scheduledReportQueue } = require("./shared/jobs/scheduled-reports.queue");
const { initSocket } = require("./shared/socket/socket.service");
const { socketAuthMiddleware } = require("./shared/socket/socket.middleware");

const PORT = process.env.PORT || 5000;
let serverInstance = null;
let ioInstance = null;
let lowStockWorker = null;
let scheduledReportWorker = null;

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Connect to Redis
    await redis.connect();

    // Create HTTP Server
    serverInstance = http.createServer(app);

    // Initialize Socket.IO attached to HTTP server with authentication middleware
    ioInstance = initSocket(serverInstance, socketAuthMiddleware);

    // Start BullMQ Workers
    lowStockWorker = createLowStockWorker();
    console.log("BullMQ low-stock alert worker initialized and listening for jobs");

    scheduledReportWorker = createScheduledReportWorker();
    console.log("BullMQ scheduled reports worker initialized and listening for jobs");

    // Start listening on HTTP & WebSocket server
    serverInstance.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (HTTP & Socket.IO)`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  try {
    if (ioInstance) {
      await new Promise((resolve) => {
        ioInstance.close(() => {
          console.log("Socket.IO server closed");
          resolve();
        });
      });
    }
    if (serverInstance) {
      serverInstance.close(() => console.log("HTTP server closed"));
    }
    if (lowStockWorker) {
      await lowStockWorker.close();
      console.log("BullMQ low-stock worker closed");
    }
    if (lowStockQueue) {
      await lowStockQueue.close();
      console.log("BullMQ low-stock queue closed");
    }
    if (scheduledReportWorker) {
      await scheduledReportWorker.close();
      console.log("BullMQ scheduled reports worker closed");
    }
    if (scheduledReportQueue) {
      await scheduledReportQueue.close();
      console.log("BullMQ scheduled reports queue closed");
    }
    if (redis && redis.status === "ready") {
      await redis.quit();
      console.log("Redis client closed");
    }
    console.log("Graceful shutdown completed. Exiting process.");
    process.exit(0);
  } catch (err) {
    console.error("Error during graceful shutdown:", err.message);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

startServer();

startServer();