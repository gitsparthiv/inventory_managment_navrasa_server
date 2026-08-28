const mongoose = require("mongoose");

const stockSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// One current stock balance exists for each product at each branch in a tenant.
stockSchema.index({ tenantId: 1, branchId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model("Stock", stockSchema);
