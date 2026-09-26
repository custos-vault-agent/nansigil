import type { Address } from "viem";

// Nansen Profiler, the two calls the attestor needs. Shapes from
// docs.nansen.ai/api/profiler (address-labels, address-pnl-and-trade-performance).

export type NansenLabel = {
  label: string;
  category?: "smart_money" | "behavioral" | "defi" | "social" | "cefi" | "nft" | "others";
  kind?: string[];
};

export type PnlSummary = {
  realized_pnl_usd: number;
  realized_pnl_percent: number;
  win_rate: number;
  traded_times: number;
  traded_token_count: number;
};

/** YYYY-MM-DD, the only date format the API accepts. */
function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const KEYS = ["realized_pnl_usd", "realized_pnl_percent", "win_rate", "traded_times", "traded_token_count"] as const;

/** The endpoint answers with the object, with `{data: obj}`, or with `{data: [obj]}`.
 *  Numbers are coerced, because a numeric string here would become NaN downstream. */
function toPnlSummary(res: unknown): PnlSummary | null {
  const data = (res as { data?: unknown })?.data ?? res;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row || !KEYS.some((k) => row[k] !== undefined)) return null;
  return {
    realized_pnl_usd: num(row.realized_pnl_usd),
    realized_pnl_percent: num(row.realized_pnl_percent),
    win_rate: num(row.win_rate),
    traded_times: num(row.traded_times),
    traded_token_count: num(row.traded_token_count),
  };
}

export interface NansenClient {
  labels(address: Address, chain: string): Promise<NansenLabel[]>;
  pnlSummary(address: Address, chain: string): Promise<PnlSummary | null>;
}

const BASE = "https://api.nansen.ai/api/v1/profiler/address";

export class HttpNansenClient implements NansenClient {
  constructor(
    private readonly apiKey: string,
    /** How far back the PnL window reaches. The API requires an explicit range. */
    private readonly windowDays = 365,
  ) {}

  async labels(address: Address, chain: string): Promise<NansenLabel[]> {
    // Premium labels (Smart Money) first; that endpoint is plan-gated, so a 4xx
    // there means "none" and we fall through to the public label set.
    const premium = await this.post<{ data?: NansenLabel[] }>("/premium-labels", { address, chain }, true);
    const plain = await this.post<{ data?: NansenLabel[] }>("/labels", {
      address,
      chain,
      pagination: { page: 1, per_page: 100 },
    });
    return [...(premium?.data ?? []), ...(plain?.data ?? [])];
  }

  async pnlSummary(address: Address, chain: string): Promise<PnlSummary | null> {
    const to = new Date();
    const from = new Date(to.getTime() - this.windowDays * 86_400_000);
    // `date` is mandatory: without it the API answers 422 missing_field.
    const res = await this.post<unknown>("/pnl-summary", {
      address,
      chain,
      date: { from: day(from), to: day(to) },
    });
    return toPnlSummary(res);
  }

  private async post<T>(path: string, body: unknown, tolerate4xx = false): Promise<T | null> {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: this.apiKey },
      body: JSON.stringify(body),
    });
    if (res.status === 404 || (tolerate4xx && res.status >= 400 && res.status < 500)) return null;
    if (!res.ok) throw new Error(`nansen ${path} ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }
}
