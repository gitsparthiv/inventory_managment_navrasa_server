const express = require("express");

const inventoryController = require("./inventory.controller");
const { validateOpeningStock } = require("./inventory.validation");
const authenticate = require("../../shared/middleware/auth.middleware");

const router = express.Router();

router.post(
  "/opening-stock",
  authenticate,
  validateOpeningStock,
  inventoryController.createOpeningStock
);

module.exports = router;
