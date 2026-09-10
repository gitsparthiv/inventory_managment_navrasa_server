const dotenv = require("dotenv");
// Load environment variables
dotenv.config();

const app = require("./app");
const connectDB = require("./config/db");
const redis = require("./config/redis");

const PORT = process.env.PORT || 5000;

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Connect to Redis
    await redis.connect();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();