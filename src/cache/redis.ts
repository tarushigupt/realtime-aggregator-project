// src/cache/redis.ts
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new Redis(redisUrl);

// helper: get JSON from redis and parse
export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    // broken cached payload: delete and return null
    await redis.del(key);
    return null;
  }
}

// helper: set JSON with TTL in seconds
export async function setJson(key: string, value: any, ttlSeconds?: number): Promise<void> {
  const s = JSON.stringify(value);
  if (ttlSeconds && ttlSeconds > 0) {
    await redis.set(key, s, "EX", ttlSeconds);
  } else {
    await redis.set(key, s);
  }
}

export default redis;
