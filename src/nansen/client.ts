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

export interface NansenClient {
  labels(address: Address, chain: string): Promise<NansenLabel[]>;
  pnlSummary(address: Address, chain: string): Promise<PnlSummary | null>;
}

const BASE = "https://api.nansen.ai/api/v1/profiler/address";

export class HttpNansenClient implements NansenClient {
  constructor(private readonly apiKey: string) {}

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
    return this.post<PnlSummary>("/pnl-summary", { address, chain });
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
