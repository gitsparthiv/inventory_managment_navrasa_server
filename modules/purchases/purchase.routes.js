const express = require("express");

const purchaseController = require("./purchase.controller");
const {
  validateCreatePurchaseOrder,
  validateUpdatePOStatus,
  validateReceivePurchaseOrder,
  validatePurchaseQuery,
} = require("./purchase.validation");
const authenticate = require("../../shared/middleware/auth.middleware");
const authorizeRoles = require("../../shared/middleware/role.middleware");

const router = express.Router();

/**
 * APPROVED PART B PURCHASING RBAC PERMISSIONS:
 * - PO read: all read-only roles (admin, inventory_manager, purchase_staff, manager, branch_staff, viewer)
 * - PO create: admin, inventory_manager, purchase_staff
 * - PO approval: admin, manager, inventory_manager
 * - PO send: admin, purchase_staff, inventory_manager
 * - PO receive: admin, inventory_manager, purchase_staff, branch_staff
 * - PO close: admin, inventory_manager, manager
 */
const PURCHASE_ROLES = {
  VIEW: [
    "admin",
    "inventory_manager",
    "manager",
    "purchase_staff",
    "branch_staff",
    "viewer",
  ],
  CREATE: ["admin", "inventory_manager", "purchase_staff"],
  UPDATE_STATUS: [
    "admin",
    "inventory_manager",
    "manager",
    "purchase_staff",
  ],
  RECEIVE: [
    "admin",
    "inventory_manager",
    "purchase_staff",
    "branch_staff",
  ],
};

// 1. List Purchase Orders
router.get(
  "/",
  authenticate,
  authorizeRoles(...PURCHASE_ROLES.VIEW),
  validatePurchaseQuery,
  purchaseController.getPurchaseOrders
);

// 2. Create Purchase Order
router.post(
  "/",
  authenticate,
  authorizeRoles(...PURCHASE_ROLES.CREATE),
  validateCreatePurchaseOrder,
  purchaseController.createPurchaseOrder
);

// 3. Get Purchase Order Details by ID
router.get(
  "/:id",
  authenticate,
  authorizeRoles(...PURCHASE_ROLES.VIEW),
  purchaseController.getPurchaseOrderById
);

// 4. Update PO Lifecycle Status (submit, approve, send, close, cancel)
router.patch(
  "/:id/status",
  authenticate,
  authorizeRoles(...PURCHASE_ROLES.UPDATE_STATUS),
  validateUpdatePOStatus,
  purchaseController.updatePurchaseOrderStatus
);

// 5. Receive Goods for PO (Increments stock & records stock_in movement)
router.post(
  "/:id/receive",
  authenticate,
  authorizeRoles(...PURCHASE_ROLES.RECEIVE),
  validateReceivePurchaseOrder,
  purchaseController.receivePurchaseOrder
);

module.exports = router;
