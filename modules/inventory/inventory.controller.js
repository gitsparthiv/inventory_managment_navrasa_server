const inventoryService = require("./inventory.service");

const createOpeningStock = async (req, res) => {
  try {
    const { stock, movement } = await inventoryService.createOpeningStock(
      req.user.tenantId,
      req.user.userId,
      req.body
    );

    res.status(201).json({
      success: true,
      message: "Opening stock created successfully",
      stock,
      movement,
    });
  } catch (error) {
    const status = error.status || (error.code === 11000 ? 409 : 500);

    res.status(status).json({
      success: false,
      message: error.code === 11000 ? "Opening stock already exists" : error.message,
    });
  }
};

module.exports = {
  createOpeningStock,
};
