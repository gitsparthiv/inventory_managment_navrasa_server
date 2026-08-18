const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: [
        "admin",
        "inventory_manager",
        "purchase_staff",
        "branch_staff",
        "manager",
        "viewer",
      ],
      default: "viewer",
    },

    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
       default: null,
      index: true,
    },

    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);