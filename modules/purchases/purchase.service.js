const mongoose = require("mongoose");
const PurchaseOrder = require("./purchase-order.model");
const PurchaseOrderItem = require("./purchase-order-item.model");
const Supplier = require("../suppliers/supplier.model");
const Product = require("../products/products.model");
const { applyStockMutation } = require("../inventory/inventory.service");

// Default 10% over-receipt tolerance as approved
const OVER_RECEIPT_TOLERANCE_PERCENT = 0.10;

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

const generatePONumber = async (tenantId) => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `PO-${dateStr}-${randomSuffix}`;
};

const createPurchaseOrder = async (tenantId, actorId, data) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");

  // Validate supplier
  const supplier = await Supplier.findOne({
    _id: data.supplierId,
    tenantId,
  });

  if (!supplier) {
    throw createError("Supplier not found for this tenant", 404);
  }

  if (supplier.status !== "active") {
    throw createError("Cannot create Purchase Order for an inactive supplier", 400);
  }

  // Validate all products
  const productIds = data.items.map((i) => i.productId);
  const validProducts = await Product.find({
    _id: { $in: productIds },
    tenantId,
  });

  if (validProducts.length !== productIds.length) {
    throw createError("One or more products do not belong to this tenant", 400);
  }

  // Generate unique PO number
  let poNumber = await generatePONumber(tenantId);
  let existingPO = await PurchaseOrder.findOne({ tenantId, poNumber });
  while (existingPO) {
    poNumber = await generatePONumber(tenantId);
    existingPO = await PurchaseOrder.findOne({ tenantId, poNumber });
  }

  // Calculate total
  const totalAmount = data.items.reduce(
    (sum, item) => sum + item.orderedQuantity * item.unitCost,
    0
  );

  const session = await mongoose.startSession();

  try {
    let createdPO;
    let createdItems;

    await session.withTransaction(async () => {
      // 1. Create Purchase Order Header
      const po = new PurchaseOrder({
        tenantId,
        branchId: data.branchId,
        supplierId: data.supplierId,
        poNumber,
        status: "draft",
        expectedDeliveryDate: data.expectedDeliveryDate,
        notes: data.notes || "",
        totalAmount,
        createdBy: actorId,
      });

      createdPO = await po.save({ session });

      // 2. Create Purchase Order Items in separate collection
      const itemsToInsert = data.items.map((item) => ({
        tenantId,
        purchaseOrderId: createdPO._id,
        productId: item.productId,
        orderedQuantity: item.orderedQuantity,
        receivedQuantity: 0,
        unitCost: item.unitCost,
        totalCost: item.orderedQuantity * item.unitCost,
      }));

      createdItems = await PurchaseOrderItem.insertMany(itemsToInsert, { session });
    });

    return {
      purchaseOrder: createdPO,
      items: createdItems,
    };
  } finally {
    await session.endSession();
  }
};

const getPurchaseOrders = async (tenantId, filters = {}) => {
  requireObjectId(tenantId, "Tenant context is required");

  const query = { tenantId };

  if (filters.branchId) {
    requireObjectId(filters.branchId, "branchId must be a valid ObjectId");
    query.branchId = filters.branchId;
  }

  if (filters.supplierId) {
    requireObjectId(filters.supplierId, "supplierId must be a valid ObjectId");
    query.supplierId = filters.supplierId;
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

  const [purchaseOrders, total] = await Promise.all([
    PurchaseOrder.find(query)
      .populate("supplierId", "name contactPerson phone email")
      .populate("createdBy", "name email role")
      .populate("approvedBy", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PurchaseOrder.countDocuments(query),
  ]);

  return {
    purchaseOrders,
    pagination: {
      total,
      page,
      limit,
      returned: purchaseOrders.length,
    },
  };
};

const getPurchaseOrderById = async (tenantId, poId) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(poId, "Purchase Order ID is invalid");

  const purchaseOrder = await PurchaseOrder.findOne({
    _id: poId,
    tenantId,
  })
    .populate("supplierId", "name contactPerson phone email address")
    .populate("createdBy", "name email role")
    .populate("approvedBy", "name email role")
    .populate("closedBy", "name email role")
    .lean();

  if (!purchaseOrder) {
    throw createError("Purchase Order not found", 404);
  }

  const rawItems = await PurchaseOrderItem.find({
    tenantId,
    purchaseOrderId: poId,
  })
    .populate("productId", "name sku unit costPrice sellingPrice")
    .lean();

  const items = rawItems.map((item) => {
    const outstandingQuantity = Math.max(item.orderedQuantity - item.receivedQuantity, 0);
    const maxReceivableQuantity = item.orderedQuantity * (1 + OVER_RECEIPT_TOLERANCE_PERCENT);
    return {
      ...item,
      outstandingQuantity,
      maxReceivableQuantity,
    };
  });

  return {
    ...purchaseOrder,
    items,
  };
};

const updatePurchaseOrderStatus = async (tenantId, actorId, poId, nextStatus, notes) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");
  requireObjectId(poId, "Purchase Order ID is invalid");

  const purchaseOrder = await PurchaseOrder.findOne({
    _id: poId,
    tenantId,
  });

  if (!purchaseOrder) {
    throw createError("Purchase Order not found", 404);
  }

  const currentStatus = purchaseOrder.status;

  // Allowed transitions logic
  switch (nextStatus) {
    case "submitted":
      if (currentStatus !== "draft") {
        throw createError(`Cannot submit PO from status '${currentStatus}'`, 400);
      }
      purchaseOrder.status = "submitted";
      break;

    case "approved":
      if (currentStatus !== "submitted") {
        throw createError(`Cannot approve PO from status '${currentStatus}'. Must be 'submitted'`, 400);
      }
      purchaseOrder.status = "approved";
      purchaseOrder.approvedBy = actorId;
      purchaseOrder.approvedAt = new Date();
      break;

    case "sent":
      if (currentStatus !== "approved") {
        throw createError(`Cannot mark PO as sent from status '${currentStatus}'. Must be 'approved'`, 400);
      }
      purchaseOrder.status = "sent";
      purchaseOrder.sentAt = new Date();
      break;

    case "closed":
      if (!["received", "partially_received"].includes(currentStatus)) {
        throw createError(
          `Cannot close PO from status '${currentStatus}'. Must be 'received' or 'partially_received'`,
          400
        );
      }
      purchaseOrder.status = "closed";
      purchaseOrder.closedBy = actorId;
      purchaseOrder.closedAt = new Date();
      break;

    case "cancelled":
      if (["received", "closed"].includes(currentStatus)) {
        throw createError(`Cannot cancel PO in '${currentStatus}' status`, 400);
      }
      if (currentStatus === "partially_received") {
        throw createError("Cannot cancel a PO that has already received partial goods. Close it instead.", 400);
      }
      purchaseOrder.status = "cancelled";
      break;

    default:
      throw createError(`Invalid status transition to '${nextStatus}'`, 400);
  }

  if (notes) {
    purchaseOrder.notes = purchaseOrder.notes
      ? `${purchaseOrder.notes}\n[${nextStatus.toUpperCase()}]: ${notes}`
      : `[${nextStatus.toUpperCase()}]: ${notes}`;
  }

  await purchaseOrder.save();

  return purchaseOrder;
};

const receivePurchaseOrder = async (tenantId, actorId, poId, data) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(actorId, "Authenticated user context is required");
  requireObjectId(poId, "Purchase Order ID is invalid");

  const session = await mongoose.startSession();

  try {
    let updatedPO;
    let updatedItems;
    let movementsCreated = [];

    await session.withTransaction(async () => {
      // 1. Fetch and validate Purchase Order
      const purchaseOrder = await PurchaseOrder.findOne({
        _id: poId,
        tenantId,
      }).session(session);

      if (!purchaseOrder) {
        throw createError("Purchase Order not found", 404);
      }

      if (!["sent", "partially_received"].includes(purchaseOrder.status)) {
        throw createError(
          `Cannot receive goods for PO in '${purchaseOrder.status}' status. PO must be 'sent' or 'partially_received'`,
          400
        );
      }

      // 2. Fetch all PO items for this PO
      const poItems = await PurchaseOrderItem.find({
        tenantId,
        purchaseOrderId: poId,
      }).session(session);

      if (!poItems || poItems.length === 0) {
        throw createError("No line items found for this Purchase Order", 400);
      }

      // 3. Process each received item
      for (const receivedItem of data.items) {
        const poItem = poItems.find(
          (item) => item.productId.toString() === receivedItem.productId.toString()
        );

        if (!poItem) {
          throw createError(
            `Product ${receivedItem.productId} is not part of this Purchase Order`,
            400
          );
        }

        const currentReceived = poItem.receivedQuantity;
        const ordered = poItem.orderedQuantity;
        const allowedMax = ordered * (1 + OVER_RECEIPT_TOLERANCE_PERCENT);
        const newTotalReceived = currentReceived + receivedItem.quantityReceived;

        // Check if item was already fully received / over tolerance
        if (currentReceived >= ordered) {
          throw createError(
            `Product ${receivedItem.productId} has already been fully received (received: ${currentReceived}, ordered: ${ordered})`,
            400
          );
        }

        // Check 10% tolerance rule
        if (newTotalReceived > allowedMax) {
          throw createError(
            `Requested receipt of ${receivedItem.quantityReceived} exceeds allowed maximum with 10% tolerance. (Ordered: ${ordered}, Max Allowed: ${allowedMax}, Current Received: ${currentReceived})`,
            400
          );
        }

        // 4. Update PO Item received quantity
        poItem.receivedQuantity = newTotalReceived;
        await poItem.save({ session });

        // 5. Apply atomic stock mutation using existing shared engine
        const mutationResult = await applyStockMutation(session, {
          tenantId,
          branchId: purchaseOrder.branchId,
          productId: receivedItem.productId,
          movementType: "stock_in",
          quantityChange: receivedItem.quantityReceived,
          reason: `PO Receipt ${purchaseOrder.poNumber}${data.notes ? ` - ${data.notes}` : ""}`,
          actorId,
          allowCreateStock: true,
        });

        movementsCreated.push(mutationResult.movement);
      }

      // 6. Evaluate all items to determine overall PO status
      const allItemsFulfilled = poItems.every(
        (item) => item.receivedQuantity >= item.orderedQuantity
      );

      if (allItemsFulfilled) {
        purchaseOrder.status = "received";
      } else {
        purchaseOrder.status = "partially_received";
      }

      updatedPO = await purchaseOrder.save({ session });
      updatedItems = poItems;
    });

    return {
      purchaseOrder: updatedPO,
      items: updatedItems,
      movements: movementsCreated,
    };
  } finally {
    await session.endSession();
  }
};

module.exports = {
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrderStatus,
  receivePurchaseOrder,
};
