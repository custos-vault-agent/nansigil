import { afterEach, describe, expect, test } from "bun:test";
import { HttpNansenClient } from "../src/nansen/client";

const WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Captures the request bodies and answers each path with a canned payload. */
function stub(byPath: Record<string, unknown>) {
  const seen: { path: string; body: any }[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    seen.push({ path, body: JSON.parse(String(init?.body)) });
    const key = Object.keys(byPath).find((k) => path.endsWith(k));
    return new Response(JSON.stringify(key ? byPath[key] : {}), { status: 200 });
  }) as typeof fetch;
  return seen;
}

describe("HttpNansenClient.pnlSummary", () => {
  test("sends the mandatory date range", async () => {
    const seen = stub({ "/pnl-summary": { realized_pnl_usd: 1 } });
    await new HttpNansenClient("key", 30).pnlSummary(WALLET, "all");
    const date = seen[0]!.body.date;
    expect(date.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(date.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days = (Date.parse(date.to) - Date.parse(date.from)) / 86_400_000;
    expect(days).toBe(30);
  });

  test("reads the payload wrapped, unwrapped, or in an array", async () => {
    const row = { realized_pnl_usd: 42000, win_rate: 61 };
    for (const body of [row, { data: row }, { data: [row] }]) {
      stub({ "/pnl-summary": body });
      const out = await new HttpNansenClient("key").pnlSummary(WALLET, "all");
      expect(out?.realized_pnl_usd).toBe(42000);
      expect(out?.win_rate).toBe(61);
    }
  });

  test("coerces numeric strings, so nothing becomes NaN downstream", async () => {
    stub({ "/pnl-summary": { data: { realized_pnl_usd: "1234.5", win_rate: "58" } } });
    const out = await new HttpNansenClient("key").pnlSummary(WALLET, "all");
    expect(out?.realized_pnl_usd).toBe(1234.5);
    expect(out?.win_rate).toBe(58);
    expect(out?.traded_times).toBe(0);
  });

  test("returns null for a response with none of the expected fields", async () => {
    stub({ "/pnl-summary": { data: [] } });
    expect(await new HttpNansenClient("key").pnlSummary(WALLET, "all")).toBeNull();
  });
});
