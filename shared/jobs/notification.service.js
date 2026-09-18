/**
 * Low-Stock Notification Service
 * Development Mode: Logs structured visual alert to console without sending real emails.
 * Production Mode: Uses Nodemailer/SMTP transport if configured in environment variables.
 */

const sendLowStockNotification = async ({
  tenantId,
  recipients,
  product,
  branchId,
  currentQuantity,
  reorderLevel,
  minimumStock,
  isCritical,
}) => {
  const urgencyLabel = isCritical ? "CRITICAL (Below Minimum Stock)" : "WARNING (Below Reorder Level)";
  const recipientEmails = recipients.map((r) => r.email).filter(Boolean);

  if (process.env.NODE_ENV !== "production") {
    // Development / Testing Mode: Structured Console Alert
    console.log("\n==================================================");
    console.log("?? [LOW-STOCK ALERT DISPATCHED - DEV MODE]");
    console.log("==================================================");
    console.log(`Urgency:         ${urgencyLabel}`);
    console.log(`Product:         ${product.name} (SKU: ${product.sku})`);
    console.log(`Unit:            ${product.unit}`);
    console.log(`Tenant ID:       ${tenantId}`);
    console.log(`Branch ID:       ${branchId}`);
    console.log(`Current Stock:   ${currentQuantity}`);
    console.log(`Reorder Level:   ${reorderLevel}`);
    console.log(`Minimum Stock:   ${minimumStock}`);
    console.log(`Recipients (${recipients.length}):  ${recipientEmails.join(", ") || "None found"}`);
    console.log(`Timestamp:       ${new Date().toISOString()}`);
    console.log("==================================================\n");

    return {
      success: true,
      mode: "development",
      recipients: recipientEmails,
    };
  }

  // Production Mode: SMTP Dispatch
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error(
      "SMTP configuration missing in production environment (SMTP_HOST, SMTP_USER, SMTP_PASS required)"
    );
  }

  // If production SMTP is configured:
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort) || 587,
    secure: Number(smtpPort) === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || `"NavRasa Inventory" <no-reply@navrasa.com>`,
    to: recipientEmails.join(", "),
    subject: `[${urgencyLabel}] Low Stock Alert: ${product.name} (${product.sku})`,
    text: `Low stock alert for ${product.name} (SKU: ${product.sku}). Current stock: ${currentQuantity} ${product.unit}. Reorder level is ${reorderLevel}.`,
    html: `
      <h2>${urgencyLabel}</h2>
      <p><strong>Product:</strong> ${product.name} (${product.sku})</p>
      <p><strong>Current Quantity:</strong> ${currentQuantity} ${product.unit}</p>
      <p><strong>Reorder Level:</strong> ${reorderLevel}</p>
      <p><strong>Minimum Stock:</strong> ${minimumStock}</p>
      <p><strong>Branch ID:</strong> ${branchId}</p>
      <p>Please reorder stock as soon as possible.</p>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  return {
    success: true,
    mode: "production",
    messageId: info.messageId,
  };
};

module.exports = {
  sendLowStockNotification,
};
