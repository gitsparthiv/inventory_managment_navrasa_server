const mongoose = require("mongoose");

const stockTransferItemSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    transferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockTransfer",
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    transferredQuantity: {
      type: Number,
      required: true,
      min: [0.0001, "transferredQuantity must be greater than 0"],
    },
    receivedQuantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    returnedQuantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    lostQuantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    discrepancyReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

stockTransferItemSchema.index({ tenantId: 1, transferId: 1 });
stockTransferItemSchema.index({ tenantId: 1, productId: 1 });

module.exports = mongoose.model("StockTransferItem", stockTransferItemSchema);
