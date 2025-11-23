"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchJupiter = searchJupiter;
// src/api/jupiter.ts
const httpRetry_1 = require("../utils/httpRetry");
const JUPITER_SEARCH = (q) => `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(q)}`;
function mapJupiterItemToTokenData(it) {
    try {
        // Example Jupiter token object:
        // { address, symbol, name, price, marketCap, liquidity, volume24h, ... }
        const address = it?.address || it?.mint || it?.id;
        if (!address)
            return null;
        const price = Number(it?.price || it?.priceUsd || it?.price_sol) || undefined;
        const marketCap = Number(it?.marketCap || it?.market_cap) || undefined;
        const volume = Number(it?.volume24h || it?.volume) || undefined;
        const liquidity = Number(it?.liquidity) || undefined;
        const change1h = Number(it?.priceChange1h || it?.change_1h) || undefined;
        const token = {
            token_address: String(address),
            token_name: it?.name || it?.tokenName || undefined,
            token_ticker: it?.symbol || it?.tokenTicker || undefined,
            price_sol: price,
            market_cap_sol: marketCap,
            volume_sol: volume,
            liquidity_sol: liquidity,
            transaction_count: undefined,
            price_1hr_change: change1h,
            protocol: "jupiter",
            sources: ["jupiter"]
        };
        return token;
    }
    catch (e) {
        return null;
    }
}
async function searchJupiter(query) {
    const url = JUPITER_SEARCH(query);
    const resp = await (0, httpRetry_1.axiosGetWithRetry)(url);
    const items = resp.data?.data ?? [];
    const tokens = [];
    for (const it of items) {
        const mapped = mapJupiterItemToTokenData(it);
        if (mapped)
            tokens.push(mapped);
    }
    return tokens;
}
