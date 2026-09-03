const mongoose = require("mongoose");

const Product = require("../products/products.model");
const Stock = require("./stock.model");
const StockMovement = require("./stock-movement.model");
const User = require("../auth/auth.model");

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

/**
 * Shared internal transactional helper for atomic stock balance and movement mutation.
 * Handles product validation, non-negative stock verification, stock balance upsert/update,
 * and immutable stock movement recording.
 */
const applyStockMutation = async (
  session,
  {
    tenantId,
    branchId,
    productId,
    movementType,
    quantityChange,
    reason,
    actorId,
    allowCreateStock = false,
  }
) => {
  const product = await Product.findOne({
    _id: productId,
    tenantId,
  }).session(session);

  if (!product) {
    throw createError("Product not found", 404);
  }

  const stockQuery = {
    tenantId,
    branchId,
    productId,
  };

  let stock = await Stock.findOne(stockQuery).session(session);

  if (!stock) {
    if (!allowCreateStock) {
      throw createError(
        "Stock record does not exist for this branch and product",
        404
      );
    }

    // Working implementation assumption: Reject negative stock balance
    if (quantityChange < 0) {
      throw createError(
        "Cannot decrease stock when no initial balance exists",
        400
      );
    }

    stock = new Stock({
      ...stockQuery,
      quantity: quantityChange,
    });
    await stock.save({ session });
  } else {
    const resultingQuantity = stock.quantity + quantityChange;

    // Working implementation assumption: Reject negative stock balance (pending business confirmation)
    if (resultingQuantity < 0) {
      throw createError(
        `Insufficient stock balance. Current: ${stock.quantity}, requested change: ${quantityChange}`,
        400
      );
    }

    stock.quantity = resultingQuantity;
    await stock.save({ session });
  }

  const movement = new StockMovement({
    ...stockQuery,
    movementType,
    quantityChange,
    reason,
    actorId,
  });
  await movement.save({ session });

  return { stock, movement, product };
};

/**
 * POST /api/inventory/opening-stock
 * Initial setup of branch product stock. Exactly one opening record per (tenant, branch, product).
 */
const createOpeningStock = async (tenantId, actorId, data) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
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

      result = await applyStockMutation(session, {
        tenantId,
        branchId: data.branchId,
        productId: data.productId,
        movementType: "opening",
        quantityChange: data.quantity,
        reason: data.reason,
        actorId,
        allowCreateStock: true,
      });
    });

    return { stock: result.stock, movement: result.movement };
  } finally {
    await session.endSession();
  }
};

/**
 * GET /api/inventory/stock
 * Retrieve current stock balances with low-stock indicators and filtering.
 */
const getStockBalances = async (tenantId, filters = {}) => {
  requireObjectId(tenantId, "Tenant context is required");

  const query = { tenantId };

  if (filters.branchId) {
    requireObjectId(filters.branchId, "branchId must be a valid ObjectId");
    query.branchId = filters.branchId;
  }

  if (filters.productId) {
    requireObjectId(filters.productId, "productId must be a valid ObjectId");
    query.productId = filters.productId;
  }

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 50;
  const skip = (page - 1) * limit;

  const [rawStockList, total] = await Promise.all([
    Stock.find(query)
      .populate("productId", "name sku barcode categoryId unit costPrice sellingPrice minimumStock reorderLevel status")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Stock.countDocuments(query),
  ]);

  const stockList = rawStockList.map((item) => {
    const product = item.productId;
    const reorderLevel = product?.reorderLevel ?? 0;
    const minimumStock = product?.minimumStock ?? 0;

    const isLowStock = product ? item.quantity <= reorderLevel : false;
    const isCriticalStock = product ? item.quantity <= minimumStock : false;

    return {
      ...item,
      isLowStock,
      isCriticalStock,
    };
  });

  const finalResults =
    filters.lowStock === "true" || filters.lowStock === true
      ? stockList.filter((item) => item.isLowStock)
      : stockList;

  return {
    stocks: finalResults,
    pagination: {
      total,
      page,
      limit,
      returned: finalResults.length,
    },
  };
};

/**
 * GET /api/inventory/movements
 * Retrieve immutable stock movement audit ledger.
 */
const getMovements = async (tenantId, filters = {}) => {
  requireObjectId(tenantId, "Tenant context is required");

  const query = { tenantId };

  if (filters.branchId) {
    requireObjectId(filters.branchId, "branchId must be a valid ObjectId");
    query.branchId = filters.branchId;
  }

  if (filters.productId) {
    requireObjectId(filters.productId, "productId must be a valid ObjectId");
    query.productId = filters.productId;
  }

  if (filters.movementType) {
    query.movementType = filters.movementType;
  }

  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) {
      query.createdAt.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      query.createdAt.$lte = new Date(filters.endDate);
    }
  }

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 50;
  const skip = (page - 1) * limit;

  const [movements, total] = await Promise.all([
    StockMovement.find(query)
      .populate("productId", "name sku unit")
      .populate("actorId", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    StockMovement.countDocuments(query),
  ]);

  return {
    movements,
    pagination: {
      total,
      page,
      limit,
      returned: movements.length,
    },
  };
};

/**
 * POST /api/inventory/adjustments
 * Manual stock adjustment with positive or negative delta and required reason.
 */
const createAdjustment = async (tenantId, actorId, data) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");

  const session = await mongoose.startSession();

  try {
    let result;
    await session.withTransaction(async () => {
      result = await applyStockMutation(session, {
        tenantId,
        branchId: data.branchId,
        productId: data.productId,
        movementType: "adjustment",
        quantityChange: data.quantityChange,
        reason: data.reason,
        actorId,
        allowCreateStock: false,
      });
    });

    return { stock: result.stock, movement: result.movement };
  } finally {
    await session.endSession();
  }
};

/**
 * POST /api/inventory/waste
 * Record discarded / spoiled / damaged stock. Decreases stock balance.
 */
const createWaste = async (tenantId, actorId, data) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");

  const session = await mongoose.startSession();

  try {
    let result;
    await session.withTransaction(async () => {
      result = await applyStockMutation(session, {
        tenantId,
        branchId: data.branchId,
        productId: data.productId,
        movementType: "waste",
        quantityChange: -Math.abs(data.quantity),
        reason: data.reason,
        actorId,
        allowCreateStock: false,
      });
    });

    return { stock: result.stock, movement: result.movement };
  } finally {
    await session.endSession();
  }
};

/**
 * POST /api/inventory/consumption
 * Record operational / kitchen stock consumption. Decreases stock balance.
 */
const createConsumption = async (tenantId, actorId, data) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");

  const session = await mongoose.startSession();

  try {
    let result;
    await session.withTransaction(async () => {
      result = await applyStockMutation(session, {
        tenantId,
        branchId: data.branchId,
        productId: data.productId,
        movementType: "consumption",
        quantityChange: -Math.abs(data.quantity),
        reason: data.reason,
        actorId,
        allowCreateStock: false,
      });
    });

    return { stock: result.stock, movement: result.movement };
  } finally {
    await session.endSession();
  }
};

/**
 * POST /api/inventory/reconcile
 * Reconcile physical inventory count against system balance. Records variance.
 */
const reconcileStock = async (tenantId, actorId, data) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");

  const session = await mongoose.startSession();

  try {
    let outcome;
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

      const stock = await Stock.findOne(stockQuery).session(session);

      if (!stock) {
        throw createError(
          "Stock record does not exist for this branch and product to reconcile",
          404
        );
      }

      const previousQuantity = stock.quantity;
      const countedQuantity = data.countedQuantity;
      const variance = countedQuantity - previousQuantity;

      if (variance === 0) {
        outcome = {
          previousQuantity,
          countedQuantity,
          variance: 0,
          stock,
          movement: null,
          message: "Counted quantity matches system balance. No variance recorded.",
        };
        return;
      }

      const result = await applyStockMutation(session, {
        tenantId,
        branchId: data.branchId,
        productId: data.productId,
        movementType: "reconciliation",
        quantityChange: variance,
        reason: data.reason,
        actorId,
        allowCreateStock: false,
      });

      outcome = {
        previousQuantity,
        countedQuantity,
        variance,
        stock: result.stock,
        movement: result.movement,
        message: "Stock balance successfully reconciled",
      };
    });

    return outcome;
  } finally {
    await session.endSession();
  }
};

module.exports = {
  applyStockMutation,
  createOpeningStock,
  getStockBalances,
  getMovements,
  createAdjustment,
  createWaste,
  createConsumption,
  reconcileStock,
};


