const mongoose = require("mongoose");

const allowedCreateSupplierFields = [
  "name",
  "contactPerson",
  "email",
  "phone",
  "address",
  "suppliedProductIds",
  "status",
];

const allowedUpdateSupplierFields = [
  "name",
  "contactPerson",
  "email",
  "phone",
  "address",
  "suppliedProductIds",
  "status",
];

const validateCreateSupplier = (req, res, next) => {
  const { body } = req;

  const unsupportedField = Object.keys(body).find(
    (field) => !allowedCreateSupplierFields.includes(field)
  );

  if (unsupportedField) {
    return res.status(400).json({
      success: false,
      message: `${unsupportedField} is not a supported supplier field`,
    });
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return res.status(400).json({
      success: false,
      message: "name is required and must be a non-empty string",
    });
  }

  if (body.email && typeof body.email !== "string") {
    return res.status(400).json({
      success: false,
      message: "email must be a string",
    });
  }

  if (body.phone && typeof body.phone !== "string") {
    return res.status(400).json({
      success: false,
      message: "phone must be a string",
    });
  }

  if (body.suppliedProductIds) {
    if (!Array.isArray(body.suppliedProductIds)) {
      return res.status(400).json({
        success: false,
        message: "suppliedProductIds must be an array of ObjectIds",
      });
    }

    for (const pid of body.suppliedProductIds) {
      if (!mongoose.isValidObjectId(pid)) {
        return res.status(400).json({
          success: false,
          message: "All suppliedProductIds must be valid MongoDB ObjectIds",
        });
      }
    }
  }

  if (body.status && !["active", "inactive"].includes(body.status)) {
    return res.status(400).json({
      success: false,
      message: "status must be either active or inactive",
    });
  }

  next();
};

const validateUpdateSupplier = (req, res, next) => {
  const { id } = req.params;
  const { body } = req;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Supplier ID must be a valid MongoDB ObjectId",
    });
  }

  const unsupportedField = Object.keys(body).find(
    (field) => !allowedUpdateSupplierFields.includes(field)
  );

  if (unsupportedField) {
    return res.status(400).json({
      success: false,
      message: `${unsupportedField} is not a supported supplier field`,
    });
  }

  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
    return res.status(400).json({
      success: false,
      message: "name must be a non-empty string",
    });
  }

  if (body.suppliedProductIds) {
    if (!Array.isArray(body.suppliedProductIds)) {
      return res.status(400).json({
        success: false,
        message: "suppliedProductIds must be an array of ObjectIds",
      });
    }

    for (const pid of body.suppliedProductIds) {
      if (!mongoose.isValidObjectId(pid)) {
        return res.status(400).json({
          success: false,
          message: "All suppliedProductIds must be valid MongoDB ObjectIds",
        });
      }
    }
  }

  if (body.status && !["active", "inactive"].includes(body.status)) {
    return res.status(400).json({
      success: false,
      message: "status must be either active or inactive",
    });
  }

  next();
};

const validateSupplierQuery = (req, res, next) => {
  const { page, limit } = req.query;

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
  validateCreateSupplier,
  validateUpdateSupplier,
  validateSupplierQuery,
};
