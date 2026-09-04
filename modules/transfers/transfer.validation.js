const mongoose = require("mongoose");

const allowedCreateTransferFields = [
  "sourceBranchId",
  "destinationBranchId",
  "notes",
  "items",
];

const allowedStatusTransitions = [
  "submitted",
  "approved",
  "cancelled",
];

const validateCreateTransfer = (req, res, next) => {
  const { body } = req;

  const unsupportedField = Object.keys(body).find(
    (field) => !allowedCreateTransferFields.includes(field)
  );

  if (unsupportedField) {
    return res.status(400).json({
      success: false,
      message: `${unsupportedField} is not a supported transfer field`,
    });
  }

  for (const field of ["sourceBranchId", "destinationBranchId", "items"]) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return res.status(400).json({
        success: false,
        message: `${field} is required`,
      });
    }
  }

  for (const field of ["sourceBranchId", "destinationBranchId"]) {
    if (!mongoose.isValidObjectId(body[field])) {
      return res.status(400).json({
        success: false,
        message: `${field} must be a valid MongoDB ObjectId`,
      });
    }
  }

  if (body.sourceBranchId.toString() === body.destinationBranchId.toString()) {
    return res.status(400).json({
      success: false,
      message: "sourceBranchId and destinationBranchId must be different",
    });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "items must be a non-empty array of transfer items",
    });
  }

  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    if (!item.productId || !mongoose.isValidObjectId(item.productId)) {
      return res.status(400).json({
        success: false,
        message: `Item at index ${i}: productId must be a valid MongoDB ObjectId`,
      });
    }

    if (
      typeof item.transferredQuantity !== "number" ||
      !Number.isFinite(item.transferredQuantity) ||
      item.transferredQuantity <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: `Item at index ${i}: transferredQuantity must be a positive number greater than 0`,
      });
    }
  }

  next();
};

const validateUpdateTransferStatus = (req, res, next) => {
  const { id } = req.params;
  const { body } = req;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Transfer ID must be a valid MongoDB ObjectId",
    });
  }

  if (!body.status || !allowedStatusTransitions.includes(body.status)) {
    return res.status(400).json({
      success: false,
      message: `status is required and must be one of: ${allowedStatusTransitions.join(", ")}`,
    });
  }

  next();
};

const validateReceiveTransfer = (req, res, next) => {
  const { id } = req.params;
  const { body } = req;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Transfer ID must be a valid MongoDB ObjectId",
    });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "items must be a non-empty array of received items",
    });
  }

  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    if (!item.productId || !mongoose.isValidObjectId(item.productId)) {
      return res.status(400).json({
        success: false,
        message: `Item at index ${i}: productId must be a valid MongoDB ObjectId`,
      });
    }

    if (
      typeof item.quantityReceived !== "number" ||
      !Number.isFinite(item.quantityReceived) ||
      item.quantityReceived <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: `Item at index ${i}: quantityReceived must be a positive number greater than 0`,
      });
    }
  }

  next();
};

const validateReturnTransfer = (req, res, next) => {
  const { id } = req.params;
  const { body } = req;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Transfer ID must be a valid MongoDB ObjectId",
    });
  }

  if (typeof body.reason !== "string" || !body.reason.trim()) {
    return res.status(400).json({
      success: false,
      message: "reason is required and must be a non-empty string",
    });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "items must be a non-empty array of returned items",
    });
  }

  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    if (!item.productId || !mongoose.isValidObjectId(item.productId)) {
      return res.status(400).json({
        success: false,
        message: `Item at index ${i}: productId must be a valid MongoDB ObjectId`,
      });
    }

    if (
      typeof item.quantityReturned !== "number" ||
      !Number.isFinite(item.quantityReturned) ||
      item.quantityReturned <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: `Item at index ${i}: quantityReturned must be a positive number greater than 0`,
      });
    }
  }

  next();
};

const validateResolveDiscrepancy = (req, res, next) => {
  const { id } = req.params;
  const { body } = req;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Transfer ID must be a valid MongoDB ObjectId",
    });
  }

  if (typeof body.reason !== "string" || !body.reason.trim()) {
    return res.status(400).json({
      success: false,
      message: "reason is required and must be a non-empty string explaining the discrepancy resolution",
    });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "items must be a non-empty array of discrepancy items",
    });
  }

  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    if (!item.productId || !mongoose.isValidObjectId(item.productId)) {
      return res.status(400).json({
        success: false,
        message: `Item at index ${i}: productId must be a valid MongoDB ObjectId`,
      });
    }

    if (
      typeof item.lostQuantity !== "number" ||
      !Number.isFinite(item.lostQuantity) ||
      item.lostQuantity <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: `Item at index ${i}: lostQuantity must be a positive number greater than 0`,
      });
    }
  }

  next();
};

const validateTransferQuery = (req, res, next) => {
  const { sourceBranchId, destinationBranchId, status, startDate, endDate, page, limit } = req.query;

  if (sourceBranchId && !mongoose.isValidObjectId(sourceBranchId)) {
    return res.status(400).json({
      success: false,
      message: "sourceBranchId must be a valid MongoDB ObjectId",
    });
  }

  if (destinationBranchId && !mongoose.isValidObjectId(destinationBranchId)) {
    return res.status(400).json({
      success: false,
      message: "destinationBranchId must be a valid MongoDB ObjectId",
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

module.exports = {
  validateCreateTransfer,
  validateUpdateTransferStatus,
  validateReceiveTransfer,
  validateReturnTransfer,
  validateResolveDiscrepancy,
  validateTransferQuery,
};
