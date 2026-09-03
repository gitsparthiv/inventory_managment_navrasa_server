const mongoose = require("mongoose");

const allowedOpeningStockFields = ["branchId", "productId", "quantity", "reason"];
const allowedAdjustmentFields = ["branchId", "productId", "quantityChange", "reason"];
const allowedWasteFields = ["branchId", "productId", "quantity", "reason"];
const allowedConsumptionFields = ["branchId", "productId", "quantity", "reason"];
const allowedReconcileFields = ["branchId", "productId", "countedQuantity", "reason"];

const validateOpeningStock = (req, res, next) => {
  const { body } = req;

  const unsupportedField = Object.keys(body).find(
    (field) => !allowedOpeningStockFields.includes(field)
  );

  if (unsupportedField) {
    return res.status(400).json({
      success: false,
      message: `${unsupportedField} is not a supported opening stock field`,
    });
  }

  for (const field of allowedOpeningStockFields) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return res.status(400).json({
        success: false,
        message: `${field} is required`,
      });
    }
  }

  for (const field of ["branchId", "productId"]) {
    if (!mongoose.isValidObjectId(body[field])) {
      return res.status(400).json({
        success: false,
        message: `${field} must be a valid MongoDB ObjectId`,
      });
    }
  }

  if (
    typeof body.quantity !== "number" ||
    !Number.isFinite(body.quantity) ||
    body.quantity <= 0
  ) {
    return res.status(400).json({
      success: false,
      message: "quantity must be a number greater than 0",
    });
  }

  if (typeof body.reason !== "string" || !body.reason.trim()) {
    return res.status(400).json({
      success: false,
      message: "reason must be a non-empty string",
    });
  }

  next();
};

const validateStockQuery = (req, res, next) => {
  const { branchId, productId, page, limit } = req.query;

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

const validateMovementsQuery = (req, res, next) => {
  const { branchId, productId, startDate, endDate, page, limit } = req.query;

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

const validateAdjustment = (req, res, next) => {
  const { body } = req;

  const unsupportedField = Object.keys(body).find(
    (field) => !allowedAdjustmentFields.includes(field)
  );

  if (unsupportedField) {
    return res.status(400).json({
      success: false,
      message: `${unsupportedField} is not a supported adjustment field`,
    });
  }

  for (const field of allowedAdjustmentFields) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return res.status(400).json({
        success: false,
        message: `${field} is required`,
      });
    }
  }

  for (const field of ["branchId", "productId"]) {
    if (!mongoose.isValidObjectId(body[field])) {
      return res.status(400).json({
        success: false,
        message: `${field} must be a valid MongoDB ObjectId`,
      });
    }
  }

  if (
    typeof body.quantityChange !== "number" ||
    !Number.isFinite(body.quantityChange) ||
    body.quantityChange === 0
  ) {
    return res.status(400).json({
      success: false,
      message: "quantityChange must be a non-zero number",
    });
  }

  if (typeof body.reason !== "string" || !body.reason.trim()) {
    return res.status(400).json({
      success: false,
      message: "reason must be a non-empty string",
    });
  }

  next();
};

const validateWaste = (req, res, next) => {
  const { body } = req;

  const unsupportedField = Object.keys(body).find(
    (field) => !allowedWasteFields.includes(field)
  );

  if (unsupportedField) {
    return res.status(400).json({
      success: false,
      message: `${unsupportedField} is not a supported waste field`,
    });
  }

  for (const field of allowedWasteFields) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return res.status(400).json({
        success: false,
        message: `${field} is required`,
      });
    }
  }

  for (const field of ["branchId", "productId"]) {
    if (!mongoose.isValidObjectId(body[field])) {
      return res.status(400).json({
        success: false,
        message: `${field} must be a valid MongoDB ObjectId`,
      });
    }
  }

  if (
    typeof body.quantity !== "number" ||
    !Number.isFinite(body.quantity) ||
    body.quantity <= 0
  ) {
    return res.status(400).json({
      success: false,
      message: "quantity must be a number greater than 0",
    });
  }

  if (typeof body.reason !== "string" || !body.reason.trim()) {
    return res.status(400).json({
      success: false,
      message: "reason must be a non-empty string",
    });
  }

  next();
};

const validateConsumption = (req, res, next) => {
  const { body } = req;

  const unsupportedField = Object.keys(body).find(
    (field) => !allowedConsumptionFields.includes(field)
  );

  if (unsupportedField) {
    return res.status(400).json({
      success: false,
      message: `${unsupportedField} is not a supported consumption field`,
    });
  }

  for (const field of allowedConsumptionFields) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return res.status(400).json({
        success: false,
        message: `${field} is required`,
      });
    }
  }

  for (const field of ["branchId", "productId"]) {
    if (!mongoose.isValidObjectId(body[field])) {
      return res.status(400).json({
        success: false,
        message: `${field} must be a valid MongoDB ObjectId`,
      });
    }
  }

  if (
    typeof body.quantity !== "number" ||
    !Number.isFinite(body.quantity) ||
    body.quantity <= 0
  ) {
    return res.status(400).json({
      success: false,
      message: "quantity must be a number greater than 0",
    });
  }

  if (typeof body.reason !== "string" || !body.reason.trim()) {
    return res.status(400).json({
      success: false,
      message: "reason must be a non-empty string",
    });
  }

  next();
};

const validateReconcile = (req, res, next) => {
  const { body } = req;

  const unsupportedField = Object.keys(body).find(
    (field) => !allowedReconcileFields.includes(field)
  );

  if (unsupportedField) {
    return res.status(400).json({
      success: false,
      message: `${unsupportedField} is not a supported reconciliation field`,
    });
  }

  for (const field of allowedReconcileFields) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return res.status(400).json({
        success: false,
        message: `${field} is required`,
      });
    }
  }

  for (const field of ["branchId", "productId"]) {
    if (!mongoose.isValidObjectId(body[field])) {
      return res.status(400).json({
        success: false,
        message: `${field} must be a valid MongoDB ObjectId`,
      });
    }
  }

  if (
    typeof body.countedQuantity !== "number" ||
    !Number.isFinite(body.countedQuantity) ||
    body.countedQuantity < 0
  ) {
    return res.status(400).json({
      success: false,
      message: "countedQuantity must be a non-negative number (0 or greater)",
    });
  }

  if (typeof body.reason !== "string" || !body.reason.trim()) {
    return res.status(400).json({
      success: false,
      message: "reason must be a non-empty string",
    });
  }

  next();
};

module.exports = {
  validateOpeningStock,
  validateStockQuery,
  validateMovementsQuery,
  validateAdjustment,
  validateWaste,
  validateConsumption,
  validateReconcile,
};

