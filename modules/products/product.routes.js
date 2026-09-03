const express = require("express");

const productController = require("./product.controller");
const {
  validateCreateProduct,
  validateUpdateProduct,
} = require("./product.validation");
const authenticate = require("../../shared/middleware/auth.middleware");
const authorizeRoles = require("../../shared/middleware/role.middleware");

const router = express.Router();

router.get(
  "/",
  authenticate,
  authorizeRoles(
    "admin",
    "inventory_manager",
    "manager",
    "purchase_staff",
    "branch_staff",
    "viewer"
  ),
  productController.getProducts
);
router.post(
  "/",
  authenticate,
  authorizeRoles("admin", "inventory_manager"),
  validateCreateProduct,
  productController.createProduct
);
router.patch(
  "/:id",
  authenticate,
  authorizeRoles("admin", "inventory_manager"),
  validateUpdateProduct,
  productController.updateProduct
);

module.exports = router;
