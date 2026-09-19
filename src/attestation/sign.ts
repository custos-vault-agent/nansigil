import { type Address, encodeAbiParameters, type Hex, keccak256 } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";

/** Plaintext behind one attestation: exactly the tuple NanSigil hashes. */
export type Attestation = {
  wallet: Address;
  label: string;
  pnl: bigint;
  winRate: number;
  timestamp: number;
};

/** Mirrors NanSigil: keccak256(abi.encode(wallet, label, pnl, winRate, timestamp)). */
export function attestHash(a: Attestation): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "string" }, { type: "int256" }, { type: "uint16" }, { type: "uint64" }],
      [a.wallet, a.label, a.pnl, a.winRate, BigInt(a.timestamp)],
    ),
  );
}

/** EIP-191 personal_sign over the hash, what `ECDSA.recover(toEthSignedMessageHash(hash))` expects. */
export function signAttestation(account: PrivateKeyAccount, hash: Hex): Promise<Hex> {
  return account.signMessage({ message: { raw: hash } });
}
