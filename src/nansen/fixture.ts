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

  /** Null when the file is absent, so a live-only deployment needs no fixture. */
  static async fromFileIfPresent(path: string): Promise<FixtureNansenClient | null> {
    return (await Bun.file(path).exists()) ? FixtureNansenClient.fromFile(path) : null;
  }

  /** Whether the fixture holds this wallet. This is what the routing looks at. */
  has(address: Address): boolean {
    return this.data[address.toLowerCase()] !== undefined;
  }

  async labels(address: Address): Promise<NansenLabel[]> {
    return this.data[address.toLowerCase()]?.labels ?? [];
  }

  async pnlSummary(address: Address): Promise<PnlSummary | null> {
    return this.data[address.toLowerCase()]?.pnl ?? null;
  }
}

/** Routes per wallet: a wallet the fixture holds never reaches Nansen, every
 *  other wallet does. Demo wallets keep stable numbers, real ones stay live,
 *  and both work with one API key. */
export function fixtureFirst(fixture: FixtureNansenClient, live: NansenClient): NansenClient {
  return {
    labels: (address, chain) =>
      fixture.has(address) ? fixture.labels(address) : live.labels(address, chain),
    pnlSummary: (address, chain) =>
      fixture.has(address) ? fixture.pnlSummary(address) : live.pnlSummary(address, chain),
  };
}
