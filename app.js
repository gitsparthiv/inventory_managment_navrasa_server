const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const redis = require("./config/redis");

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root info endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Inventory Management API is running",
  });
});

// Production Health Check: verifies process, MongoDB, and Redis connectivity
app.get("/health", (req, res) => {
  const mongoConnected = mongoose.connection.readyState === 1;
  const redisConnected = redis && redis.status === "ready";

  const isHealthy = mongoConnected && redisConnected;

  const healthData = {
    status: isHealthy ? "ok" : "degraded",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoConnected ? "connected" : "disconnected",
      redis: redisConnected ? "connected" : "disconnected",
    },
  };

  const statusCode = isHealthy ? 200 : 503;
  return res.status(statusCode).json(healthData);
});

// API routes
// We will add module routes here as we build them.
// Example:
const authRoutes = require("./modules/auth/auth.routes");
app.use("/api/auth", authRoutes);

const productRoutes = require("./modules/products/product.routes");
app.use("/api/products", productRoutes);

const inventoryRoutes = require("./modules/inventory/inventory.routes");
app.use("/api/inventory", inventoryRoutes);

const supplierRoutes = require("./modules/suppliers/supplier.routes");
app.use("/api/suppliers", supplierRoutes);

const purchaseRoutes = require("./modules/purchases/purchase.routes");
app.use("/api/purchases", purchaseRoutes);

const transferRoutes = require("./modules/transfers/transfer.routes");
app.use("/api/transfers", transferRoutes);

const reportingRoutes = require("./modules/reporting/reporting.routes");
app.use("/api/reports", reportingRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

module.exports = app;
