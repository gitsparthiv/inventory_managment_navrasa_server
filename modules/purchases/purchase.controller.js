const purchaseService = require("./purchase.service");

const getActorId = (user) => user?.userId || user?.id || user?._id;

const createPurchaseOrder = async (req, res) => {
  try {
    const actorId = getActorId(req.user);
    const result = await purchaseService.createPurchaseOrder(
      req.user.tenantId,
      actorId,
      req.body
    );

    res.status(201).json({
      success: true,
      message: "Purchase Order created successfully",
      data: result,
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

const getPurchaseOrders = async (req, res) => {
  try {
    const result = await purchaseService.getPurchaseOrders(
      req.user.tenantId,
      req.query
    );

    res.status(200).json({
      success: true,
      data: result.purchaseOrders,
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

const getPurchaseOrderById = async (req, res) => {
  try {
    const result = await purchaseService.getPurchaseOrderById(
      req.user.tenantId,
      req.params.id
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

const updatePurchaseOrderStatus = async (req, res) => {
  try {
    const actorId = getActorId(req.user);
    const purchaseOrder = await purchaseService.updatePurchaseOrderStatus(
      req.user.tenantId,
      actorId,
      req.params.id,
      req.body.status,
      req.body.notes
    );

    res.status(200).json({
      success: true,
      message: `Purchase Order status updated to '${req.body.status}' successfully`,
      data: purchaseOrder,
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

const receivePurchaseOrder = async (req, res) => {
  try {
    const actorId = getActorId(req.user);
    const result = await purchaseService.receivePurchaseOrder(
      req.user.tenantId,
      actorId,
      req.params.id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "Goods received and stock updated successfully",
      data: result,
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
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrderStatus,
  receivePurchaseOrder,
};
