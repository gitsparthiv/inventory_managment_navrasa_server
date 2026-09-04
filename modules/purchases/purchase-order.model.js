const mongoose = require("mongoose");

const purchaseOrderStatusEnum = [
  "draft",
  "submitted",
  "approved",
  "sent",
  "partially_received",
  "received",
  "closed",
  "cancelled",
];

const purchaseOrderSchema = new mongoose.Schema(
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
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    poNumber: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: purchaseOrderStatusEnum,
      default: "draft",
      index: true,
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    expectedDeliveryDate: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: {
      type: Date,
    },
    sentAt: {
      type: Date,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    closedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

purchaseOrderSchema.index({ tenantId: 1, poNumber: 1 }, { unique: true });
purchaseOrderSchema.index({ tenantId: 1, branchId: 1, status: 1 });
purchaseOrderSchema.index({ tenantId: 1, supplierId: 1, createdAt: -1 });

module.exports = mongoose.model("PurchaseOrder", purchaseOrderSchema);
