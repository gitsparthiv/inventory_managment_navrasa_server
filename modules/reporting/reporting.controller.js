const reportingService = require("./reporting.service");

/**
 * Helper to escape CSV cell content
 */
const escapeCSV = (val) => {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
};

/**
 * 1. Inventory Report Handler
 */
const getInventoryReport = async (req, res) => {
  try {
    const result = await reportingService.getInventoryReport(
      req.user.tenantId,
      req.query
    );

    if (req.query.format === "csv") {
      const headers = [
        "Branch ID",
        "Product Name",
        "SKU",
        "Barcode",
        "Unit",
        "Quantity",
        "Cost Price",
        "Selling Price",
        "Cost Valuation",
        "Retail Valuation",
        "Min Stock",
        "Reorder Level",
        "Low Stock Flag",
        "Critical Stock Flag",
      ];

      const rows = result.data.map((item) => [
        escapeCSV(item.branchId),
        escapeCSV(item.productName),
        escapeCSV(item.sku),
        escapeCSV(item.barcode),
        escapeCSV(item.unit),
        escapeCSV(item.quantity),
        escapeCSV(item.costPrice),
        escapeCSV(item.sellingPrice),
        escapeCSV(item.totalCostValuation),
        escapeCSV(item.totalRetailValuation),
        escapeCSV(item.minimumStock),
        escapeCSV(item.reorderLevel),
        escapeCSV(item.isLowStock),
        escapeCSV(item.isCriticalStock),
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="inventory_report_${Date.now()}.csv"`
      );
      return res.status(200).send(csvContent);
    }

    res.status(200).json({
      success: true,
      summary: result.summary,
      data: result.data,
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

/**
 * 2. Low-Stock Report Handler
 */
const getLowStockReport = async (req, res) => {
  try {
    const result = await reportingService.getLowStockReport(
      req.user.tenantId,
      req.query
    );

    if (req.query.format === "csv") {
      const headers = [
        "Branch ID",
        "Product Name",
        "SKU",
        "Unit",
        "Current Quantity",
        "Cost Price",
        "Min Stock",
        "Reorder Level",
        "Reorder Deficit",
        "Estimated Reorder Cost",
        "Critical Stock Flag",
      ];

      const rows = result.data.map((item) => [
        escapeCSV(item.branchId),
        escapeCSV(item.productName),
        escapeCSV(item.sku),
        escapeCSV(item.unit),
        escapeCSV(item.quantity),
        escapeCSV(item.costPrice),
        escapeCSV(item.minimumStock),
        escapeCSV(item.reorderLevel),
        escapeCSV(item.reorderDeficit),
        escapeCSV(item.estimatedReorderCost),
        escapeCSV(item.isCriticalStock),
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="low_stock_report_${Date.now()}.csv"`
      );
      return res.status(200).send(csvContent);
    }

    res.status(200).json({
      success: true,
      summary: result.summary,
      data: result.data,
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

/**
 * 3. Movements Report Handler
 */
const getMovementsReport = async (req, res) => {
  try {
    const result = await reportingService.getMovementsReport(
      req.user.tenantId,
      req.query
    );

    if (req.query.format === "csv") {
      const headers = [
        "Timestamp",
        "Branch ID",
        "Product Name",
        "SKU",
        "Unit",
        "Movement Type",
        "Quantity Change",
        "Reason",
        "Actor Name",
      ];

      const rows = result.data.map((item) => [
        escapeCSV(item.createdAt),
        escapeCSV(item.branchId),
        escapeCSV(item.productId?.name || ""),
        escapeCSV(item.productId?.sku || ""),
        escapeCSV(item.productId?.unit || ""),
        escapeCSV(item.movementType),
        escapeCSV(item.quantityChange),
        escapeCSV(item.reason),
        escapeCSV(item.actorId?.name || ""),
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="movements_report_${Date.now()}.csv"`
      );
      return res.status(200).send(csvContent);
    }

    res.status(200).json({
      success: true,
      summary: result.summary,
      data: result.data,
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

/**
 * 4. Purchasing Report Handler
 */
const getPurchasingReport = async (req, res) => {
  try {
    const result = await reportingService.getPurchasingReport(
      req.user.tenantId,
      req.query
    );

    if (req.query.format === "csv") {
      const headers = [
        "PO Number",
        "Order Date",
        "Supplier",
        "Status",
        "Total Amount",
        "Created By",
      ];

      const rows = result.data.map((item) => [
        escapeCSV(item.poNumber),
        escapeCSV(item.orderDate),
        escapeCSV(item.supplierId?.name || ""),
        escapeCSV(item.status),
        escapeCSV(item.totalAmount),
        escapeCSV(item.createdBy?.name || ""),
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="purchasing_report_${Date.now()}.csv"`
      );
      return res.status(200).send(csvContent);
    }

    res.status(200).json({
      success: true,
      summary: result.summary,
      data: result.data,
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

/**
 * 5. Suppliers Report Handler
 */
const getSuppliersReport = async (req, res) => {
  try {
    const result = await reportingService.getSuppliersReport(
      req.user.tenantId,
      req.query
    );

    if (req.query.format === "csv") {
      const headers = [
        "Supplier Name",
        "Contact Person",
        "Email",
        "Phone",
        "Status",
        "Total Orders",
        "Completed Orders",
        "Total Spend",
        "Ordered Qty",
        "Received Qty",
        "Fulfillment Rate (%)",
      ];

      const rows = result.data.map((item) => [
        escapeCSV(item.name),
        escapeCSV(item.contactPerson),
        escapeCSV(item.email),
        escapeCSV(item.phone),
        escapeCSV(item.status),
        escapeCSV(item.totalOrders),
        escapeCSV(item.completedOrders),
        escapeCSV(item.totalSpend),
        escapeCSV(item.totalOrderedQuantity),
        escapeCSV(item.totalReceivedQuantity),
        escapeCSV(item.fulfillmentRate),
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="suppliers_report_${Date.now()}.csv"`
      );
      return res.status(200).send(csvContent);
    }

    res.status(200).json({
      success: true,
      summary: result.summary,
      data: result.data,
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

/**
 * 6. Dashboard Metrics Handler
 */
const getDashboardMetrics = async (req, res) => {
  try {
    const result = await reportingService.getDashboardMetrics(
      req.user.tenantId,
      req.query
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

module.exports = {
  getInventoryReport,
  getLowStockReport,
  getMovementsReport,
  getPurchasingReport,
  getSuppliersReport,
  getDashboardMetrics,
};
