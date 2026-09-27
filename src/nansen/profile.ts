import type { Address } from "viem";
import type { Store } from "../store";
import type { NansenClient, NansenLabel } from "./client";

/** The three Nansen-derived fields that go into the attestation hash. */
export type CreatorProfile = {
  label: string;
  /** Realized PnL in whole USD. */
  pnl: bigint;
  /** 0..100 */
  winRate: number;
};

// Which label represents the creator when Nansen returns several. This order
// is the badge policy; change it here and nowhere else.
const LABEL_PRIORITY = ["Fund", "Smart Trader", "Whale"];

export function pickLabel(labels: NansenLabel[]): string {
  for (const wanted of LABEL_PRIORITY) {
    const hit = labels.find((l) => l.label.toLowerCase() === wanted.toLowerCase());
    if (hit) return wanted;
  }
  return labels.find((l) => l.category === "smart_money")?.label ?? "";
}

export async function profileCreator(nansen: NansenClient, wallet: Address, chain: string): Promise<CreatorProfile> {
  const [labels, pnl] = await Promise.all([nansen.labels(wallet, chain), nansen.pnlSummary(wallet, chain)]);
  return {
    label: pickLabel(labels),
    pnl: BigInt(Math.trunc(pnl?.realized_pnl_usd ?? 0)),
    winRate: Math.max(0, Math.min(100, Math.round(pnl?.win_rate ?? 0))),
  };
}

/** Serves a profile from the store and only calls Nansen on a miss. Concurrent
 *  calls for one wallet share a single request, and a failure is never cached. */
export function cachedProfiler(nansen: NansenClient, chain: string, ttlMs: number, store: Store) {
  const inFlight = new Map<string, Promise<CreatorProfile>>();

  return (wallet: Address): Promise<CreatorProfile> => {
    const key = `profile:${chain}:${wallet.toLowerCase()}`;
    const running = inFlight.get(key);
    if (running) return running;

    const load = (async () => {
      const cached = await store.get(key);
      if (cached) return decode(cached);
      const profile = await profileCreator(nansen, wallet, chain);
      await store.set(key, encode(profile), Math.max(1, Math.ceil(ttlMs / 1000)));
      return profile;
    })();
    inFlight.set(key, load);
    return load.finally(() => inFlight.delete(key));
  };
}

/** `pnl` is a bigint, so it travels as a decimal string here too. */
function encode(p: CreatorProfile): string {
  return JSON.stringify({ label: p.label, pnl: p.pnl.toString(), winRate: p.winRate });
}

function decode(raw: string): CreatorProfile {
  const { label, pnl, winRate } = JSON.parse(raw) as { label: string; pnl: string; winRate: number };
  return { label, pnl: BigInt(pnl), winRate };
}
