const express = require("express");

const transferController = require("./transfer.controller");
const {
  validateCreateTransfer,
  validateUpdateTransferStatus,
  validateReceiveTransfer,
  validateReturnTransfer,
  validateResolveDiscrepancy,
  validateTransferQuery,
} = require("./transfer.validation");
const authenticate = require("../../shared/middleware/auth.middleware");
const authorizeRoles = require("../../shared/middleware/role.middleware");

const router = express.Router();

/**
 * APPROVED PART C TRANSFERS RBAC PERMISSIONS:
 * - View: admin, inventory_manager, manager, purchase_staff, branch_staff, viewer
 * - Create: admin, inventory_manager, manager, branch_staff
 * - Approve: admin, inventory_manager, manager
 * - Dispatch: admin, inventory_manager, branch_staff
 * - Receive: admin, inventory_manager, branch_staff
 * - Return: admin, inventory_manager, branch_staff
 * - Cancel: admin, inventory_manager, manager
 * - Resolve Discrepancy: admin, inventory_manager, manager
 */
const TRANSFER_ROLES = {
  VIEW: [
    "admin",
    "inventory_manager",
    "manager",
    "purchase_staff",
    "branch_staff",
    "viewer",
  ],
  CREATE: ["admin", "inventory_manager", "manager", "branch_staff"],
  APPROVE: ["admin", "inventory_manager", "manager"],
  DISPATCH: ["admin", "inventory_manager", "branch_staff"],
  RECEIVE: ["admin", "inventory_manager", "branch_staff"],
  RETURN: ["admin", "inventory_manager", "branch_staff"],
  CANCEL: ["admin", "inventory_manager", "manager"],
  STATUS: ["admin", "inventory_manager", "manager", "branch_staff"],
};

// 1. List Transfers
router.get(
  "/",
  authenticate,
  authorizeRoles(...TRANSFER_ROLES.VIEW),
  validateTransferQuery,
  transferController.getStockTransfers
);

// 2. Create Transfer (Draft)
router.post(
  "/",
  authenticate,
  authorizeRoles(...TRANSFER_ROLES.CREATE),
  validateCreateTransfer,
  transferController.createStockTransfer
);

// 3. Get Transfer Details by ID
router.get(
  "/:id",
  authenticate,
  authorizeRoles(...TRANSFER_ROLES.VIEW),
  transferController.getStockTransferById
);

// 4. Update Transfer Status (submit, approve, cancel)
router.patch(
  "/:id/status",
  authenticate,
  authorizeRoles(...TRANSFER_ROLES.STATUS),
  validateUpdateTransferStatus,
  transferController.updateStockTransferStatus
);

// 5. Dispatch Transfer (Requires approved status; deducts source stock & creates transfer_out movement)
router.post(
  "/:id/dispatch",
  authenticate,
  authorizeRoles(...TRANSFER_ROLES.DISPATCH),
  transferController.dispatchStockTransfer
);

// 6. Receive Goods at Destination (Increments destination stock & creates transfer_in movement)
router.post(
  "/:id/receive",
  authenticate,
  authorizeRoles(...TRANSFER_ROLES.RECEIVE),
  validateReceiveTransfer,
  transferController.receiveStockTransfer
);

// 7. Return Goods Back to Source (Restores source stock & creates transfer_return movement)
router.post(
  "/:id/return",
  authenticate,
  authorizeRoles(...TRANSFER_ROLES.RETURN),
  validateReturnTransfer,
  transferController.returnStockTransfer
);

// 8. Explicit Discrepancy / Loss Resolution (Authorized management settles transit discrepancy)
router.post(
  "/:id/resolve-discrepancy",
  authenticate,
  authorizeRoles(...TRANSFER_ROLES.APPROVE),
  validateResolveDiscrepancy,
  transferController.resolveTransferDiscrepancy
);

module.exports = router;
