const express = require("express");
const router = express.Router();

const authController = require("./auth.controller");
const authenticate = require("../../shared/middleware/auth.middleware");

router.post("/register", authController.register);
router.post("/login", authController.login);

router.get("/me", authenticate, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
});

module.exports = router;