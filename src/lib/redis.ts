import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 5) return null;
    return Math.min(times * 200, 2000);
  },
});

redis.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});
