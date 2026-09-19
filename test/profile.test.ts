import { describe, expect, test } from "bun:test";
import { FixtureNansenClient } from "../src/nansen/fixture";
import { cachedProfiler, pickLabel, profileCreator } from "../src/nansen/profile";

const WALLET = "0x00000000000000000000000000000000000000aa";

describe("pickLabel", () => {
  test("priority order wins over list order", () => {
    expect(pickLabel([{ label: "Smart Trader" }, { label: "Fund" }])).toBe("Fund");
  });
  test("falls back to any smart_money label, then empty", () => {
    expect(pickLabel([{ label: "Token Millionaire", category: "smart_money" }])).toBe("Token Millionaire");
    expect(pickLabel([{ label: "Binance Deposit", category: "cefi" }])).toBe("");
    expect(pickLabel([])).toBe("");
  });
});

describe("profileCreator", () => {
  test("maps fixture data to the hash fields, clamping winRate", async () => {
    const nansen = new FixtureNansenClient({
      [WALLET]: {
        labels: [{ label: "Fund" }],
        pnl: { realized_pnl_usd: -1234.9, realized_pnl_percent: -3, win_rate: 140, traded_times: 1, traded_token_count: 1 },
      },
    });
    expect(await profileCreator(nansen, WALLET, "all")).toEqual({ label: "Fund", pnl: -1234n, winRate: 100 });
  });
  test("unknown wallet gets an empty label and zero PnL", async () => {
    expect(await profileCreator(new FixtureNansenClient({}), WALLET, "all")).toEqual({ label: "", pnl: 0n, winRate: 0 });
  });
});

describe("cachedProfiler", () => {
  test("queries Nansen once per wallet within the TTL", async () => {
    let calls = 0;
    const nansen = {
      async labels() {
        calls++;
        return [];
      },
      async pnlSummary() {
        return null;
      },
    };
    const profile = cachedProfiler(nansen, "all", 60_000);
    await profile(WALLET);
    await profile(WALLET);
    await profile("0x00000000000000000000000000000000000000AA"); // same wallet, different case
    expect(calls).toBe(1);
  });
});
