// src/types/token.ts
export interface TokenData {
  token_address: string;
  token_name?: string;
  token_ticker?: string;
  price_sol?: number;
  market_cap_sol?: number;
  volume_sol?: number;
  liquidity_sol?: number;
  transaction_count?: number;
  price_1hr_change?: number;
  protocol?: string;
  sources?: string[]; 
}
