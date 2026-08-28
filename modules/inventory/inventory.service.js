const mongoose = require("mongoose");

const Product = require("../products/products.model");
const Stock = require("./stock.model");
const StockMovement = require("./stock-movement.model");

const createError = (message, status) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const requireObjectId = (value, message) => {
  if (!value || !mongoose.isValidObjectId(value)) {
    throw createError(message, 400);
  }
};

const createOpeningStock = async (tenantId, actorId, data) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");

  const session = await mongoose.startSession();

  try {
    let stock;
    let movement;

    await session.withTransaction(async () => {
      const product = await Product.findOne({
        _id: data.productId,
        tenantId,
      }).session(session);

      if (!product) {
        throw createError("Product not found", 404);
      }

      const stockQuery = {
        tenantId,
        branchId: data.branchId,
        productId: data.productId,
      };

      const [existingStock, openingMovement] = await Promise.all([
        Stock.findOne(stockQuery).session(session),
        StockMovement.findOne({ ...stockQuery, movementType: "opening" }).session(session),
      ]);

      if (existingStock || openingMovement) {
        throw createError(
          "Opening stock already exists for this branch and product",
          409
        );
      }

      stock = new Stock({
        ...stockQuery,
        quantity: data.quantity,
      });
      await stock.save({ session });

      movement = new StockMovement({
        ...stockQuery,
        movementType: "opening",
        quantityChange: data.quantity,
        reason: data.reason,
        actorId,
      });
      await movement.save({ session });
    });

    return { stock, movement };
  } finally {
    await session.endSession();
  }
};

module.exports = {
  createOpeningStock,
};
