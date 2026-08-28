const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const connectDB = require("./config/db");

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
connectDB();

// Health check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Inventory Management API is running",
  });
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
