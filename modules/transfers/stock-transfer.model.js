const mongoose = require("mongoose");

const transferStatusEnum = [
  "draft",
  "submitted",
  "approved",
  "in_transit",
  "partially_received",
  "completed",
  "returned",
  "cancelled",
];

const stockTransferSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    transferNumber: {
      type: String,
      required: true,
      trim: true,
    },
    sourceBranchId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    destinationBranchId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: transferStatusEnum,
      default: "draft",
      index: true,
    },
    transferDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
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
    dispatchedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    dispatchedAt: {
      type: Date,
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    receivedAt: {
      type: Date,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    closedAt: {
      type: Date,
    },
    discrepancyResolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    discrepancyResolvedAt: {
      type: Date,
    },
    discrepancyResolutionNotes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

stockTransferSchema.index({ tenantId: 1, transferNumber: 1 }, { unique: true });
stockTransferSchema.index({ tenantId: 1, sourceBranchId: 1, status: 1 });
stockTransferSchema.index({ tenantId: 1, destinationBranchId: 1, status: 1 });
stockTransferSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model("StockTransfer", stockTransferSchema);
