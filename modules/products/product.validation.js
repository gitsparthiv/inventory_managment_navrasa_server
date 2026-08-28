const mongoose = require("mongoose");

const requiredCreateFields = [
  "name",
  "sku",
  "unit",
  "costPrice",
  "sellingPrice",
  "minimumStock",
  "reorderLevel",
];

const numericFields = [
  "costPrice",
  "sellingPrice",
  "minimumStock",
  "reorderLevel",
];

const stringFields = ["name", "sku", "barcode", "unit"];
const validStatuses = ["active", "archived"];
const allowedProductFields = [
  ...stringFields,
  ...numericFields,
  "categoryId",
  "status",
];

const validateProduct = (req, res, next, isCreate) => {
  const { body } = req;

  const unsupportedField = Object.keys(body).find(
    (field) => !allowedProductFields.includes(field)
  );

  if (unsupportedField) {
    return res.status(400).json({
      success: false,
      message: `${unsupportedField} is not a supported product field`,
    });
  }

  if (isCreate) {
    for (const field of requiredCreateFields) {
      if (body[field] === undefined || body[field] === null || body[field] === "") {
        return res.status(400).json({
          success: false,
          message: `${field} is required`,
        });
      }
    }
  } else if (Object.keys(body).length === 0) {
    return res.status(400).json({
      success: false,
      message: "At least one product field is required for an update",
    });
  }

  for (const field of stringFields) {
    if (body[field] !== undefined && (typeof body[field] !== "string" || !body[field].trim())) {
      return res.status(400).json({
        success: false,
        message: `${field} must be a non-empty string`,
      });
    }
  }

  for (const field of numericFields) {
    if (
      body[field] !== undefined &&
      (typeof body[field] !== "number" || !Number.isFinite(body[field]) || body[field] < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: `${field} must be a number greater than or equal to 0`,
      });
    }
  }

  if (
    body.categoryId !== undefined &&
    body.categoryId !== null &&
    !mongoose.isValidObjectId(body.categoryId)
  ) {
    return res.status(400).json({
      success: false,
      message: "categoryId must be a valid MongoDB ObjectId",
    });
  }

  if (body.status !== undefined && !validStatuses.includes(body.status)) {
    return res.status(400).json({
      success: false,
      message: "status must be either active or archived",
    });
  }

  next();
};

const validateCreateProduct = (req, res, next) => {
  return validateProduct(req, res, next, true);
};

const validateUpdateProduct = (req, res, next) => {
  return validateProduct(req, res, next, false);
};

module.exports = {
  validateCreateProduct,
  validateUpdateProduct,
};
