const mongoose = require("mongoose");

const allowedCreatePOFields = [
  "branchId",
  "supplierId",
  "expectedDeliveryDate",
  "notes",
  "items",
];

const allowedStatusTransitions = [
  "submitted",
  "approved",
  "sent",
  "closed",
  "cancelled",
];

const validateCreatePurchaseOrder = (req, res, next) => {
  const { body } = req;

  const unsupportedField = Object.keys(body).find(
    (field) => !allowedCreatePOFields.includes(field)
  );

  if (unsupportedField) {
    return res.status(400).json({
      success: false,
      message: `${unsupportedField} is not a supported purchase order field`,
    });
  }

  for (const field of ["branchId", "supplierId", "items"]) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return res.status(400).json({
        success: false,
        message: `${field} is required`,
      });
    }
  }

  for (const field of ["branchId", "supplierId"]) {
    if (!mongoose.isValidObjectId(body[field])) {
      return res.status(400).json({
        success: false,
        message: `${field} must be a valid MongoDB ObjectId`,
      });
    }
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "items must be a non-empty array of purchase order items",
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
      typeof item.orderedQuantity !== "number" ||
      !Number.isFinite(item.orderedQuantity) ||
      item.orderedQuantity <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: `Item at index ${i}: orderedQuantity must be a positive number`,
      });
    }

    if (
      typeof item.unitCost !== "number" ||
      !Number.isFinite(item.unitCost) ||
      item.unitCost < 0
    ) {
      return res.status(400).json({
        success: false,
        message: `Item at index ${i}: unitCost must be a non-negative number`,
      });
    }
  }

  if (body.expectedDeliveryDate && isNaN(Date.parse(body.expectedDeliveryDate))) {
    return res.status(400).json({
      success: false,
      message: "expectedDeliveryDate must be a valid ISO date",
    });
  }

  next();
};

const validateUpdatePOStatus = (req, res, next) => {
  const { id } = req.params;
  const { body } = req;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Purchase Order ID must be a valid MongoDB ObjectId",
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

const validateReceivePurchaseOrder = (req, res, next) => {
  const { id } = req.params;
  const { body } = req;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Purchase Order ID must be a valid MongoDB ObjectId",
    });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "items must be a non-empty array of received line items",
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

const validatePurchaseQuery = (req, res, next) => {
  const { branchId, supplierId, startDate, endDate, page, limit } = req.query;

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
  validateCreatePurchaseOrder,
  validateUpdatePOStatus,
  validateReceivePurchaseOrder,
  validatePurchaseQuery,
};
