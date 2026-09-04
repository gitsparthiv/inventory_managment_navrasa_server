const mongoose = require("mongoose");

const purchaseOrderItemSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    purchaseOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseOrder",
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    orderedQuantity: {
      type: Number,
      required: true,
      min: [0.0001, "orderedQuantity must be greater than 0"],
    },
    receivedQuantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    unitCost: {
      type: Number,
      required: true,
      min: 0,
    },
    totalCost: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

purchaseOrderItemSchema.index({ tenantId: 1, purchaseOrderId: 1 });
purchaseOrderItemSchema.index({ tenantId: 1, productId: 1 });

module.exports = mongoose.model("PurchaseOrderItem", purchaseOrderItemSchema);
