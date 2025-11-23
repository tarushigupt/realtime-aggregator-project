"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeToken = normalizeToken;
/**
 * Normalize a TokenData entry to ensure numeric fields are proper numbers or undefined
 */
function normalizeToken(token) {
    const toNum = (v) => {
        if (v === null || v === undefined)
            return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    };
    return {
        ...token,
        price_sol: toNum(token.price_sol),
        market_cap_sol: toNum(token.market_cap_sol),
        volume_sol: toNum(token.volume_sol),
        liquidity_sol: toNum(token.liquidity_sol),
        transaction_count: token.transaction_count ? Math.floor(Number(token.transaction_count)) : undefined,
        price_1hr_change: toNum(token.price_1hr_change),
        sources: token.sources ?? []
    };
}
