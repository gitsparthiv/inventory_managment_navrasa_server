const mongoose = require("mongoose");
const Supplier = require("./supplier.model");
const Product = require("../products/products.model");

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

const createSupplier = async (tenantId, data) => {
  requireObjectId(tenantId, "Tenant context is required");

  // If suppliedProductIds are provided, verify they belong to tenant
  if (data.suppliedProductIds && data.suppliedProductIds.length > 0) {
    const validProducts = await Product.find({
      _id: { $in: data.suppliedProductIds },
      tenantId,
    }).lean();

    if (validProducts.length !== data.suppliedProductIds.length) {
      throw createError("One or more suppliedProductIds do not belong to this tenant", 400);
    }
  }

  const existingSupplier = await Supplier.findOne({
    tenantId,
    name: data.name.trim(),
  });

  if (existingSupplier) {
    throw createError("Supplier with this name already exists in this tenant", 409);
  }

  const supplier = await Supplier.create({
    ...data,
    tenantId,
    name: data.name.trim(),
  });

  return supplier;
};

const getSuppliers = async (tenantId, filters = {}) => {
  requireObjectId(tenantId, "Tenant context is required");

  const query = { tenantId };

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.search) {
    query.name = { $regex: filters.search, $options: "i" };
  }

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 50;
  const skip = (page - 1) * limit;

  const [suppliers, total] = await Promise.all([
    Supplier.find(query)
      .populate("suppliedProductIds", "name sku unit costPrice")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Supplier.countDocuments(query),
  ]);

  return {
    suppliers,
    pagination: {
      total,
      page,
      limit,
      returned: suppliers.length,
    },
  };
};

const getSupplierById = async (tenantId, supplierId) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(supplierId, "Supplier ID is invalid");

  const supplier = await Supplier.findOne({
    _id: supplierId,
    tenantId,
  })
    .populate("suppliedProductIds", "name sku unit costPrice")
    .lean();

  if (!supplier) {
    throw createError("Supplier not found", 404);
  }

  return supplier;
};

const updateSupplier = async (tenantId, supplierId, data) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(supplierId, "Supplier ID is invalid");

  const supplier = await Supplier.findOne({
    _id: supplierId,
    tenantId,
  });

  if (!supplier) {
    throw createError("Supplier not found", 404);
  }

  if (data.name && data.name.trim() !== supplier.name) {
    const existing = await Supplier.findOne({
      tenantId,
      name: data.name.trim(),
      _id: { $ne: supplierId },
    });
    if (existing) {
      throw createError("Supplier with this name already exists", 409);
    }
    supplier.name = data.name.trim();
  }

  if (data.suppliedProductIds) {
    if (data.suppliedProductIds.length > 0) {
      const validProducts = await Product.find({
        _id: { $in: data.suppliedProductIds },
        tenantId,
      }).lean();

      if (validProducts.length !== data.suppliedProductIds.length) {
        throw createError("One or more suppliedProductIds do not belong to this tenant", 400);
      }
    }
    supplier.suppliedProductIds = data.suppliedProductIds;
  }

  if (data.contactPerson !== undefined) supplier.contactPerson = data.contactPerson;
  if (data.email !== undefined) supplier.email = data.email;
  if (data.phone !== undefined) supplier.phone = data.phone;
  if (data.address !== undefined) supplier.address = data.address;
  if (data.status !== undefined) supplier.status = data.status;

  await supplier.save();

  return supplier;
};

const getSupplierHistory = async (tenantId, supplierId) => {
  requireObjectId(tenantId, "Tenant context is required");
  requireObjectId(supplierId, "Supplier ID is invalid");

  const supplier = await Supplier.findOne({
    _id: supplierId,
    tenantId,
  }).lean();

  if (!supplier) {
    throw createError("Supplier not found", 404);
  }

  // Look up POs for this supplier
  const PurchaseOrder = mongoose.model("PurchaseOrder");
  const PurchaseOrderItem = mongoose.model("PurchaseOrderItem");

  const purchaseOrders = await PurchaseOrder.find({
    tenantId,
    supplierId,
  })
    .sort({ createdAt: -1 })
    .lean();

  const poIds = purchaseOrders.map((po) => po._id);
  const items = await PurchaseOrderItem.find({
    tenantId,
    purchaseOrderId: { $in: poIds },
  })
    .populate("productId", "name sku unit")
    .lean();

  const totalOrders = purchaseOrders.length;
  const completedOrders = purchaseOrders.filter((po) => ["received", "closed"].includes(po.status)).length;
  const totalSpend = purchaseOrders
    .filter((po) => !["cancelled", "draft"].includes(po.status))
    .reduce((sum, po) => sum + (po.totalAmount || 0), 0);

  const totalOrderedQuantity = items.reduce((sum, item) => sum + item.orderedQuantity, 0);
  const totalReceivedQuantity = items.reduce((sum, item) => sum + item.receivedQuantity, 0);

  return {
    supplier: {
      _id: supplier._id,
      name: supplier.name,
      contactPerson: supplier.contactPerson,
      email: supplier.email,
      phone: supplier.phone,
      status: supplier.status,
    },
    summary: {
      totalOrders,
      completedOrders,
      totalSpend,
      totalOrderedQuantity,
      totalReceivedQuantity,
    },
    purchaseOrders,
  };
};

module.exports = {
  createSupplier,
  getSuppliers,
  getSupplierById,
  updateSupplier,
  getSupplierHistory,
};
