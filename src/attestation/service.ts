import type { Address, Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import type { CreatorProfile } from "../nansen/profile";
import { type Attestation, attestHash, signAttestation } from "./sign";

/** What a client needs to call NansenModule.submitAttestation(agentId, ...). */
export type SignedAttestation = Attestation & {
  hash: Hex;
  signature: Hex;
  attestor: Address;
};

/** The HTTP shape: bigint pnl travels as a decimal string. */
export type SignedAttestationJson = Omit<SignedAttestation, "pnl"> & { pnl: string };

export function toJson(a: SignedAttestation): SignedAttestationJson {
  return { ...a, pnl: a.pnl.toString() };
}

export type AttestationService = {
  /** Fresh signed payload for `wallet`: Nansen profile → hash → sign. */
  attest(wallet: Address): Promise<SignedAttestation>;
};

export function createAttestationService(
  account: PrivateKeyAccount,
  profile: (wallet: Address) => Promise<CreatorProfile>,
  now: () => number = () => Math.floor(Date.now() / 1000),
): AttestationService {
  return {
    async attest(wallet) {
      // A new timestamp per request: NansenModule only accepts payloads newer
      // than the one it has, so each pull can supersede the last.
      const attestation: Attestation = { wallet, ...(await profile(wallet)), timestamp: now() };
      const hash = attestHash(attestation);
      return { ...attestation, hash, signature: await signAttestation(account, hash), attestor: account.address };
    },
  };
}
