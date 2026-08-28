const mongoose = require("mongoose");

const allowedOpeningStockFields = ["branchId", "productId", "quantity", "reason"];

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

  for (const field of ["branchId", "productId", "quantity", "reason"]) {
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

module.exports = {
  validateOpeningStock,
};
