/**
 * BullMQ Connection Options
 * Parses process.env.REDIS_URL to provide a standard connection options object
 * compatible with BullMQ Queue and Worker instances.
 */
const getRedisConnectionOptions = () => {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  try {
    const url = new URL(redisUrl);
    const options = {
      host: url.hostname || "localhost",
      port: Number(url.port) || 6379,
      maxRetriesPerRequest: null, // Mandatory for BullMQ workers
      enableReadyCheck: false,
    };

    if (url.username) {
      options.username = url.username;
    }
    if (url.password) {
      options.password = url.password;
    }
    if (url.protocol === "rediss:") {
      options.tls = {};
    }

    return options;
  } catch (err) {
    // Fallback if URL parsing fails
    return {
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
};

module.exports = {
  getRedisConnectionOptions,
};
