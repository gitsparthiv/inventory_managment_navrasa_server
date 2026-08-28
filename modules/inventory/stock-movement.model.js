const mongoose = require("mongoose");

const movementTypes = [
  "opening",
  "stock_in",
  "stock_out",
  "transfer_in",
  "transfer_out",
  "adjustment",
  "waste",
  "consumption",
  "reconciliation",
];

const stockMovementSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      immutable: true,
    },
    movementType: {
      type: String,
      enum: movementTypes,
      required: true,
      immutable: true,
    },
    quantityChange: {
      type: Number,
      required: true,
      immutable: true,
      validate: {
        validator: (value) => value !== 0,
        message: "quantityChange must not be zero",
      },
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

stockMovementSchema.index({ tenantId: 1, branchId: 1, productId: 1, createdAt: 1 });

module.exports = mongoose.model("StockMovement", stockMovementSchema);
