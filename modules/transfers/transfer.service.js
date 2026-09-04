const mongoose = require("mongoose");
const StockTransfer = require("./stock-transfer.model");
const StockTransferItem = require("./stock-transfer-item.model");
const Product = require("../products/products.model");
const { applyStockMutation } = require("../inventory/inventory.service");

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

const generateTransferNumber = async (tenantId) => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `TR-${dateStr}-${randomSuffix}`;
};

/**
 * 1. Create Stock Transfer Request (Status: 'draft')
 */
const createStockTransfer = async (tenantId, actorId, data) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");
  requireObjectId(data.sourceBranchId, "sourceBranchId must be a valid ObjectId");
  requireObjectId(data.destinationBranchId, "destinationBranchId must be a valid ObjectId");

  if (data.sourceBranchId.toString() === data.destinationBranchId.toString()) {
    throw createError("sourceBranchId and destinationBranchId must be different", 400);
  }

  // Validate all products belong to tenant
  const productIds = data.items.map((i) => i.productId);
  const validProducts = await Product.find({
    _id: { $in: productIds },
    tenantId,
  });

  if (validProducts.length !== productIds.length) {
    throw createError("One or more products do not belong to this tenant", 400);
  }

  // Generate unique transfer number
  let transferNumber = await generateTransferNumber(tenantId);
  let existing = await StockTransfer.findOne({ tenantId, transferNumber });
  while (existing) {
    transferNumber = await generateTransferNumber(tenantId);
    existing = await StockTransfer.findOne({ tenantId, transferNumber });
  }

  const session = await mongoose.startSession();

  try {
    let createdTransfer;
    let createdItems;

    await session.withTransaction(async () => {
      // 1. Create Transfer Header
      const transfer = new StockTransfer({
        tenantId,
        transferNumber,
        sourceBranchId: data.sourceBranchId,
        destinationBranchId: data.destinationBranchId,
        status: "draft",
        notes: data.notes || "",
        createdBy: actorId,
      });

      createdTransfer = await transfer.save({ session });

      // 2. Create Transfer Line Items in separate collection
      const itemsToInsert = data.items.map((item) => ({
        tenantId,
        transferId: createdTransfer._id,
        productId: item.productId,
        transferredQuantity: item.transferredQuantity,
        receivedQuantity: 0,
        returnedQuantity: 0,
        lostQuantity: 0,
        discrepancyReason: "",
      }));

      createdItems = await StockTransferItem.insertMany(itemsToInsert, { session });
    });

    return {
      transfer: createdTransfer,
      items: createdItems,
    };
  } finally {
    await session.endSession();
  }
};

/**
 * 2. Get Stock Transfers List with filtering
 */
const getStockTransfers = async (tenantId, filters = {}) => {
  requireObjectId(tenantId, "Tenant context is required");

  const query = { tenantId };

  if (filters.sourceBranchId) {
    requireObjectId(filters.sourceBranchId, "sourceBranchId must be a valid ObjectId");
    query.sourceBranchId = filters.sourceBranchId;
  }

  if (filters.destinationBranchId) {
    requireObjectId(filters.destinationBranchId, "destinationBranchId must be a valid ObjectId");
    query.destinationBranchId = filters.destinationBranchId;
  }

  if (filters.status) {
    query.status = filters.status;
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

  const [transfers, total] = await Promise.all([
    StockTransfer.find(query)
      .populate("createdBy", "name email role")
      .populate("approvedBy", "name email role")
      .populate("dispatchedBy", "name email role")
      .populate("receivedBy", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    StockTransfer.countDocuments(query),
  ]);

  return {
    transfers,
    pagination: {
      total,
      page,
      limit,
      returned: transfers.length,
    },
  };
};

/**
 * 3. Get Stock Transfer by ID with itemized status & line items
 */
const getStockTransferById = async (tenantId, transferId) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(transferId, "Transfer ID is invalid");

  const transfer = await StockTransfer.findOne({
    _id: transferId,
    tenantId,
  })
    .populate("createdBy", "name email role")
    .populate("approvedBy", "name email role")
    .populate("dispatchedBy", "name email role")
    .populate("receivedBy", "name email role")
    .populate("discrepancyResolvedBy", "name email role")
    .lean();

  if (!transfer) {
    throw createError("Stock Transfer not found", 404);
  }

  const rawItems = await StockTransferItem.find({
    tenantId,
    transferId,
  })
    .populate("productId", "name sku unit costPrice sellingPrice")
    .lean();

  const items = rawItems.map((item) => {
    const outstandingQuantity = Math.max(
      item.transferredQuantity - item.receivedQuantity - item.returnedQuantity - item.lostQuantity,
      0
    );
    return {
      ...item,
      outstandingQuantity,
    };
  });

  return {
    ...transfer,
    items,
  };
};

/**
 * 4. Update Transfer Status (submit, approve, cancel)
 * Enforces mandatory workflow: draft -> submitted -> approved
 * Cancellation only allowed before dispatch (draft, submitted, approved)
 */
const updateStockTransferStatus = async (tenantId, actorId, transferId, nextStatus, notes) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");
  requireObjectId(transferId, "Transfer ID is invalid");

  const transfer = await StockTransfer.findOne({
    _id: transferId,
    tenantId,
  });

  if (!transfer) {
    throw createError("Stock Transfer not found", 404);
  }

  const currentStatus = transfer.status;

  switch (nextStatus) {
    case "submitted":
      if (currentStatus !== "draft") {
        throw createError(`Cannot submit transfer from status '${currentStatus}'`, 400);
      }
      transfer.status = "submitted";
      break;

    case "approved":
      if (currentStatus !== "submitted") {
        throw createError(
          `Cannot approve transfer from status '${currentStatus}'. Must be 'submitted'`,
          400
        );
      }
      transfer.status = "approved";
      transfer.approvedBy = actorId;
      transfer.approvedAt = new Date();
      break;

    case "cancelled":
      if (["in_transit", "partially_received", "completed", "returned"].includes(currentStatus)) {
        throw createError(
          `Cannot cancel transfer in '${currentStatus}' status. Transfers already dispatched cannot be cancelled; use return workflow instead.`,
          400
        );
      }
      transfer.status = "cancelled";
      break;

    default:
      throw createError(
        `Invalid status transition to '${nextStatus}'. Valid status transitions on this endpoint: submitted, approved, cancelled`,
        400
      );
  }

  if (notes) {
    transfer.notes = transfer.notes
      ? `${transfer.notes}\n[${nextStatus.toUpperCase()}]: ${notes}`
      : `[${nextStatus.toUpperCase()}]: ${notes}`;
  }

  await transfer.save();

  return transfer;
};

/**
 * 5. Dispatch Transfer (approved -> in_transit)
 * Deducts source Stock & creates 'transfer_out' StockMovement atomically.
 * Mandatory approval: rejected if status is not 'approved'.
 */
const dispatchStockTransfer = async (tenantId, actorId, transferId, data = {}) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");
  requireObjectId(transferId, "Transfer ID is invalid");

  const session = await mongoose.startSession();

  try {
    let updatedTransfer;
    let transferItems;
    let movementsCreated = [];

    await session.withTransaction(async () => {
      // 1. Fetch and validate transfer
      const transfer = await StockTransfer.findOne({
        _id: transferId,
        tenantId,
      }).session(session);

      if (!transfer) {
        throw createError("Stock Transfer not found", 404);
      }

      if (transfer.status !== "approved") {
        throw createError(
          `Cannot dispatch transfer in '${transfer.status}' status. Transfer must be 'approved' before dispatch.`,
          400
        );
      }

      // 2. Fetch line items
      transferItems = await StockTransferItem.find({
        tenantId,
        transferId,
      }).session(session);

      if (!transferItems || transferItems.length === 0) {
        throw createError("No line items found for this Stock Transfer", 400);
      }

      // 3. Atomically deduct stock from source branch for each item
      for (const item of transferItems) {
        const mutationResult = await applyStockMutation(session, {
          tenantId,
          branchId: transfer.sourceBranchId,
          productId: item.productId,
          movementType: "transfer_out",
          quantityChange: -item.transferredQuantity,
          reason: `Dispatched Transfer ${transfer.transferNumber}${data.notes ? ` - ${data.notes}` : ""}`,
          actorId,
          allowCreateStock: false,
        });

        movementsCreated.push(mutationResult.movement);
      }

      // 4. Update status to in_transit
      transfer.status = "in_transit";
      transfer.dispatchedBy = actorId;
      transfer.dispatchedAt = new Date();
      if (data.notes) {
        transfer.notes = transfer.notes
          ? `${transfer.notes}\n[DISPATCH]: ${data.notes}`
          : `[DISPATCH]: ${data.notes}`;
      }

      updatedTransfer = await transfer.save({ session });
    });

    return {
      transfer: updatedTransfer,
      items: transferItems,
      movements: movementsCreated,
    };
  } finally {
    await session.endSession();
  }
};

/**
 * 6. Receive Goods at Destination Branch (in_transit / partially_received -> partially_received / completed)
 * Increments destination Stock & creates 'transfer_in' StockMovement atomically.
 * Rejects over-receiving (> outstanding transferredQuantity).
 */
const receiveStockTransfer = async (tenantId, actorId, transferId, data) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");
  requireObjectId(transferId, "Transfer ID is invalid");

  const session = await mongoose.startSession();

  try {
    let updatedTransfer;
    let updatedItems;
    let movementsCreated = [];

    await session.withTransaction(async () => {
      // 1. Fetch and validate transfer
      const transfer = await StockTransfer.findOne({
        _id: transferId,
        tenantId,
      }).session(session);

      if (!transfer) {
        throw createError("Stock Transfer not found", 404);
      }

      if (!["in_transit", "partially_received"].includes(transfer.status)) {
        throw createError(
          `Cannot receive goods for transfer in '${transfer.status}' status. Transfer must be 'in_transit' or 'partially_received'.`,
          400
        );
      }

      // 2. Fetch line items
      const transferItems = await StockTransferItem.find({
        tenantId,
        transferId,
      }).session(session);

      if (!transferItems || transferItems.length === 0) {
        throw createError("No line items found for this Stock Transfer", 400);
      }

      // 3. Process each received item
      for (const receivedItem of data.items) {
        const item = transferItems.find(
          (ti) => ti.productId.toString() === receivedItem.productId.toString()
        );

        if (!item) {
          throw createError(
            `Product ${receivedItem.productId} is not part of this Stock Transfer`,
            400
          );
        }

        const remainingReceivable =
          item.transferredQuantity - item.receivedQuantity - item.returnedQuantity - item.lostQuantity;

        if (remainingReceivable <= 0) {
          throw createError(
            `Product ${receivedItem.productId} has already been fully accounted for (transferred: ${item.transferredQuantity}, received: ${item.receivedQuantity}, returned: ${item.returnedQuantity}, lost: ${item.lostQuantity})`,
            400
          );
        }

        if (receivedItem.quantityReceived > remainingReceivable) {
          throw createError(
            `Requested receipt of ${receivedItem.quantityReceived} exceeds remaining unaccounted quantity of ${remainingReceivable} for product ${receivedItem.productId}. Over-receipt is strictly rejected for transfers.`,
            400
          );
        }

        // Update item received quantity
        item.receivedQuantity += receivedItem.quantityReceived;
        await item.save({ session });

        // Apply atomic stock mutation to destination branch
        const mutationResult = await applyStockMutation(session, {
          tenantId,
          branchId: transfer.destinationBranchId,
          productId: receivedItem.productId,
          movementType: "transfer_in",
          quantityChange: receivedItem.quantityReceived,
          reason: `Received Transfer ${transfer.transferNumber}${data.notes ? ` - ${data.notes}` : ""}`,
          actorId,
          allowCreateStock: true,
        });

        movementsCreated.push(mutationResult.movement);
      }

      // 4. Evaluate if all items are fully accounted for
      const allItemsAccounted = transferItems.every(
        (ti) =>
          ti.receivedQuantity + ti.returnedQuantity + ti.lostQuantity >= ti.transferredQuantity
      );

      if (allItemsAccounted) {
        transfer.status = "completed";
        transfer.receivedBy = actorId;
        transfer.receivedAt = new Date();
      } else {
        transfer.status = "partially_received";
      }

      if (data.notes) {
        transfer.notes = transfer.notes
          ? `${transfer.notes}\n[RECEIVE]: ${data.notes}`
          : `[RECEIVE]: ${data.notes}`;
      }

      updatedTransfer = await transfer.save({ session });
      updatedItems = transferItems;
    });

    return {
      transfer: updatedTransfer,
      items: updatedItems,
      movements: movementsCreated,
    };
  } finally {
    await session.endSession();
  }
};

/**
 * 7. Return Goods Back to Source Branch
 * Restores source Stock & creates 'transfer_return' StockMovement atomically.
 */
const returnStockTransfer = async (tenantId, actorId, transferId, data) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");
  requireObjectId(transferId, "Transfer ID is invalid");

  const session = await mongoose.startSession();

  try {
    let updatedTransfer;
    let updatedItems;
    let movementsCreated = [];

    await session.withTransaction(async () => {
      // 1. Fetch and validate transfer
      const transfer = await StockTransfer.findOne({
        _id: transferId,
        tenantId,
      }).session(session);

      if (!transfer) {
        throw createError("Stock Transfer not found", 404);
      }

      if (!["in_transit", "partially_received"].includes(transfer.status)) {
        throw createError(
          `Cannot process returns for transfer in '${transfer.status}' status. Transfer must be 'in_transit' or 'partially_received'.`,
          400
        );
      }

      // 2. Fetch line items
      const transferItems = await StockTransferItem.find({
        tenantId,
        transferId,
      }).session(session);

      if (!transferItems || transferItems.length === 0) {
        throw createError("No line items found for this Stock Transfer", 400);
      }

      // 3. Process each returned item
      for (const returnItem of data.items) {
        const item = transferItems.find(
          (ti) => ti.productId.toString() === returnItem.productId.toString()
        );

        if (!item) {
          throw createError(
            `Product ${returnItem.productId} is not part of this Stock Transfer`,
            400
          );
        }

        const remainingReturnable =
          item.transferredQuantity - item.receivedQuantity - item.returnedQuantity - item.lostQuantity;

        if (remainingReturnable <= 0) {
          throw createError(
            `Product ${returnItem.productId} has no remaining quantity available to return`,
            400
          );
        }

        if (returnItem.quantityReturned > remainingReturnable) {
          throw createError(
            `Requested return of ${returnItem.quantityReturned} exceeds remaining unaccounted quantity of ${remainingReturnable} for product ${returnItem.productId}`,
            400
          );
        }

        // Update item returned quantity
        item.returnedQuantity += returnItem.quantityReturned;
        await item.save({ session });

        // Apply atomic stock mutation to source branch using 'transfer_return'
        const mutationResult = await applyStockMutation(session, {
          tenantId,
          branchId: transfer.sourceBranchId,
          productId: returnItem.productId,
          movementType: "transfer_return",
          quantityChange: returnItem.quantityReturned,
          reason: `Transfer Return ${transfer.transferNumber}: ${data.reason}`,
          actorId,
          allowCreateStock: true,
        });

        movementsCreated.push(mutationResult.movement);
      }

      // 4. Evaluate transfer status
      const allItemsAccounted = transferItems.every(
        (ti) =>
          ti.receivedQuantity + ti.returnedQuantity + ti.lostQuantity >= ti.transferredQuantity
      );

      const allItemsReturned = transferItems.every(
        (ti) => ti.returnedQuantity === ti.transferredQuantity
      );

      if (allItemsReturned) {
        transfer.status = "returned";
      } else if (allItemsAccounted) {
        transfer.status = "completed";
      } else {
        transfer.status = "partially_received";
      }

      transfer.notes = transfer.notes
        ? `${transfer.notes}\n[RETURN]: ${data.reason}`
        : `[RETURN]: ${data.reason}`;

      updatedTransfer = await transfer.save({ session });
      updatedItems = transferItems;
    });

    return {
      transfer: updatedTransfer,
      items: updatedItems,
      movements: movementsCreated,
    };
  } finally {
    await session.endSession();
  }
};

/**
 * 8. Explicit Discrepancy / Loss Resolution Workflow
 * Records lostQuantity on line items and closes discrepancy with auditable actor & reason.
 * Does NOT generate destination stock.
 */
const resolveTransferDiscrepancy = async (tenantId, actorId, transferId, data) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");
  requireObjectId(transferId, "Transfer ID is invalid");

  const session = await mongoose.startSession();

  try {
    let updatedTransfer;
    let updatedItems;

    await session.withTransaction(async () => {
      // 1. Fetch and validate transfer
      const transfer = await StockTransfer.findOne({
        _id: transferId,
        tenantId,
      }).session(session);

      if (!transfer) {
        throw createError("Stock Transfer not found", 404);
      }

      if (!["in_transit", "partially_received"].includes(transfer.status)) {
        throw createError(
          `Cannot resolve discrepancies for transfer in '${transfer.status}' status. Transfer must be 'in_transit' or 'partially_received'.`,
          400
        );
      }

      // 2. Fetch line items
      const transferItems = await StockTransferItem.find({
        tenantId,
        transferId,
      }).session(session);

      if (!transferItems || transferItems.length === 0) {
        throw createError("No line items found for this Stock Transfer", 400);
      }

      // 3. Process each discrepancy item
      for (const discItem of data.items) {
        const item = transferItems.find(
          (ti) => ti.productId.toString() === discItem.productId.toString()
        );

        if (!item) {
          throw createError(
            `Product ${discItem.productId} is not part of this Stock Transfer`,
            400
          );
        }

        const remainingUnaccounted =
          item.transferredQuantity - item.receivedQuantity - item.returnedQuantity - item.lostQuantity;

        if (discItem.lostQuantity > remainingUnaccounted) {
          throw createError(
            `Discrepancy quantity of ${discItem.lostQuantity} exceeds remaining unaccounted quantity of ${remainingUnaccounted} for product ${discItem.productId}`,
            400
          );
        }

        item.lostQuantity += discItem.lostQuantity;
        item.discrepancyReason = data.reason;
        await item.save({ session });
      }

      // 4. Check if all items are fully accounted for
      const allItemsAccounted = transferItems.every(
        (ti) =>
          ti.receivedQuantity + ti.returnedQuantity + ti.lostQuantity >= ti.transferredQuantity
      );

      if (allItemsAccounted) {
        transfer.status = "completed";
      } else {
        transfer.status = "partially_received";
      }

      transfer.discrepancyResolvedBy = actorId;
      transfer.discrepancyResolvedAt = new Date();
      transfer.discrepancyResolutionNotes = data.reason;

      updatedTransfer = await transfer.save({ session });
      updatedItems = transferItems;
    });

    return {
      transfer: updatedTransfer,
      items: updatedItems,
    };
  } finally {
    await session.endSession();
  }
};

module.exports = {
  createStockTransfer,
  getStockTransfers,
  getStockTransferById,
  updateStockTransferStatus,
  dispatchStockTransfer,
  receiveStockTransfer,
  returnStockTransfer,
  resolveTransferDiscrepancy,
};
