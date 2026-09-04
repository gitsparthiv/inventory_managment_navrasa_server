const supplierService = require("./supplier.service");

const createSupplier = async (req, res) => {
  try {
    const supplier = await supplierService.createSupplier(
      req.user.tenantId,
      req.body
    );

    res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      data: supplier,
    });
  } catch (error) {
    const status = error.status || (error.code === 11000 ? 409 : 500);
    res.status(status).json({
      success: false,
      message: error.code === 11000 ? "Supplier with this name already exists" : error.message,
    });
  }
};

const getSuppliers = async (req, res) => {
  try {
    const result = await supplierService.getSuppliers(
      req.user.tenantId,
      req.query
    );

    res.status(200).json({
      success: true,
      data: result.suppliers,
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

const getSupplierById = async (req, res) => {
  try {
    const supplier = await supplierService.getSupplierById(
      req.user.tenantId,
      req.params.id
    );

    res.status(200).json({
      success: true,
      data: supplier,
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const supplier = await supplierService.updateSupplier(
      req.user.tenantId,
      req.params.id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "Supplier updated successfully",
      data: supplier,
    });
  } catch (error) {
    const status = error.status || (error.code === 11000 ? 409 : 500);
    res.status(status).json({
      success: false,
      message: error.code === 11000 ? "Supplier with this name already exists" : error.message,
    });
  }
};

const getSupplierHistory = async (req, res) => {
  try {
    const history = await supplierService.getSupplierHistory(
      req.user.tenantId,
      req.params.id
    );

    res.status(200).json({
      success: true,
      data: history,
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
  createSupplier,
  getSuppliers,
  getSupplierById,
  updateSupplier,
  getSupplierHistory,
};
