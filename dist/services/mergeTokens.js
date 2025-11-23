"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeTokenLists = mergeTokenLists;
const normalize_1 = require("./normalize");
/**
 * Merge tokens list from multiple sources.
 * Strategy:
 *  - Unique key: token_address (lowercased)
 *  - Combine sources array
 *  - For numeric fields: prefer the value coming from the entry that has highest liquidity (if present),
 *    otherwise prefer non-null value in this order: incoming -> existing
 *  - For volume: sum volumes where both present
 *  - For token_name/ticker: prefer non-empty existing, otherwise incoming
 */
function chooseNumericPreferHigherLiquidity(existing, incoming, field) {
    const eVal = existing[field];
    const iVal = incoming[field];
    if (eVal == null && iVal == null)
        return undefined;
    if (eVal == null)
        return iVal;
    if (iVal == null)
        return eVal;
    const eLiq = existing.liquidity_sol ?? 0;
    const iLiq = incoming.liquidity_sol ?? 0;
    return iLiq >= eLiq ? iVal : eVal;
}
function mergeTokenLists(lists) {
    const map = new Map();
    for (const list of lists) {
        for (const raw of list) {
            const incoming = (0, normalize_1.normalizeToken)(raw);
            const key = (incoming.token_address ?? "").toLowerCase();
            if (!key)
                continue;
            const existing = map.get(key);
            if (!existing) {
                map.set(key, { ...incoming, sources: Array.from(new Set(incoming.sources ?? [])) });
                continue;
            }
            // merge sources
            const sources = Array.from(new Set([...(existing.sources ?? []), ...(incoming.sources ?? [])]));
            // name / ticker: prefer existing if present
            const token_name = existing.token_name || incoming.token_name;
            const token_ticker = existing.token_ticker || incoming.token_ticker;
            // price: prefer from higher-liquidity source
            const price_sol = chooseNumericPreferHigherLiquidity(existing, incoming, "price_sol");
            // market cap: prefer higher-liquidity source
            const market_cap_sol = chooseNumericPreferHigherLiquidity(existing, incoming, "market_cap_sol");
            // liquidity: choose max
            const liquidity_sol = Math.max(existing.liquidity_sol ?? 0, incoming.liquidity_sol ?? 0) || undefined;
            // transaction count: choose max if available
            const transaction_count = Math.max(existing.transaction_count ?? 0, incoming.transaction_count ?? 0) || undefined;
            // price_1hr_change: prefer higher-liquidity
            const price_1hr_change = chooseNumericPreferHigherLiquidity(existing, incoming, "price_1hr_change");
            // volume: sum if both present else prefer non-null
            let volume_sol;
            if ((existing.volume_sol ?? undefined) != null && (incoming.volume_sol ?? undefined) != null) {
                volume_sol = (existing.volume_sol ?? 0) + (incoming.volume_sol ?? 0);
            }
            else {
                volume_sol = existing.volume_sol ?? incoming.volume_sol ?? undefined;
            }
            const merged = {
                token_address: existing.token_address || incoming.token_address,
                token_name,
                token_ticker,
                price_sol,
                market_cap_sol,
                volume_sol,
                liquidity_sol,
                transaction_count,
                price_1hr_change,
                protocol: existing.protocol || incoming.protocol,
                sources
            };
            map.set(key, merged);
        }
    }
    // return as array
    return Array.from(map.values());
}
