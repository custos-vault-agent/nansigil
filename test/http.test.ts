import { describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";
import type { SignedAttestationJson } from "../src/attestation/service";
import { loadConfig } from "../src/config";

const app = await buildApp(
  loadConfig({
    ATTESTOR_PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    NANSEN_FIXTURE: "fixtures/nansen.json",
  }),
);

describe("GET /attestation/:wallet", () => {
  test("returns a signed payload for a fixture wallet", async () => {
    const res = await app.handle(new Request("http://localhost/attestation/0x70997970C51812dc3A010C7d01b50e0d17dc79C8"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as SignedAttestationJson;
    expect(body.label).toBe("Smart Trader");
    expect(body.pnl).toBe("42000");
    expect(body.winRate).toBe(61);
    expect(body.signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(body.attestor).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });
  test("rejects a malformed address", async () => {
    const res = await app.handle(new Request("http://localhost/attestation/not-an-address"));
    expect(res.status).toBe(400);
  });
  test("health reports the attestor and data source", async () => {
    const body = await (await app.handle(new Request("http://localhost/health"))).json();
    expect(body).toEqual({ ok: true, attestor: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", nansen: "fixture" });
  });
});
