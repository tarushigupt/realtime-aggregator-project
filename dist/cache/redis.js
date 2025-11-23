"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJson = getJson;
exports.setJson = setJson;
// src/cache/redis.ts
const ioredis_1 = __importDefault(require("ioredis"));
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new ioredis_1.default(redisUrl);
// helper: get JSON from redis and parse
async function getJson(key) {
    const raw = await redis.get(key);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch (e) {
        // broken cached payload: delete and return null
        await redis.del(key);
        return null;
    }
}
// helper: set JSON with TTL in seconds
async function setJson(key, value, ttlSeconds) {
    const s = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
        await redis.set(key, s, "EX", ttlSeconds);
    }
    else {
        await redis.set(key, s);
    }
}
exports.default = redis;
