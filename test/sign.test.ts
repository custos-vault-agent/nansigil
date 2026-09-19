import { describe, expect, test } from "bun:test";
import { recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createAttestationService } from "../src/attestation/service";
import { attestHash, signAttestation } from "../src/attestation/sign";

const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(KEY);

describe("attestHash", () => {
  test("is deterministic and sensitive to every field", () => {
    const base = { wallet: account.address, label: "Smart Trader", pnl: 42_000n, winRate: 61, timestamp: 1789733637 };
    expect(attestHash(base)).toBe(attestHash({ ...base }));
    for (const patch of [{ pnl: -42_000n }, { label: "Fund" }, { winRate: 62 }, { timestamp: 1789733638 }]) {
      expect(attestHash({ ...base, ...patch })).not.toBe(attestHash(base));
    }
  });
  test("signature recovers to the attestor", async () => {
    const hash = attestHash({ wallet: account.address, label: "Fund", pnl: 1n, winRate: 50, timestamp: 1 });
    const sig = await signAttestation(account, hash);
    expect(await recoverMessageAddress({ message: { raw: hash }, signature: sig })).toBe(account.address);
  });
});

describe("createAttestationService", () => {
  test("stamps the current time so each pull can supersede the last", async () => {
    let t = 100;
    const service = createAttestationService(account, async () => ({ label: "Fund", pnl: 5n, winRate: 55 }), () => t++);
    const first = await service.attest(account.address);
    const second = await service.attest(account.address);
    expect(first.timestamp).toBe(100);
    expect(second.timestamp).toBe(101);
    expect(first.hash).not.toBe(second.hash);
    expect(first.attestor).toBe(account.address);
  });
});
