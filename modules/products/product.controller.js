const productService = require("./product.service");

const createProduct = async (req, res) => {
  try {
    const product = await productService.createProduct(req.user.tenantId, req.body);

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    res.status(error.status || (error.code === 11000 ? 409 : 400)).json({
      success: false,
      message: error.code === 11000 ? "SKU already exists for this tenant" : error.message,
    });
  }
};

const getProducts = async (req, res) => {
  try {
    const products = await productService.getProducts(req.user.tenantId, req.query);

    res.status(200).json({
      success: true,
      products,
    });
  } catch (error) {
    res.status(error.status || 400).json({
      success: false,
      message: error.message,
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const product = await productService.updateProduct(
      req.user.tenantId,
      req.params.id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    res.status(error.status || (error.code === 11000 ? 409 : 400)).json({
      success: false,
      message: error.code === 11000 ? "SKU already exists for this tenant" : error.message,
    });
  }
};

module.exports = {
  createProduct,
  getProducts,
  updateProduct,
};
