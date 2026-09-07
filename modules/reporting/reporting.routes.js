const express = require("express");
const reportingController = require("./reporting.controller");
const {
  validateInventoryReportQuery,
  validateLowStockReportQuery,
  validateMovementsReportQuery,
  validatePurchasingReportQuery,
  validateSuppliersReportQuery,
  validateDashboardQuery,
} = require("./reporting.validation");
const authenticate = require("../../shared/middleware/auth.middleware");
const authorizeRoles = require("../../shared/middleware/role.middleware");

const router = express.Router();

/**
 * APPROVED REPORTING RBAC PERMISSIONS:
 * - General reports & dashboard: admin, inventory_manager, manager, purchase_staff, branch_staff, viewer
 * - Sensitive Purchasing & Supplier Spend reports: admin, inventory_manager, manager, purchase_staff, viewer (EXCLUDES branch_staff)
 */
const GENERAL_REPORT_ROLES = [
  "admin",
  "inventory_manager",
  "manager",
  "purchase_staff",
  "branch_staff",
  "viewer",
];

const FINANCIAL_REPORT_ROLES = [
  "admin",
  "inventory_manager",
  "manager",
  "purchase_staff",
  "viewer",
];

// 1. Dashboard Metrics
router.get(
  "/dashboard",
  authenticate,
  authorizeRoles(...GENERAL_REPORT_ROLES),
  validateDashboardQuery,
  reportingController.getDashboardMetrics
);

// 2. Inventory Valuation Report (PRD explicit endpoint)
router.get(
  "/inventory",
  authenticate,
  authorizeRoles(...GENERAL_REPORT_ROLES),
  validateInventoryReportQuery,
  reportingController.getInventoryReport
);

// 3. Low-Stock & Critical Reorder Report
router.get(
  "/low-stock",
  authenticate,
  authorizeRoles(...GENERAL_REPORT_ROLES),
  validateLowStockReportQuery,
  reportingController.getLowStockReport
);

// 4. Stock Movement & Flow Audit Report
router.get(
  "/movements",
  authenticate,
  authorizeRoles(...GENERAL_REPORT_ROLES),
  validateMovementsReportQuery,
  reportingController.getMovementsReport
);

// 5. Purchasing & Spend Summary Report (Restricted from branch_staff)
router.get(
  "/purchasing",
  authenticate,
  authorizeRoles(...FINANCIAL_REPORT_ROLES),
  validatePurchasingReportQuery,
  reportingController.getPurchasingReport
);

// 6. Supplier Performance & Spend Breakdown (Restricted from branch_staff)
router.get(
  "/suppliers",
  authenticate,
  authorizeRoles(...FINANCIAL_REPORT_ROLES),
  validateSuppliersReportQuery,
  reportingController.getSuppliersReport
);

module.exports = router;
