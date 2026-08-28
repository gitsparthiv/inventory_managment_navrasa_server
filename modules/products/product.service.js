const mongoose = require("mongoose");

const Product = require("./products.model");

const productFields = [
  "name",
  "sku",
  "barcode",
  "categoryId",
  "unit",
  "costPrice",
  "sellingPrice",
  "minimumStock",
  "reorderLevel",
  "status",
];

const createError = (message, status) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const requireTenantId = (tenantId) => {
  if (!tenantId || !mongoose.isValidObjectId(tenantId)) {
    throw createError("Tenant context is required", 400);
  }
};

const pickProductFields = (data) => {
  return productFields.reduce((productData, field) => {
    if (data[field] !== undefined) {
      productData[field] = data[field];
    }

    return productData;
  }, {});
};

const createProduct = async (tenantId, data) => {
  requireTenantId(tenantId);

  const product = await Product.create({
    ...pickProductFields(data),
    tenantId,
  });

  return product;
};

const getProducts = async (tenantId, filters) => {
  requireTenantId(tenantId);

  const query = { tenantId };

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.categoryId) {
    query.categoryId = filters.categoryId;
  }

  if (filters.search) {
    const escapedSearch = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchExpression = new RegExp(escapedSearch, "i");

    query.$or = [
      { name: searchExpression },
      { sku: searchExpression },
      { barcode: searchExpression },
    ];
  }

  return Product.find(query).sort({ createdAt: -1 });
};

const updateProduct = async (tenantId, productId, data) => {
  requireTenantId(tenantId);

  if (!mongoose.isValidObjectId(productId)) {
    throw createError("Product not found", 404);
  }

  const update = pickProductFields(data);
  const product = await Product.findOneAndUpdate(
    { _id: productId, tenantId },
    update,
    { new: true, runValidators: true }
  );

  if (!product) {
    throw createError("Product not found", 404);
  }

  return product;
};

module.exports = {
  createProduct,
  getProducts,
  updateProduct,
};
