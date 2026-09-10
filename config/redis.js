const Redis = require("ioredis");

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on("connect", () => {
  console.log("Redis connecting...");
});

redis.on("ready", () => {
  console.log("Redis connected and ready");
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

redis.on("close", () => {
  console.log("Redis connection closed");
});

redis.on("reconnecting", () => {
  console.log("Redis reconnecting...");
});

module.exports = redis;
