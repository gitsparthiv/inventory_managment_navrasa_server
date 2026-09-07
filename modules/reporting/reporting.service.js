const mongoose = require("mongoose");
const Stock = require("../inventory/stock.model");
const StockMovement = require("../inventory/stock-movement.model");
const Product = require("../products/products.model");
const Supplier = require("../suppliers/supplier.model");
const PurchaseOrder = require("../purchases/purchase-order.model");
const PurchaseOrderItem = require("../purchases/purchase-order-item.model");
const StockTransfer = require("../transfers/stock-transfer.model");

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
 * 1. Inventory Valuation Report
 * GET /api/reports/inventory
 */
const getInventoryReport = async (tenantId, query = {}) => {
  requireObjectId(tenantId, "Tenant context is required");

  const matchFilter = {
    tenantId: new mongoose.Types.ObjectId(tenantId),
  };

  if (query.branchId) {
    matchFilter.branchId = new mongoose.Types.ObjectId(query.branchId);
  }

  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 50;
  const skip = (page - 1) * limit;

  const pipeline = [
    { $match: matchFilter },
    {
      $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    ...(query.categoryId
      ? [
          {
            $match: {
              "product.categoryId": new mongoose.Types.ObjectId(query.categoryId),
            },
          },
        ]
      : []),
    {
      $project: {
        _id: 1,
        branchId: 1,
        productId: "$product._id",
        productName: "$product.name",
        sku: "$product.sku",
        barcode: "$product.barcode",
        unit: "$product.unit",
        quantity: "$quantity",
        costPrice: "$product.costPrice",
        sellingPrice: "$product.sellingPrice",
        totalCostValuation: { $multiply: ["$quantity", "$product.costPrice"] },
        totalRetailValuation: { $multiply: ["$quantity", "$product.sellingPrice"] },
        minimumStock: "$product.minimumStock",
        reorderLevel: "$product.reorderLevel",
        isLowStock: { $lte: ["$quantity", "$product.reorderLevel"] },
        isCriticalStock: { $lte: ["$quantity", "$product.minimumStock"] },
        updatedAt: 1,
      },
    },
    { $sort: { totalCostValuation: -1 } },
  ];

  // Execute aggregation with summary facet
  const aggregationResult = await Stock.aggregate([
    ...pipeline,
    {
      $facet: {
        items: [{ $skip: skip }, { $limit: limit }],
        summary: [
          {
            $group: {
              _id: null,
              totalRecords: { $sum: 1 },
              totalStockQuantity: { $sum: "$quantity" },
              totalCostValuation: { $sum: "$totalCostValuation" },
              totalRetailValuation: { $sum: "$totalRetailValuation" },
              lowStockCount: {
                $sum: { $cond: ["$isLowStock", 1, 0] },
              },
            },
          },
        ],
      },
    },
  ]);

  const facet = aggregationResult[0] || { items: [], summary: [] };
  const summary = facet.summary[0] || {
    totalRecords: 0,
    totalStockQuantity: 0,
    totalCostValuation: 0,
    totalRetailValuation: 0,
    lowStockCount: 0,
  };

  return {
    summary: {
      totalRecords: summary.totalRecords,
      totalStockQuantity: summary.totalStockQuantity,
      totalCostValuation: Math.round(summary.totalCostValuation * 100) / 100,
      totalRetailValuation: Math.round(summary.totalRetailValuation * 100) / 100,
      lowStockCount: summary.lowStockCount,
    },
    data: facet.items,
    pagination: {
      total: summary.totalRecords,
      page,
      limit,
      returned: facet.items.length,
    },
  };
};

/**
 * 2. Low-Stock & Reorder Deficit Report
 * GET /api/reports/low-stock
 */
const getLowStockReport = async (tenantId, query = {}) => {
  requireObjectId(tenantId, "Tenant context is required");

  const matchFilter = {
    tenantId: new mongoose.Types.ObjectId(tenantId),
  };

  if (query.branchId) {
    matchFilter.branchId = new mongoose.Types.ObjectId(query.branchId);
  }

  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 50;
  const skip = (page - 1) * limit;

  const isCriticalOnly = query.criticalOnly === "true";

  const pipeline = [
    { $match: matchFilter },
    {
      $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    {
      $project: {
        _id: 1,
        branchId: 1,
        productId: "$product._id",
        productName: "$product.name",
        sku: "$product.sku",
        unit: "$product.unit",
        quantity: "$quantity",
        costPrice: "$product.costPrice",
        minimumStock: "$product.minimumStock",
        reorderLevel: "$product.reorderLevel",
        reorderDeficit: {
          $cond: [
            { $gt: ["$product.reorderLevel", "$quantity"] },
            { $subtract: ["$product.reorderLevel", "$quantity"] },
            0,
          ],
        },
        estimatedReorderCost: {
          $cond: [
            { $gt: ["$product.reorderLevel", "$quantity"] },
            {
              $multiply: [
                { $subtract: ["$product.reorderLevel", "$quantity"] },
                "$product.costPrice",
              ],
            },
            0,
          ],
        },
        isLowStock: { $lte: ["$quantity", "$product.reorderLevel"] },
        isCriticalStock: { $lte: ["$quantity", "$product.minimumStock"] },
      },
    },
    {
      $match: isCriticalOnly ? { isCriticalStock: true } : { isLowStock: true },
    },
    { $sort: { reorderDeficit: -1 } },
  ];

  const aggregationResult = await Stock.aggregate([
    ...pipeline,
    {
      $facet: {
        items: [{ $skip: skip }, { $limit: limit }],
        summary: [
          {
            $group: {
              _id: null,
              totalLowStockItems: { $sum: 1 },
              criticalStockItems: {
                $sum: { $cond: ["$isCriticalStock", 1, 0] },
              },
              totalReorderDeficit: { $sum: "$reorderDeficit" },
              totalEstimatedReorderCost: { $sum: "$estimatedReorderCost" },
            },
          },
        ],
      },
    },
  ]);

  const facet = aggregationResult[0] || { items: [], summary: [] };
  const summary = facet.summary[0] || {
    totalLowStockItems: 0,
    criticalStockItems: 0,
    totalReorderDeficit: 0,
    totalEstimatedReorderCost: 0,
  };

  return {
    summary: {
      totalLowStockItems: summary.totalLowStockItems,
      criticalStockItems: summary.criticalStockItems,
      totalReorderDeficit: Math.round(summary.totalReorderDeficit * 100) / 100,
      totalEstimatedReorderCost: Math.round(summary.totalEstimatedReorderCost * 100) / 100,
    },
    data: facet.items,
    pagination: {
      total: summary.totalLowStockItems,
      page,
      limit,
      returned: facet.items.length,
    },
  };
};

/**
 * 3. Stock Movement & Flow Audit Report
 * GET /api/reports/movements
 */
const getMovementsReport = async (tenantId, query = {}) => {
  requireObjectId(tenantId, "Tenant context is required");

  const matchFilter = {
    tenantId: new mongoose.Types.ObjectId(tenantId),
  };

  if (query.branchId) {
    matchFilter.branchId = new mongoose.Types.ObjectId(query.branchId);
  }

  if (query.productId) {
    matchFilter.productId = new mongoose.Types.ObjectId(query.productId);
  }

  if (query.movementType) {
    matchFilter.movementType = query.movementType;
  }

  if (query.startDate || query.endDate) {
    matchFilter.createdAt = {};
    if (query.startDate) matchFilter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) matchFilter.createdAt.$lte = new Date(query.endDate);
  }

  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 50;
  const skip = (page - 1) * limit;

  // Breakdown by movementType aggregation
  const summaryByMovementType = await StockMovement.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: "$movementType",
        transactionCount: { $sum: 1 },
        totalQuantityChange: { $sum: "$quantityChange" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const totalTransactions = summaryByMovementType.reduce((sum, g) => sum + g.transactionCount, 0);

  // Paginated movements list with Product and User populated
  const movements = await StockMovement.find(matchFilter)
    .populate("productId", "name sku unit costPrice")
    .populate("actorId", "name email role")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    summary: {
      totalTransactions,
      breakdown: summaryByMovementType.map((g) => ({
        movementType: g._id,
        transactionCount: g.transactionCount,
        netQuantityChange: Math.round(g.totalQuantityChange * 100) / 100,
      })),
    },
    data: movements,
    pagination: {
      total: totalTransactions,
      page,
      limit,
      returned: movements.length,
    },
  };
};

/**
 * 4. Purchasing & Procurement Report
 * GET /api/reports/purchasing
 * Quantity-weighted fulfillment rate: totalReceivedQuantity / totalOrderedQuantity * 100
 */
const getPurchasingReport = async (tenantId, query = {}) => {
  requireObjectId(tenantId, "Tenant context is required");

  const matchFilter = {
    tenantId: new mongoose.Types.ObjectId(tenantId),
  };

  if (query.branchId) {
    matchFilter.branchId = new mongoose.Types.ObjectId(query.branchId);
  }

  if (query.supplierId) {
    matchFilter.supplierId = new mongoose.Types.ObjectId(query.supplierId);
  }

  if (query.status) {
    matchFilter.status = query.status;
  }

  if (query.startDate || query.endDate) {
    matchFilter.createdAt = {};
    if (query.startDate) matchFilter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) matchFilter.createdAt.$lte = new Date(query.endDate);
  }

  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 50;
  const skip = (page - 1) * limit;

  // Aggregate PO summary & spend breakdown by status
  const [poSummary, statusBreakdown] = await Promise.all([
    PurchaseOrder.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalPOs: { $sum: 1 },
          totalSpend: {
            $sum: {
              $cond: [{ $in: ["$status", ["cancelled", "draft"]] }, 0, "$totalAmount"],
            },
          },
        },
      },
    ]),
    PurchaseOrder.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          spend: { $sum: "$totalAmount" },
        },
      },
    ]),
  ]);

  // Aggregate quantity-weighted fulfillment rate from purchase_order_items
  const matchingPOIds = await PurchaseOrder.find(matchFilter).distinct("_id");

  const itemFulfillment = await PurchaseOrderItem.aggregate([
    {
      $match: {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        purchaseOrderId: { $in: matchingPOIds },
      },
    },
    {
      $group: {
        _id: null,
        totalOrderedQuantity: { $sum: "$orderedQuantity" },
        totalReceivedQuantity: { $sum: "$receivedQuantity" },
      },
    },
  ]);

  const totalOrdered = itemFulfillment[0]?.totalOrderedQuantity || 0;
  const totalReceived = itemFulfillment[0]?.totalReceivedQuantity || 0;
  const fulfillmentRate = totalOrdered > 0 ? Math.min(Math.round((totalReceived / totalOrdered) * 10000) / 100, 100) : 0;

  const totalPOs = poSummary[0]?.totalPOs || 0;
  const totalSpend = poSummary[0]?.totalSpend || 0;

  const purchaseOrders = await PurchaseOrder.find(matchFilter)
    .populate("supplierId", "name contactPerson phone email")
    .populate("createdBy", "name email role")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    summary: {
      totalPOs,
      totalSpend: Math.round(totalSpend * 100) / 100,
      totalOrderedQuantity: Math.round(totalOrdered * 100) / 100,
      totalReceivedQuantity: Math.round(totalReceived * 100) / 100,
      fulfillmentRate,
      statusBreakdown: statusBreakdown.map((s) => ({
        status: s._id,
        count: s.count,
        totalAmount: Math.round(s.spend * 100) / 100,
      })),
    },
    data: purchaseOrders,
    pagination: {
      total: totalPOs,
      page,
      limit,
      returned: purchaseOrders.length,
    },
  };
};

/**
 * 5. Supplier Performance & Spend Breakdown
 * GET /api/reports/suppliers
 */
const getSuppliersReport = async (tenantId, query = {}) => {
  requireObjectId(tenantId, "Tenant context is required");

  const matchFilter = {
    tenantId: new mongoose.Types.ObjectId(tenantId),
  };

  if (query.status) {
    matchFilter.status = query.status;
  }

  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 50;
  const skip = (page - 1) * limit;

  const suppliers = await Supplier.find(matchFilter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const totalSuppliers = await Supplier.countDocuments(matchFilter);
  const supplierIds = suppliers.map((s) => s._id);

  // Aggregate PO spend per supplier
  const poAggregations = await PurchaseOrder.aggregate([
    {
      $match: {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        supplierId: { $in: supplierIds },
      },
    },
    {
      $group: {
        _id: "$supplierId",
        totalOrders: { $sum: 1 },
        completedOrders: {
          $sum: { $cond: [{ $in: ["$status", ["received", "closed"]] }, 1, 0] },
        },
        totalSpend: {
          $sum: {
            $cond: [{ $in: ["$status", ["cancelled", "draft"]] }, 0, "$totalAmount"],
          },
        },
      },
    },
  ]);

  // Aggregate quantities per supplier from items
  const allPOs = await PurchaseOrder.find({
    tenantId,
    supplierId: { $in: supplierIds },
  })
    .select("_id supplierId")
    .lean();

  const poToSupplierMap = {};
  allPOs.forEach((p) => {
    poToSupplierMap[p._id.toString()] = p.supplierId.toString();
  });

  const allPOIds = allPOs.map((p) => p._id);
  const itemsAggregations = await PurchaseOrderItem.aggregate([
    {
      $match: {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        purchaseOrderId: { $in: allPOIds },
      },
    },
    {
      $group: {
        _id: "$purchaseOrderId",
        ordered: { $sum: "$orderedQuantity" },
        received: { $sum: "$receivedQuantity" },
      },
    },
  ]);

  const supplierQuantities = {};
  itemsAggregations.forEach((item) => {
    const sId = poToSupplierMap[item._id.toString()];
    if (sId) {
      if (!supplierQuantities[sId]) {
        supplierQuantities[sId] = { ordered: 0, received: 0 };
      }
      supplierQuantities[sId].ordered += item.ordered;
      supplierQuantities[sId].received += item.received;
    }
  });

  const poMap = {};
  poAggregations.forEach((p) => {
    poMap[p._id.toString()] = p;
  });

  const supplierData = suppliers.map((supplier) => {
    const stats = poMap[supplier._id.toString()] || {
      totalOrders: 0,
      completedOrders: 0,
      totalSpend: 0,
    };
    const quantities = supplierQuantities[supplier._id.toString()] || {
      ordered: 0,
      received: 0,
    };
    const fulfillmentRate =
      quantities.ordered > 0
        ? Math.min(Math.round((quantities.received / quantities.ordered) * 10000) / 100, 100)
        : 0;

    return {
      _id: supplier._id,
      name: supplier.name,
      contactPerson: supplier.contactPerson,
      email: supplier.email,
      phone: supplier.phone,
      status: supplier.status,
      totalOrders: stats.totalOrders,
      completedOrders: stats.completedOrders,
      totalSpend: Math.round(stats.totalSpend * 100) / 100,
      totalOrderedQuantity: Math.round(quantities.ordered * 100) / 100,
      totalReceivedQuantity: Math.round(quantities.received * 100) / 100,
      fulfillmentRate,
    };
  });

  const overallSpend = supplierData.reduce((sum, s) => sum + s.totalSpend, 0);

  return {
    summary: {
      totalSuppliers,
      overallSpend: Math.round(overallSpend * 100) / 100,
    },
    data: supplierData,
    pagination: {
      total: totalSuppliers,
      page,
      limit,
      returned: supplierData.length,
    },
  };
};

/**
 * 6. High-Level Executive Dashboard KPIs
 * GET /api/reports/dashboard
 */
const getDashboardMetrics = async (tenantId, query = {}) => {
  requireObjectId(tenantId, "Tenant context is required");

  const tenantObjId = new mongoose.Types.ObjectId(tenantId);
  const stockMatch = { tenantId: tenantObjId };
  const poMatch = { tenantId: tenantObjId };
  const transferMatch = { tenantId: tenantObjId };
  const movementMatch = { tenantId: tenantObjId };

  if (query.branchId) {
    const branchObjId = new mongoose.Types.ObjectId(query.branchId);
    stockMatch.branchId = branchObjId;
    poMatch.branchId = branchObjId;
    transferMatch.$or = [{ sourceBranchId: branchObjId }, { destinationBranchId: branchObjId }];
    movementMatch.branchId = branchObjId;
  }

  const [
    inventoryValuation,
    lowStockCount,
    poStats,
    transferStats,
    recentMovements,
  ] = await Promise.all([
    Stock.aggregate([
      { $match: stockMatch },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: null,
          totalStockRecords: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalCostValuation: { $sum: { $multiply: ["$quantity", "$product.costPrice"] } },
          totalRetailValuation: { $sum: { $multiply: ["$quantity", "$product.sellingPrice"] } },
        },
      },
    ]),
    Stock.aggregate([
      { $match: stockMatch },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $match: {
          $expr: { $lte: ["$quantity", "$product.reorderLevel"] },
        },
      },
      { $count: "count" },
    ]),
    PurchaseOrder.aggregate([
      { $match: poMatch },
      {
        $group: {
          _id: null,
          totalPOs: { $sum: 1 },
          pendingApproval: {
            $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] },
          },
          inTransit: {
            $sum: { $cond: [{ $in: ["$status", ["sent", "partially_received"]] }, 1, 0] },
          },
          totalSpend: {
            $sum: {
              $cond: [{ $in: ["$status", ["cancelled", "draft"]] }, 0, "$totalAmount"],
            },
          },
        },
      },
    ]),
    StockTransfer.aggregate([
      { $match: transferMatch },
      {
        $group: {
          _id: null,
          totalTransfers: { $sum: 1 },
          inTransit: {
            $sum: { $cond: [{ $in: ["$status", ["in_transit", "partially_received"]] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
        },
      },
    ]),
    StockMovement.find(movementMatch)
      .populate("productId", "name sku unit")
      .populate("actorId", "name email role")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  const invSummary = inventoryValuation[0] || {
    totalStockRecords: 0,
    totalQuantity: 0,
    totalCostValuation: 0,
    totalRetailValuation: 0,
  };

  const poSummary = poStats[0] || {
    totalPOs: 0,
    pendingApproval: 0,
    inTransit: 0,
    totalSpend: 0,
  };

  const trSummary = transferStats[0] || {
    totalTransfers: 0,
    inTransit: 0,
    completed: 0,
  };

  return {
    inventory: {
      totalStockRecords: invSummary.totalStockRecords,
      totalQuantity: invSummary.totalQuantity,
      totalCostValuation: Math.round(invSummary.totalCostValuation * 100) / 100,
      totalRetailValuation: Math.round(invSummary.totalRetailValuation * 100) / 100,
      lowStockCount: lowStockCount[0]?.count || 0,
    },
    purchasing: {
      totalPOs: poSummary.totalPOs,
      pendingApprovalCount: poSummary.pendingApproval,
      inTransitCount: poSummary.inTransit,
      totalSpend: Math.round(poSummary.totalSpend * 100) / 100,
    },
    transfers: {
      totalTransfers: trSummary.totalTransfers,
      inTransitCount: trSummary.inTransit,
      completedCount: trSummary.completed,
    },
    recentMovements: recentMovements.map((m) => ({
      _id: m._id,
      branchId: m.branchId,
      product: m.productId?.name || "Unknown Product",
      sku: m.productId?.sku || "",
      movementType: m.movementType,
      quantityChange: m.quantityChange,
      reason: m.reason,
      actor: m.actorId?.name || "System",
      createdAt: m.createdAt,
    })),
  };
};

module.exports = {
  getInventoryReport,
  getLowStockReport,
  getMovementsReport,
  getPurchasingReport,
  getSuppliersReport,
  getDashboardMetrics,
};
