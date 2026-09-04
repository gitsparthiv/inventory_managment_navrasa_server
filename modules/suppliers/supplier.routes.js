const express = require("express");

const supplierController = require("./supplier.controller");
const {
  validateCreateSupplier,
  validateUpdateSupplier,
  validateSupplierQuery,
} = require("./supplier.validation");
const authenticate = require("../../shared/middleware/auth.middleware");
const authorizeRoles = require("../../shared/middleware/role.middleware");

const router = express.Router();

const SUPPLIER_ROLES = {
  VIEW: [
    "admin",
    "inventory_manager",
    "manager",
    "purchase_staff",
    "branch_staff",
    "viewer", // Temporary view-only
  ],
  MANAGE: ["admin", "inventory_manager", "purchase_staff"],
};

// List suppliers
router.get(
  "/",
  authenticate,
  authorizeRoles(...SUPPLIER_ROLES.VIEW),
  validateSupplierQuery,
  supplierController.getSuppliers
);

// Create supplier
router.post(
  "/",
  authenticate,
  authorizeRoles(...SUPPLIER_ROLES.MANAGE),
  validateCreateSupplier,
  supplierController.createSupplier
);

// Get supplier by ID
router.get(
  "/:id",
  authenticate,
  authorizeRoles(...SUPPLIER_ROLES.VIEW),
  supplierController.getSupplierById
);

// Update supplier
router.patch(
  "/:id",
  authenticate,
  authorizeRoles(...SUPPLIER_ROLES.MANAGE),
  validateUpdateSupplier,
  supplierController.updateSupplier
);

// Get supplier purchasing history
router.get(
  "/:id/history",
  authenticate,
  authorizeRoles(...SUPPLIER_ROLES.VIEW),
  supplierController.getSupplierHistory
);

module.exports = router;
