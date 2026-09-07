const mongoose = require("mongoose");

const allowedMovementTypes = [
  "opening",
  "stock_in",
  "stock_out",
  "transfer_in",
  "transfer_out",
  "transfer_return",
  "adjustment",
  "waste",
  "consumption",
  "reconciliation",
];

const allowedPOStatuses = [
  "draft",
  "submitted",
  "approved",
  "sent",
  "partially_received",
  "received",
  "closed",
  "cancelled",
];

const validateInventoryReportQuery = (req, res, next) => {
  const { branchId, categoryId, format, page, limit } = req.query;

  if (branchId && !mongoose.isValidObjectId(branchId)) {
    return res.status(400).json({
      success: false,
      message: "branchId must be a valid MongoDB ObjectId",
    });
  }

  if (categoryId && !mongoose.isValidObjectId(categoryId)) {
    return res.status(400).json({
      success: false,
      message: "categoryId must be a valid MongoDB ObjectId",
    });
  }

  if (format && !["json", "csv"].includes(format.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: "format must be either 'json' or 'csv'",
    });
  }

  if (page && (isNaN(Number(page)) || Number(page) < 1)) {
    return res.status(400).json({
      success: false,
      message: "page must be a positive integer",
    });
  }

  if (limit && (isNaN(Number(limit)) || Number(limit) < 1)) {
    return res.status(400).json({
      success: false,
      message: "limit must be a positive integer",
    });
  }

  next();
};

const validateLowStockReportQuery = (req, res, next) => {
  const { branchId, criticalOnly, format, page, limit } = req.query;

  if (branchId && !mongoose.isValidObjectId(branchId)) {
    return res.status(400).json({
      success: false,
      message: "branchId must be a valid MongoDB ObjectId",
    });
  }

  if (criticalOnly && !["true", "false"].includes(criticalOnly.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: "criticalOnly must be 'true' or 'false'",
    });
  }

  if (format && !["json", "csv"].includes(format.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: "format must be either 'json' or 'csv'",
    });
  }

  if (page && (isNaN(Number(page)) || Number(page) < 1)) {
    return res.status(400).json({
      success: false,
      message: "page must be a positive integer",
    });
  }

  if (limit && (isNaN(Number(limit)) || Number(limit) < 1)) {
    return res.status(400).json({
      success: false,
      message: "limit must be a positive integer",
    });
  }

  next();
};

const validateMovementsReportQuery = (req, res, next) => {
  const { branchId, productId, movementType, startDate, endDate, format, page, limit } = req.query;

  if (branchId && !mongoose.isValidObjectId(branchId)) {
    return res.status(400).json({
      success: false,
      message: "branchId must be a valid MongoDB ObjectId",
    });
  }

  if (productId && !mongoose.isValidObjectId(productId)) {
    return res.status(400).json({
      success: false,
      message: "productId must be a valid MongoDB ObjectId",
    });
  }

  if (movementType && !allowedMovementTypes.includes(movementType)) {
    return res.status(400).json({
      success: false,
      message: `movementType must be one of: ${allowedMovementTypes.join(", ")}`,
    });
  }

  if (startDate && isNaN(Date.parse(startDate))) {
    return res.status(400).json({
      success: false,
      message: "startDate must be a valid ISO date",
    });
  }

  if (endDate && isNaN(Date.parse(endDate))) {
    return res.status(400).json({
      success: false,
      message: "endDate must be a valid ISO date",
    });
  }

  if (format && !["json", "csv"].includes(format.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: "format must be either 'json' or 'csv'",
    });
  }

  if (page && (isNaN(Number(page)) || Number(page) < 1)) {
    return res.status(400).json({
      success: false,
      message: "page must be a positive integer",
    });
  }

  if (limit && (isNaN(Number(limit)) || Number(limit) < 1)) {
    return res.status(400).json({
      success: false,
      message: "limit must be a positive integer",
    });
  }

  next();
};

const validatePurchasingReportQuery = (req, res, next) => {
  const { branchId, supplierId, status, startDate, endDate, format, page, limit } = req.query;

  if (branchId && !mongoose.isValidObjectId(branchId)) {
    return res.status(400).json({
      success: false,
      message: "branchId must be a valid MongoDB ObjectId",
    });
  }

  if (supplierId && !mongoose.isValidObjectId(supplierId)) {
    return res.status(400).json({
      success: false,
      message: "supplierId must be a valid MongoDB ObjectId",
    });
  }

  if (status && !allowedPOStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `status must be one of: ${allowedPOStatuses.join(", ")}`,
    });
  }

  if (startDate && isNaN(Date.parse(startDate))) {
    return res.status(400).json({
      success: false,
      message: "startDate must be a valid ISO date",
    });
  }

  if (endDate && isNaN(Date.parse(endDate))) {
    return res.status(400).json({
      success: false,
      message: "endDate must be a valid ISO date",
    });
  }

  if (format && !["json", "csv"].includes(format.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: "format must be either 'json' or 'csv'",
    });
  }

  if (page && (isNaN(Number(page)) || Number(page) < 1)) {
    return res.status(400).json({
      success: false,
      message: "page must be a positive integer",
    });
  }

  if (limit && (isNaN(Number(limit)) || Number(limit) < 1)) {
    return res.status(400).json({
      success: false,
      message: "limit must be a positive integer",
    });
  }

  next();
};

const validateSuppliersReportQuery = (req, res, next) => {
  const { status, format, page, limit } = req.query;

  if (status && !["active", "inactive"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "status must be either 'active' or 'inactive'",
    });
  }

  if (format && !["json", "csv"].includes(format.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: "format must be either 'json' or 'csv'",
    });
  }

  if (page && (isNaN(Number(page)) || Number(page) < 1)) {
    return res.status(400).json({
      success: false,
      message: "page must be a positive integer",
    });
  }

  if (limit && (isNaN(Number(limit)) || Number(limit) < 1)) {
    return res.status(400).json({
      success: false,
      message: "limit must be a positive integer",
    });
  }

  next();
};

const validateDashboardQuery = (req, res, next) => {
  const { branchId } = req.query;

  if (branchId && !mongoose.isValidObjectId(branchId)) {
    return res.status(400).json({
      success: false,
      message: "branchId must be a valid MongoDB ObjectId",
    });
  }

  next();
};

module.exports = {
  validateInventoryReportQuery,
  validateLowStockReportQuery,
  validateMovementsReportQuery,
  validatePurchasingReportQuery,
  validateSuppliersReportQuery,
  validateDashboardQuery,
};
