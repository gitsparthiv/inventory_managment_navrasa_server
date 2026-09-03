const inventoryService = require("./inventory.service");

const getActorId = (user) => user?.userId || user?.id || user?._id;

const createOpeningStock = async (req, res) => {
  try {
    const actorId = getActorId(req.user);
    const { stock, movement } = await inventoryService.createOpeningStock(
      req.user.tenantId,
      actorId,
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

const getStockBalances = async (req, res) => {
  try {
    const result = await inventoryService.getStockBalances(
      req.user.tenantId,
      req.query
    );

    res.status(200).json({
      success: true,
      data: result.stocks,
      pagination: result.pagination,
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

const getMovements = async (req, res) => {
  try {
    const result = await inventoryService.getMovements(
      req.user.tenantId,
      req.query
    );

    res.status(200).json({
      success: true,
      data: result.movements,
      pagination: result.pagination,
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

const createAdjustment = async (req, res) => {
  try {
    const actorId = getActorId(req.user);
    const { stock, movement } = await inventoryService.createAdjustment(
      req.user.tenantId,
      actorId,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "Stock adjustment recorded successfully",
      stock,
      movement,
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

const createWaste = async (req, res) => {
  try {
    const actorId = getActorId(req.user);
    const { stock, movement } = await inventoryService.createWaste(
      req.user.tenantId,
      actorId,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "Stock waste recorded successfully",
      stock,
      movement,
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

const createConsumption = async (req, res) => {
  try {
    const actorId = getActorId(req.user);
    const { stock, movement } = await inventoryService.createConsumption(
      req.user.tenantId,
      actorId,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "Stock consumption recorded successfully",
      stock,
      movement,
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

const reconcileStock = async (req, res) => {
  try {
    const actorId = getActorId(req.user);
    const result = await inventoryService.reconcileStock(
      req.user.tenantId,
      actorId,
      req.body
    );

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        previousQuantity: result.previousQuantity,
        countedQuantity: result.countedQuantity,
        variance: result.variance,
        stock: result.stock,
        movement: result.movement,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createOpeningStock,
  getStockBalances,
  getMovements,
  createAdjustment,
  createWaste,
  createConsumption,
  reconcileStock,
};

