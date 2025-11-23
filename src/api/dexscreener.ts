// src/api/dexscreener.ts
import { axiosGetWithRetry } from "../utils/httpRetry";
import { TokenData } from "../types/token";

/**
 * DexScreener search endpoint:
 * https://api.dexscreener.com/latest/dex/search?q={query}
 *
 * We'll call search by query and map results to TokenData.
 */

const DEXSCREENER_SEARCH = (q: string) =>
  `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;

type DexScreenerSearchResponse = {
  pairs?: Array<any>;
  tokens?: Array<any>;
  // API can vary; we'll defensively handle it
};

function mapDexScreenerTokenToTokenData(item: any): TokenData | null {
  try {
    // DexScreener returns different shapes; try to extract token info
    const tokenAddress =
      item?.tokenAddress ||
      item?.token_address ||
      item?.address ||
      item?.id ||
      (item?.tokenA?.address ?? item?.tokenB?.address) ||
      null;

    if (!tokenAddress) return null;

    const name = item?.name || item?.tokenName || item?.token?.name || item?.tokenA?.name || item?.tokenB?.name;
    const symbol =
      item?.symbol ||
      item?.tokenTicker ||
      item?.token?.symbol ||
      item?.tokenA?.symbol ||
      item?.tokenB?.symbol;

    const price = Number(item?.priceUsd ?? item?.price ?? item?.lastPrice ?? item?.price_sol) || undefined;
    const marketCap = Number(item?.marketCap ?? item?.market_cap ?? item?.marketCapUsd) || undefined;
    const volume = Number(item?.volume ?? item?.volumeUsd ?? item?.volume_24h) || undefined;
    const liquidity = Number(item?.liquidity ?? item?.liquidityUsd) || undefined;
    const txCount = Number(item?.txCount ?? item?.transaction_count) || undefined;
    const change1h = Number(item?.priceChange1h ?? item?.price_1hr_change ?? item?.priceChangeHour) || undefined;
    const protocol = item?.dexName || item?.router || item?.protocol || undefined;

    const token: TokenData = {
      token_address: String(tokenAddress),
      token_name: name,
      token_ticker: symbol,
      price_sol: price,
      market_cap_sol: marketCap,
      volume_sol: volume,
      liquidity_sol: liquidity,
      transaction_count: txCount,
      price_1hr_change: change1h,
      protocol,
      sources: ["dexscreener"]
    };

    return token;
  } catch (e) {
    return null;
  }
}

export async function searchDexScreener(query: string): Promise<TokenData[]> {
  const url = DEXSCREENER_SEARCH(query);
  const resp = await axiosGetWithRetry<DexScreenerSearchResponse>(url);
  const body = resp.data || {};
  // DexScreener sometimes returns `pairs` or `tokens`
  const items = body.pairs ?? body.tokens ?? [];

  const tokens: TokenData[] = [];
  for (const it of items) {
    const mapped = mapDexScreenerTokenToTokenData(it);
    if (mapped) tokens.push(mapped);
  }

  return tokens;
}
