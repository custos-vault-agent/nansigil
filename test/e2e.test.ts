// Pull model end to end against anvil: fetch a payload from the HTTP service,
// relay it from a wallet that is NOT the attestor, and have NansenModule
// verify it. Skipped unless E2E_RPC_URL is set (see README).
import { describe, expect, test } from "bun:test";
import { createPublicClient, createWalletClient, type Hex, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildApp } from "../src/app";
import type { SignedAttestationJson } from "../src/attestation/service";
import { loadConfig } from "../src/config";

const rpc = process.env.E2E_RPC_URL;
const deploymentFile = process.env.E2E_DEPLOYMENT_FILE ?? "../custos-contract/deployments/anvil.json";

const nansenAbi = parseAbi([
  "function submitAttestation(bytes32 agentId, address wallet, string label, int256 pnl, uint16 winRate, uint64 timestamp, bytes signature)",
  "function verifyAttestation(bytes32 agentId, address wallet, string label, int256 pnl, uint16 winRate, uint64 timestamp) view returns (bool valid, address signer)",
]);
const coreAbi = parseAbi([
  "struct AgentRecord { bytes32 name; address wallet; uint8 status; address creator; address vault; bytes32 descriptionHash; uint16 feeRate; bool isPublic; uint64 registeredAt; }",
  "function getAgent(bytes32 id) view returns (AgentRecord)",
]);

describe.skipIf(!rpc)("e2e: pulled payload relayed by a third party", () => {
  test("NansenModule accepts and verifies it", async () => {
    const d = (await Bun.file(deploymentFile).json()) as { custosProxy: Hex; nansenModule: Hex; agentIds: Hex[] };
    const app = await buildApp(loadConfig({ ATTESTOR_PRIVATE_KEY: process.env.E2E_ATTESTOR_KEY, NANSEN_FIXTURE: "fixtures/nansen.json" }));
    const transport = http(rpc);
    const publicClient = createPublicClient({ transport });
    const relayer = privateKeyToAccount(process.env.E2E_RELAYER_KEY as Hex);
    const agentId = d.agentIds[0]!;

    const record = await publicClient.readContract({ address: d.custosProxy, abi: coreAbi, functionName: "getAgent", args: [agentId] });
    const payload = (await (await app.handle(new Request(`http://localhost/attestation/${record.creator}`))).json()) as SignedAttestationJson;
    expect(payload.attestor).not.toBe(relayer.address);

    const wallet = createWalletClient({ account: relayer, transport });
    const args = [agentId, payload.wallet, payload.label, BigInt(payload.pnl), payload.winRate, BigInt(payload.timestamp)] as const;
    const hash = await wallet.writeContract({
      chain: null,
      address: d.nansenModule,
      abi: nansenAbi,
      functionName: "submitAttestation",
      args: [...args, payload.signature],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const [valid, signer] = await publicClient.readContract({ address: d.nansenModule, abi: nansenAbi, functionName: "verifyAttestation", args });
    expect(valid).toBe(true);
    expect(signer).toBe(payload.attestor);
  });
});
