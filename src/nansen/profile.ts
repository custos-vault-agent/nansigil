import type { Address } from "viem";
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

/** Memoizes profileCreator per wallet for `ttlMs`, so repeated pulls for the
 *  same creator do not each spend Nansen credits. */
export function cachedProfiler(nansen: NansenClient, chain: string, ttlMs: number) {
  const cache = new Map<string, { at: number; value: Promise<CreatorProfile> }>();
  return (wallet: Address): Promise<CreatorProfile> => {
    const key = wallet.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = profileCreator(nansen, wallet, chain).catch((err) => {
      cache.delete(key); // do not cache failures
      throw err;
    });
    cache.set(key, { at: Date.now(), value });
    return value;
  };
}
