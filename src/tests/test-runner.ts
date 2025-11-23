// src/tests/test-runner.ts
import assert from "assert";
import { normalizeToken } from "../services/normalize";
import { mergeTokenLists } from "../services/mergeTokens";
import { TokenData } from "../types/token";

/**
 * Small helper to create tokens easily
 */
function t(addr: string, fields: Partial<TokenData> = {}): TokenData {
  return { token_address: addr, ...fields };
}

let passed = 0;
let failed = 0;

function ok(name: string, fn: () => void) {
  try {
    fn();
    console.log("✅", name);
    passed++;
  } catch (e) {
    console.error("❌", name);
    console.error("   ", e instanceof Error ? e.message : e);
    failed++;
  }
}

/**
 * Tests
 */
ok("normalize: numeric strings convert to numbers", () => {
  const x = normalizeToken(t("A", { price_sol: "0.0001" as any, volume_sol: "123.45" as any }));
  assert.strictEqual(typeof x.price_sol, "number");
  assert.strictEqual(typeof x.volume_sol, "number");
  assert.strictEqual(Number((x.price_sol ?? 0).toFixed(6)) >= 0, true);
});

ok("normalize: invalid numeric becomes undefined", () => {
  const x = normalizeToken(t("B", { price_sol: "not-a-number" as any }));
  assert.strictEqual(x.price_sol, undefined);
});

ok("merge: no duplicates returns same count", () => {
  const a = [t("1", { token_name: "One" }), t("2", { token_name: "Two" })];
  const merged = mergeTokenLists([a]);
  assert.strictEqual(merged.length, 2);
});

ok("merge: duplicates merged by address and sources combined", () => {
  const a = [t("X", { token_name: "X", sources: ["dex"] as any, liquidity_sol: 10 })];
  const b = [t("x", { token_ticker: "XTK", sources: ["jup"] as any, liquidity_sol: 20 })];
  const merged = mergeTokenLists([a, b]);
  assert.strictEqual(merged.length, 1);
  const m = merged[0];
  assert.strictEqual(m.token_address.toLowerCase(), "x");
  assert.ok(Array.isArray(m.sources) && m.sources.includes("dex") && m.sources.includes("jup"));
  // liquidity should be max (20)
  assert.strictEqual(m.liquidity_sol, 20);
});

ok("merge: prefer price from higher-liquidity source", () => {
  const a = [t("P", { price_sol: 1, liquidity_sol: 100 })];
  const b = [t("p", { price_sol: 2, liquidity_sol: 200 })];
  const merged = mergeTokenLists([a, b]);
  const m = merged.find(x => x.token_address.toLowerCase() === "p");
  assert.strictEqual(m?.price_sol, 2);
});

ok("merge: volume summed when both present", () => {
  const a = [t("V", { volume_sol: 10 })];
  const b = [t("v", { volume_sol: 15 })];
  const merged = mergeTokenLists([a, b]);
  const m = merged.find(x => x.token_address.toLowerCase() === "v");
  assert.strictEqual(m?.volume_sol, 25);
});

ok("merge: transaction_count chooses max", () => {
  const a = [t("T", { transaction_count: 5 })];
  const b = [t("t", { transaction_count: 20 })];
  const merged = mergeTokenLists([a, b]);
  const m = merged.find(x => x.token_address.toLowerCase() === "t");
  assert.strictEqual(m?.transaction_count, 20);
});

ok("merge: price_1hr_change prefer higher liquidity", () => {
  const a = [t("C", { price_1hr_change: 1, liquidity_sol: 5 })];
  const b = [t("c", { price_1hr_change: 10, liquidity_sol: 50 })];
  const merged = mergeTokenLists([a, b]);
  const m = merged.find(x => x.token_address.toLowerCase() === "c");
  assert.strictEqual(m?.price_1hr_change, 10);
});

ok("merge: skip entries without address", () => {
  // @ts-ignore - simulate bad input without token_address
  const a = [{ token_name: "NoAddr" }];
  // the function expects TokenData[] but will skip invalid entries
  const merged = mergeTokenLists([a as any]);
  assert.strictEqual(Array.isArray(merged), true);
});

ok("merge: preserve token_name and ticker when available", () => {
  const a = [t("N", { token_name: "NameA" })];
  const b = [t("n", { token_ticker: "TICK" })];
  const merged = mergeTokenLists([a, b]);
  const m = merged.find(x => x.token_address.toLowerCase() === "n");
  assert.strictEqual(m?.token_name, "NameA");
  assert.strictEqual(m?.token_ticker, "TICK");
});

/**
 * Summary and exit code
 */
console.log("");
console.log(`Tests passed: ${passed}, Tests failed: ${failed}`);

if (failed > 0) {
  console.error("Some tests failed");
  process.exit(2);
} else {
  console.log("All tests passed ✅");
  process.exit(0);
}
