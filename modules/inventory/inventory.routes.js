const express = require("express");

const inventoryController = require("./inventory.controller");
const {
  validateOpeningStock,
  validateStockQuery,
  validateMovementsQuery,
  validateAdjustment,
  validateWaste,
  validateConsumption,
  validateReconcile,
} = require("./inventory.validation");
const authenticate = require("../../shared/middleware/auth.middleware");
const authorizeRoles = require("../../shared/middleware/role.middleware");

const router = express.Router();

/**
 * PROVISIONAL INVENTORY RBAC PERMISSIONS (Pending Team-Lead Confirmation)
 * - Viewers are temporarily granted read-only access.
 * - Roles can easily be updated here once team lead finalizes Inventory-specific matrix.
 */
const INVENTORY_ROLES = {
  VIEW_STOCK: [
    "admin",
    "inventory_manager",
    "manager",
    "purchase_staff",
    "branch_staff",
    "viewer", // Temporary read-only access pending team-lead clarification
  ],
  VIEW_MOVEMENTS: [
    "admin",
    "inventory_manager",
    "manager",
    "purchase_staff",
    "branch_staff",
    "viewer", // Temporary read-only access pending team-lead clarification
  ],
  OPENING_STOCK: ["admin", "inventory_manager"],
  ADJUSTMENTS: ["admin", "inventory_manager"],
  WASTE: ["admin", "inventory_manager", "manager", "branch_staff"],
  CONSUMPTION: ["admin", "inventory_manager", "manager", "branch_staff"],
  RECONCILE: ["admin", "inventory_manager"],
};

// 1. Opening Stock (Initial branch stock initialization)
router.post(
  "/opening-stock",
  authenticate,
  authorizeRoles(...INVENTORY_ROLES.OPENING_STOCK),
  validateOpeningStock,
  inventoryController.createOpeningStock
);

// 2. Current Stock Balances & Low Stock Indicators
router.get(
  "/stock",
  authenticate,
  authorizeRoles(...INVENTORY_ROLES.VIEW_STOCK),
  validateStockQuery,
  inventoryController.getStockBalances
);

// 3. Stock Movement History (Audit Ledger)
router.get(
  "/movements",
  authenticate,
  authorizeRoles(...INVENTORY_ROLES.VIEW_MOVEMENTS),
  validateMovementsQuery,
  inventoryController.getMovements
);

// 4. Stock Adjustment (Manual delta corrections with required reason)
router.post(
  "/adjustments",
  authenticate,
  authorizeRoles(...INVENTORY_ROLES.ADJUSTMENTS),
  validateAdjustment,
  inventoryController.createAdjustment
);

// 5. Record Waste / Spoilage / Damage
router.post(
  "/waste",
  authenticate,
  authorizeRoles(...INVENTORY_ROLES.WASTE),
  validateWaste,
  inventoryController.createWaste
);

// 6. Record Internal / Kitchen Consumption
router.post(
  "/consumption",
  authenticate,
  authorizeRoles(...INVENTORY_ROLES.CONSUMPTION),
  validateConsumption,
  inventoryController.createConsumption
);

// 7. Physical Stock Count Reconciliation
router.post(
  "/reconcile",
  authenticate,
  authorizeRoles(...INVENTORY_ROLES.RECONCILE),
  validateReconcile,
  inventoryController.reconcileStock
);

module.exports = router;

