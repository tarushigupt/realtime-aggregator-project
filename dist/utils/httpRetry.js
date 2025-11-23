"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.axiosGetWithRetry = axiosGetWithRetry;
// src/utils/httpRetry.ts
const axios_1 = __importDefault(require("axios"));
async function axiosGetWithRetry(url, config = {}, maxRetries = 5, baseDelayMs = 500) {
    let attempt = 0;
    while (true) {
        try {
            const resp = await axios_1.default.get(url, config);
            return resp;
        }
        catch (err) {
            attempt++;
            const status = err?.response?.status;
            // Retry on network errors, 429, and 5xx
            const shouldRetry = !err.response || status === 429 || (status >= 500 && status < 600);
            if (!shouldRetry || attempt > maxRetries) {
                throw err;
            }
            // Exponential backoff with jitter
            const delay = Math.round(baseDelayMs * Math.pow(2, attempt - 1));
            const jitter = Math.round(Math.random() * baseDelayMs);
            const sleepMs = delay + jitter;
            await new Promise((r) => setTimeout(r, sleepMs));
        }
    }
}
