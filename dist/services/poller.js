"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPoller = startPoller;
const dexscreener_1 = require("../api/dexscreener");
const jupiter_1 = require("../api/jupiter");
const mergeTokens_1 = require("./mergeTokens");
const redis_1 = require("../cache/redis");
const redis_2 = __importDefault(require("../cache/redis"));
/**
 * Improved poller with configurable thresholds and smoothing using
 * short moving averages (history) stored in Redis per token.
 *
 * Behavior:
 * - For each watched query, fetch merged tokens.
 * - For each token, update history (price_history / volume_history).
 * - Compute moving average, then emit only when new value deviates
 *   from the moving average by the configured percent threshold.
 * - Use last_emitted_price / last_emitted_volume to avoid duplicate emits.
 *
 * Env vars:
 * - POLL_INTERVAL_SEC (default 10)
 * - WATCH_QUERIES (fallback list if watched:queries set is empty) e.g. "sol,tokenX"
 * - HISTORY_LEN (default 5)  -- number of previous values to keep
 * - PRICE_CHANGE_PCT_THRESHOLD (default 0.5) -- percent relative to moving avg
 * - VOLUME_CHANGE_PCT_THRESHOLD (default 50) -- percent relative to moving avg
 * - LIQUIDITY_CHANGE_PCT_THRESHOLD (default 10) -- percent relative to previous liquidity
 * - SNAPSHOT_TTL_SECONDS (default 3600)
 */
const DEFAULT_INTERVAL = Number(process.env.POLL_INTERVAL_SEC ?? 10);
const ENV_WATCHED = (process.env.WATCH_QUERIES ?? "sol").split(",").map(s => s.trim()).filter(Boolean);
const HISTORY_LEN = Math.max(1, Number(process.env.HISTORY_LEN ?? 5));
const PRICE_CHANGE_PCT_THRESHOLD = Number(process.env.PRICE_CHANGE_PCT_THRESHOLD ?? 0.5); // percent
const VOLUME_CHANGE_PCT_THRESHOLD = Number(process.env.VOLUME_CHANGE_PCT_THRESHOLD ?? 50); // percent
const LIQUIDITY_CHANGE_PCT_THRESHOLD = Number(process.env.LIQUIDITY_CHANGE_PCT_THRESHOLD ?? 10); // percent
const SNAPSHOT_TTL_SECONDS = Number(process.env.SNAPSHOT_TTL_SECONDS ?? 3600);
/* ---------- small helpers ---------- */
function isNumberLike(v) {
    return typeof v === "number" && Number.isFinite(v);
}
function pushTrim(arr, value, maxLen) {
    const a = Array.isArray(arr) ? arr.slice() : [];
    if (typeof value === "number" && Number.isFinite(value)) {
        a.push(value);
    }
    // keep last maxLen items
    while (a.length > maxLen)
        a.shift();
    return a;
}
function avg(arr) {
    if (!Array.isArray(arr) || arr.length === 0)
        return undefined;
    const s = arr.reduce((acc, v) => acc + v, 0);
    return s / arr.length;
}
function pctChange(oldVal, newVal) {
    if (oldVal == null || newVal == null)
        return Infinity;
    const denom = (oldVal === 0 ? 1 : oldVal);
    return Math.abs((newVal - oldVal) / denom) * 100;
}
/* ---------- Redis watched queries helper ---------- */
async function getWatchedQueriesFromRedis() {
    try {
        const members = await redis_2.default.smembers("watched:queries");
        if (members && members.length > 0) {
            return members.map(m => String(m).toLowerCase());
        }
    }
    catch (e) {
        console.warn("[poller] warning: failed to read watched:queries from redis:", e);
    }
    // fallback
    return ENV_WATCHED;
}
/* ---------- Compatibility: convert old snapshot to new entry format ---------- */
function convertOldSnapshot(oldRaw) {
    // old format was probably address => TokenData[]
    // or address => TokenData (without history). We'll wrap into SnapshotEntry and seed history.
    const snapshot = {};
    if (!oldRaw || typeof oldRaw !== "object")
        return snapshot;
    // if oldRaw is array (unlikely), handle simply
    if (Array.isArray(oldRaw)) {
        return snapshot;
    }
    for (const [addr, val] of Object.entries(oldRaw)) {
        try {
            const tokenObj = val.token || val || null;
            if (!tokenObj || !tokenObj.token_address)
                continue;
            const price = isNumberLike(tokenObj.price_sol) ? tokenObj.price_sol : undefined;
            const volume = isNumberLike(tokenObj.volume_sol) ? tokenObj.volume_sol : undefined;
            snapshot[addr.toLowerCase()] = {
                token: tokenObj,
                price_history: price !== undefined ? [price] : [],
                volume_history: volume !== undefined ? [volume] : [],
                last_emitted_price: null,
                last_emitted_volume: null,
                last_updated: Date.now()
            };
        }
        catch (e) {
            // ignore malformed entry
            continue;
        }
    }
    return snapshot;
}
/* ---------- Core poller ---------- */
function startPoller(io) {
    console.log(`[poller] starting improved poller. interval=${DEFAULT_INTERVAL}s history_len=${HISTORY_LEN}`);
    const poll = async () => {
        const queries = await getWatchedQueriesFromRedis();
        const queriesToIterate = (queries && queries.length) ? queries : ENV_WATCHED;
        for (const q of queriesToIterate) {
            try {
                // fetch both sources concurrently
                const [dexP, jupP] = await Promise.allSettled([(0, dexscreener_1.searchDexScreener)(q), (0, jupiter_1.searchJupiter)(q)]);
                const dexList = dexP.status === "fulfilled" ? dexP.value : [];
                const jupList = jupP.status === "fulfilled" ? jupP.value : [];
                const merged = (0, mergeTokens_1.mergeTokenLists)([dexList, jupList]);
                // Build "new entries" map for this poll run
                const newEntries = {};
                for (const t of merged) {
                    if (!t.token_address)
                        continue;
                    newEntries[t.token_address.toLowerCase()] = {
                        token: t,
                        price_history: [],
                        volume_history: [],
                        last_emitted_price: null,
                        last_emitted_volume: null,
                        last_updated: Date.now()
                    };
                }
                const key = `snapshot:${q}`;
                // load old snapshot from redis
                const oldRaw = await (0, redis_1.getJson)(key);
                let oldSnap = {};
                if (!oldRaw) {
                    oldSnap = {};
                }
                else {
                    // If oldRaw entries look like our SnapshotEntry (has token) use directly,
                    // otherwise convert from legacy format.
                    const sampleVal = Object.values(oldRaw)[0];
                    if (sampleVal && sampleVal.token) {
                        oldSnap = oldRaw;
                    }
                    else {
                        oldSnap = convertOldSnapshot(oldRaw);
                    }
                }
                const diffs = [];
                // For each token in newEntries, update histories using old snapshot if present
                for (const [addr, newEntry] of Object.entries(newEntries)) {
                    const newToken = newEntry.token;
                    const oldEntry = oldSnap[addr];
                    // get old histories if any
                    const prevPriceHist = oldEntry?.price_history ?? [];
                    const prevVolHist = oldEntry?.volume_history ?? [];
                    const lastEmittedPrice = oldEntry?.last_emitted_price ?? null;
                    const lastEmittedVolume = oldEntry?.last_emitted_volume ?? null;
                    // push and trim
                    const priceVal = isNumberLike(newToken.price_sol) ? newToken.price_sol : undefined;
                    const volVal = isNumberLike(newToken.volume_sol) ? newToken.volume_sol : undefined;
                    const newPriceHist = pushTrim(prevPriceHist, priceVal, HISTORY_LEN);
                    const newVolHist = pushTrim(prevVolHist, volVal, HISTORY_LEN);
                    newEntry.price_history = newPriceHist;
                    newEntry.volume_history = newVolHist;
                    newEntry.token = newToken;
                    newEntry.last_updated = Date.now();
                    newEntry.last_emitted_price = lastEmittedPrice;
                    newEntry.last_emitted_volume = lastEmittedVolume;
                    // compute moving averages (exclude current latest value when comparing? we include current into history but compare vs average of previous history excluding current to reduce immediate self-match)
                    const avgPriceBefore = avg(prevPriceHist);
                    const avgVolBefore = avg(prevVolHist);
                    // Determine whether to emit based on thresholds:
                    let toEmit = {};
                    // Price: if we have a previous average (non-empty) then compare new price to avg
                    if (typeof avgPriceBefore === "number" && typeof priceVal === "number") {
                        const pricePct = pctChange(avgPriceBefore, priceVal);
                        if (pricePct >= PRICE_CHANGE_PCT_THRESHOLD) {
                            // Also avoid emitting if we already emitted this price previously
                            if (lastEmittedPrice == null || lastEmittedPrice !== priceVal) {
                                toEmit.price_sol = priceVal;
                                newEntry.last_emitted_price = priceVal;
                            }
                        }
                    }
                    else {
                        // if no avg, but price changed from oldEntry.token.price_sol and is meaningful, emit once
                        if (oldEntry && isNumberLike(oldEntry.token.price_sol) && isNumberLike(priceVal)) {
                            const pricePct = pctChange(oldEntry.token.price_sol, priceVal);
                            if (pricePct >= PRICE_CHANGE_PCT_THRESHOLD) {
                                if (lastEmittedPrice == null || lastEmittedPrice !== priceVal) {
                                    toEmit.price_sol = priceVal;
                                    newEntry.last_emitted_price = priceVal;
                                }
                            }
                        }
                        else if (!oldEntry && isNumberLike(priceVal)) {
                            // brand new token — emit to announce it
                            toEmit = { ...newToken };
                            newEntry.last_emitted_price = priceVal;
                        }
                    }
                    // Volume: similar logic but threshold likely larger
                    if (typeof avgVolBefore === "number" && typeof volVal === "number") {
                        const volPct = pctChange(avgVolBefore, volVal);
                        if (volPct >= VOLUME_CHANGE_PCT_THRESHOLD) {
                            if (lastEmittedVolume == null || lastEmittedVolume !== volVal) {
                                toEmit.volume_sol = volVal;
                                newEntry.last_emitted_volume = volVal;
                            }
                        }
                    }
                    else {
                        if (oldEntry && isNumberLike(oldEntry.token.volume_sol) && isNumberLike(volVal)) {
                            const volPct = pctChange(oldEntry.token.volume_sol, volVal);
                            if (volPct >= VOLUME_CHANGE_PCT_THRESHOLD) {
                                if (lastEmittedVolume == null || lastEmittedVolume !== volVal) {
                                    toEmit.volume_sol = volVal;
                                    newEntry.last_emitted_volume = volVal;
                                }
                            }
                        }
                    }
                    // Liquidity: compare against previous liquidity (percent)
                    if (oldEntry && isNumberLike(oldEntry.token.liquidity_sol) && isNumberLike(newToken.liquidity_sol)) {
                        const liqPct = pctChange(oldEntry.token.liquidity_sol, newToken.liquidity_sol);
                        if (liqPct >= LIQUIDITY_CHANGE_PCT_THRESHOLD) {
                            toEmit.liquidity_sol = newToken.liquidity_sol;
                        }
                    }
                    else if (!oldEntry && isNumberLike(newToken.liquidity_sol)) {
                        // brand new token: include liquidity in initial emit if we are emitting other fields
                        // handled above when new token emits full token
                    }
                    // if there are any changes to emit, push to diffs
                    if (Object.keys(toEmit).length > 0) {
                        diffs.push({ token_address: addr, changes: toEmit });
                    }
                    // set into oldSnap (we'll overwrite with newEntry)
                    oldSnap[addr] = newEntry;
                }
                // Save enriched snapshot back to redis (old format no longer used for this key)
                await (0, redis_1.setJson)(key, oldSnap, SNAPSHOT_TTL_SECONDS);
                // Emit diffs to socket.io rooms if any
                if (diffs.length > 0) {
                    for (const d of diffs) {
                        io.to(`discover:${q}`).emit("tokenUpdate", { token_address: d.token_address, changes: d.changes, query: q });
                    }
                    console.log(`[poller] ${q}: emitted ${diffs.length} updates`);
                }
            }
            catch (err) {
                console.error("[poller] error for query", q, err);
            }
        }
    };
    // initial run
    poll().catch((e) => console.error("[poller] initial poll error", e));
    // schedule repeated runs
    setInterval(poll, DEFAULT_INTERVAL * 1000);
}
