const redis = require("../../config/redis");

const IDEMPOTENCY_LOCK_TTL_SECONDS = 30;
const IDEMPOTENCY_EXPIRY_SECONDS = 86400; // 24 hours

/**
 * Redis-backed Idempotency Middleware.
 * Optional: Only activates if "idempotency-key" (or "x-idempotency-key") header is present.
 * Uses authenticated tenantId from req.user to ensure strict multi-tenant key isolation.
 */
const idempotency = () => {
  return async (req, res, next) => {
    const rawKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"];

    // If no key provided, proceed normally without idempotency overhead
    if (!rawKey || typeof rawKey !== "string" || !rawKey.trim()) {
      return next();
    }

    const idempotencyKey = rawKey.trim();//trim removes beginning and end whitespace.
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required before idempotency evaluation",
      });
    }

    const redisKey = `idempotency:tenant:${tenantId}:${idempotencyKey}`;

    try {
      // 1. Check if a record already exists
      const existingRecord = await redis.get(redisKey);

      if (existingRecord) {
        try {
          const parsed = JSON.parse(existingRecord);

          // If completed, replay the original response immediately
          if (parsed.status === "completed") {
            res.setHeader("X-Idempotent-Replayed", "true");
            return res.status(parsed.statusCode || 200).json(parsed.body);
          }

          // If currently processing, return 409 Conflict
          if (parsed.status === "processing") {
            res.setHeader("Retry-After", "1");
            return res.status(409).json({
              success: false,
              message: "A request with this idempotency key is currently processing. Please retry shortly.",
            });
          }
        } catch (parseErr) {
          // If JSON corrupted, delete key and allow fresh execution
          await redis.del(redisKey);
        }
      }

      // 2. Acquire atomic processing lock using Redis SET NX EX 30
      const lockPayload = JSON.stringify({
        status: "processing",
        startedAt: new Date().toISOString(),
      });

      const acquired = await redis.set(
        redisKey,
        lockPayload,
        "EX",
        IDEMPOTENCY_LOCK_TTL_SECONDS,
        "NX"
      );

      // If another concurrent request beat us to the lock
      if (!acquired) {
        res.setHeader("Retry-After", "1");
        return res.status(409).json({
          success: false,
          message: "A request with this idempotency key is currently processing. Please retry shortly.",
        });
      }

      // 3. Intercept res.json to store successful responses (2xx) or clear lock on failure (4xx/5xx)
      const originalJson = res.json.bind(res);

      res.json = (body) => {
        const statusCode = res.statusCode || 200;

        // Perform Redis updates asynchronously so we never block or fail the client response
        (async () => {
          try {
            if (statusCode >= 200 && statusCode < 300) {
              const completedPayload = JSON.stringify({
                status: "completed",
                statusCode,
                body,
                completedAt: new Date().toISOString(),
              });
              await redis.set(redisKey, completedPayload, "EX", IDEMPOTENCY_EXPIRY_SECONDS);
            } else {
              // On 4xx / 5xx responses, clear the key so the client can correct input and retry
              await redis.del(redisKey);
            }
          } catch (err) {
            console.warn("Redis idempotency post-response error:", err.message);
          }
        })();

        return originalJson(body);
      };

      next();
    } catch (err) {
      console.warn("Redis idempotency middleware error (proceeding without idempotency):", err.message);
      next();
    }
  };
};

module.exports = idempotency;
