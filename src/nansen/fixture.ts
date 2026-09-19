import type { Address } from "viem";
import type { NansenClient, NansenLabel, PnlSummary } from "./client";

// Stand-in for HttpNansenClient when no API key is set (anvil, demos, tests).
// Keyed by lowercased wallet; unknown wallets get no labels and no PnL.
export type Fixture = Record<string, { labels: NansenLabel[]; pnl: PnlSummary | null }>;

export class FixtureNansenClient implements NansenClient {
  constructor(private readonly data: Fixture) {}

  static async fromFile(path: string): Promise<FixtureNansenClient> {
    return new FixtureNansenClient((await Bun.file(path).json()) as Fixture);
  }

  async labels(address: Address): Promise<NansenLabel[]> {
    return this.data[address.toLowerCase()]?.labels ?? [];
  }

  async pnlSummary(address: Address): Promise<PnlSummary | null> {
    return this.data[address.toLowerCase()]?.pnl ?? null;
  }
}
