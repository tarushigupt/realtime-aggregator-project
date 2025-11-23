"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/tokens.ts
const express_1 = require("express");
const dexscreener_1 = require("../api/dexscreener");
const jupiter_1 = require("../api/jupiter");
const mergeTokens_1 = require("../services/mergeTokens");
const redis_1 = require("../cache/redis");
const redis_2 = __importDefault(require("../cache/redis"));
const router = (0, express_1.Router)();
const DEFAULT_TTL = Number(process.env.CACHE_TTL_SECONDS ?? 30);
/* Utility to make safe cache key */
function cacheKeyFor(query) {
    const safe = String(query).trim().toLowerCase();
    return `tokens:${safe}`;
}
/* Helper for sorting */
function getValue(sortBy, token, period) {
    switch (sortBy) {
        case "volume":
            return token.volume_sol;
        case "liquidity":
            return token.liquidity_sol;
        case "market_cap":
            return token.market_cap_sol;
        case "price_change":
            if (period === "1h")
                return token.price_1hr_change;
            if (period === "24h")
                return token.price_24hr_change;
            if (period === "7d")
                return token.price_7d_change;
            return token.price_1hr_change; // default
    }
    return undefined;
}
/* ---------------- ROUTE ------------------ */
router.get("/", async (req, res) => {
    try {
        const q = String(req.query.query ?? "sol").trim().toLowerCase();
        // Add query to watched set for dynamic poller
        try {
            await redis_2.default.sadd("watched:queries", q);
        }
        catch (e) {
            console.warn("[tokens] failed to SADD watched query:", e);
        }
        // Check cache
        const key = cacheKeyFor(q);
        const cached = await (0, redis_1.getJson)(key);
        if (cached) {
            return res.json({
                data: cached.data,
                nextCursor: cached.nextCursor ?? null,
                hasMore: cached.hasMore ?? false,
                total: cached.total ?? cached.data.length,
                cached: true
            });
        }
        // Fetch from APIs
        const [dexP, jupP] = await Promise.allSettled([
            (0, dexscreener_1.searchDexScreener)(q),
            (0, jupiter_1.searchJupiter)(q)
        ]);
        const dexTokens = dexP.status === "fulfilled" ? dexP.value : [];
        const jupTokens = jupP.status === "fulfilled" ? jupP.value : [];
        // Merge both sources
        let merged = (0, mergeTokens_1.mergeTokenLists)([dexTokens, jupTokens]);
        /* ----------- FILTERING ----------- */
        const period = String(req.query.period ?? "").toLowerCase();
        if (period === "1h") {
            merged = merged.filter(t => t.price_1hr_change !== undefined);
        }
        else if (period === "24h") {
            merged = merged.filter(t => t.price_24hr_change !== undefined);
        }
        else if (period === "7d") {
            merged = merged.filter(t => t.price_7d_change !== undefined);
        }
        /* ----------- SORTING ----------- */
        const sortBy = String(req.query.sort ?? "").toLowerCase();
        const order = String(req.query.order ?? "desc").toLowerCase();
        const factor = order === "asc" ? 1 : -1;
        if (sortBy) {
            merged.sort((a, b) => {
                const A = getValue(sortBy, a, period);
                const B = getValue(sortBy, b, period);
                if (A == null && B == null)
                    return 0;
                if (A == null)
                    return 1;
                if (B == null)
                    return -1;
                return factor * (A - B);
            });
        }
        /* ----------- CURSOR PAGINATION ----------- */
        const limit = Math.min(Number(req.query.limit ?? 20), 100);
        const cursor = Math.max(Number(req.query.cursor ?? 0), 0);
        const paginated = merged.slice(cursor, cursor + limit);
        const nextCursor = cursor + limit < merged.length ? cursor + limit : null;
        const response = {
            data: paginated,
            nextCursor,
            hasMore: nextCursor !== null,
            total: merged.length
        };
        // Save into cache
        await (0, redis_1.setJson)(key, response, DEFAULT_TTL);
        return res.json({ ...response, cached: false });
    }
    catch (err) {
        console.error("Error in /tokens:", err);
        return res.status(500).json({ error: "Failed to fetch tokens" });
    }
});
exports.default = router;
