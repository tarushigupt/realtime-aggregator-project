"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/tests/test-runner.ts
const assert_1 = __importDefault(require("assert"));
const normalize_1 = require("../services/normalize");
const mergeTokens_1 = require("../services/mergeTokens");
/**
 * Small helper to create tokens easily
 */
function t(addr, fields = {}) {
    return { token_address: addr, ...fields };
}
let passed = 0;
let failed = 0;
function ok(name, fn) {
    try {
        fn();
        console.log("✅", name);
        passed++;
    }
    catch (e) {
        console.error("❌", name);
        console.error("   ", e instanceof Error ? e.message : e);
        failed++;
    }
}
/**
 * Tests
 */
ok("normalize: numeric strings convert to numbers", () => {
    const x = (0, normalize_1.normalizeToken)(t("A", { price_sol: "0.0001", volume_sol: "123.45" }));
    assert_1.default.strictEqual(typeof x.price_sol, "number");
    assert_1.default.strictEqual(typeof x.volume_sol, "number");
    assert_1.default.strictEqual(Number((x.price_sol ?? 0).toFixed(6)) >= 0, true);
});
ok("normalize: invalid numeric becomes undefined", () => {
    const x = (0, normalize_1.normalizeToken)(t("B", { price_sol: "not-a-number" }));
    assert_1.default.strictEqual(x.price_sol, undefined);
});
ok("merge: no duplicates returns same count", () => {
    const a = [t("1", { token_name: "One" }), t("2", { token_name: "Two" })];
    const merged = (0, mergeTokens_1.mergeTokenLists)([a]);
    assert_1.default.strictEqual(merged.length, 2);
});
ok("merge: duplicates merged by address and sources combined", () => {
    const a = [t("X", { token_name: "X", sources: ["dex"], liquidity_sol: 10 })];
    const b = [t("x", { token_ticker: "XTK", sources: ["jup"], liquidity_sol: 20 })];
    const merged = (0, mergeTokens_1.mergeTokenLists)([a, b]);
    assert_1.default.strictEqual(merged.length, 1);
    const m = merged[0];
    assert_1.default.strictEqual(m.token_address.toLowerCase(), "x");
    assert_1.default.ok(Array.isArray(m.sources) && m.sources.includes("dex") && m.sources.includes("jup"));
    // liquidity should be max (20)
    assert_1.default.strictEqual(m.liquidity_sol, 20);
});
ok("merge: prefer price from higher-liquidity source", () => {
    const a = [t("P", { price_sol: 1, liquidity_sol: 100 })];
    const b = [t("p", { price_sol: 2, liquidity_sol: 200 })];
    const merged = (0, mergeTokens_1.mergeTokenLists)([a, b]);
    const m = merged.find(x => x.token_address.toLowerCase() === "p");
    assert_1.default.strictEqual(m?.price_sol, 2);
});
ok("merge: volume summed when both present", () => {
    const a = [t("V", { volume_sol: 10 })];
    const b = [t("v", { volume_sol: 15 })];
    const merged = (0, mergeTokens_1.mergeTokenLists)([a, b]);
    const m = merged.find(x => x.token_address.toLowerCase() === "v");
    assert_1.default.strictEqual(m?.volume_sol, 25);
});
ok("merge: transaction_count chooses max", () => {
    const a = [t("T", { transaction_count: 5 })];
    const b = [t("t", { transaction_count: 20 })];
    const merged = (0, mergeTokens_1.mergeTokenLists)([a, b]);
    const m = merged.find(x => x.token_address.toLowerCase() === "t");
    assert_1.default.strictEqual(m?.transaction_count, 20);
});
ok("merge: price_1hr_change prefer higher liquidity", () => {
    const a = [t("C", { price_1hr_change: 1, liquidity_sol: 5 })];
    const b = [t("c", { price_1hr_change: 10, liquidity_sol: 50 })];
    const merged = (0, mergeTokens_1.mergeTokenLists)([a, b]);
    const m = merged.find(x => x.token_address.toLowerCase() === "c");
    assert_1.default.strictEqual(m?.price_1hr_change, 10);
});
ok("merge: skip entries without address", () => {
    // @ts-ignore - simulate bad input without token_address
    const a = [{ token_name: "NoAddr" }];
    // the function expects TokenData[] but will skip invalid entries
    const merged = (0, mergeTokens_1.mergeTokenLists)([a]);
    assert_1.default.strictEqual(Array.isArray(merged), true);
});
ok("merge: preserve token_name and ticker when available", () => {
    const a = [t("N", { token_name: "NameA" })];
    const b = [t("n", { token_ticker: "TICK" })];
    const merged = (0, mergeTokens_1.mergeTokenLists)([a, b]);
    const m = merged.find(x => x.token_address.toLowerCase() === "n");
    assert_1.default.strictEqual(m?.token_name, "NameA");
    assert_1.default.strictEqual(m?.token_ticker, "TICK");
});
/**
 * Summary and exit code
 */
console.log("");
console.log(`Tests passed: ${passed}, Tests failed: ${failed}`);
if (failed > 0) {
    console.error("Some tests failed");
    process.exit(2);
}
else {
    console.log("All tests passed ✅");
    process.exit(0);
}
