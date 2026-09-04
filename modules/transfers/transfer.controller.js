const transferService = require("./transfer.service");

const getActorId = (user) => user?.userId || user?.id || user?._id;

const createStockTransfer = async (req, res) => {
  try {
    const actorId = getActorId(req.user);
    const result = await transferService.createStockTransfer(
      req.user.tenantId,
      actorId,
      req.body
    );

    res.status(201).json({
      success: true,
      message: "Stock Transfer created successfully in draft status",
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

const getStockTransfers = async (req, res) => {
  try {
    const result = await transferService.getStockTransfers(
      req.user.tenantId,
      req.query
    );

    res.status(200).json({
      success: true,
      data: result.transfers,
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

const getStockTransferById = async (req, res) => {
  try {
    const result = await transferService.getStockTransferById(
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

const updateStockTransferStatus = async (req, res) => {
  try {
    const actorId = getActorId(req.user);
    const transfer = await transferService.updateStockTransferStatus(
      req.user.tenantId,
      actorId,
      req.params.id,
      req.body.status,
      req.body.notes
    );

    res.status(200).json({
      success: true,
      message: `Stock Transfer status updated to '${req.body.status}' successfully`,
      data: transfer,
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

const dispatchStockTransfer = async (req, res) => {
  try {
    const actorId = getActorId(req.user);
    const result = await transferService.dispatchStockTransfer(
      req.user.tenantId,
      actorId,
      req.params.id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "Stock Transfer dispatched successfully and source stock deducted",
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

const receiveStockTransfer = async (req, res) => {
  try {
    const actorId = getActorId(req.user);
    const result = await transferService.receiveStockTransfer(
      req.user.tenantId,
      actorId,
      req.params.id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "Stock Transfer received successfully and destination stock updated",
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

const returnStockTransfer = async (req, res) => {
  try {
    const actorId = getActorId(req.user);
    const result = await transferService.returnStockTransfer(
      req.user.tenantId,
      actorId,
      req.params.id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "Stock Transfer return processed and source stock restored",
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

const resolveTransferDiscrepancy = async (req, res) => {
  try {
    const actorId = getActorId(req.user);
    const result = await transferService.resolveTransferDiscrepancy(
      req.user.tenantId,
      actorId,
      req.params.id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "Transfer discrepancy resolved successfully",
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
  createStockTransfer,
  getStockTransfers,
  getStockTransferById,
  updateStockTransferStatus,
  dispatchStockTransfer,
  receiveStockTransfer,
  returnStockTransfer,
  resolveTransferDiscrepancy,
};
