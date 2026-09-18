const dotenv = require("dotenv");
// Load environment variables
dotenv.config();

const app = require("./app");
const connectDB = require("./config/db");
const redis = require("./config/redis");
const { createLowStockWorker } = require("./shared/jobs/low-stock.worker");
const { lowStockQueue } = require("./shared/jobs/low-stock.queue");

const PORT = process.env.PORT || 5000;
let serverInstance = null;
let lowStockWorker = null;

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Connect to Redis
    await redis.connect();

    // Start BullMQ Worker
    lowStockWorker = createLowStockWorker();
    console.log("BullMQ low-stock alert worker initialized and listening for jobs");

    // Start Express server
    serverInstance = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
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
    if (serverInstance) {
      serverInstance.close(() => console.log("HTTP server closed"));
    }
    if (lowStockWorker) {
      await lowStockWorker.close();
      console.log("BullMQ worker closed");
    }
    if (lowStockQueue) {
      await lowStockQueue.close();
      console.log("BullMQ queue closed");
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