const express = require("express");

const productController = require("./product.controller");
const {
  validateCreateProduct,
  validateUpdateProduct,
} = require("./product.validation");
const authenticate = require("../../shared/middleware/auth.middleware");

const router = express.Router();

router.get("/", authenticate, productController.getProducts);
router.post("/", authenticate, validateCreateProduct, productController.createProduct);
router.patch("/:id", authenticate, validateUpdateProduct, productController.updateProduct);

module.exports = router;
