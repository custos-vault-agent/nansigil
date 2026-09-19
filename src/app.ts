import { Elysia } from "elysia";
import { privateKeyToAccount } from "viem/accounts";
import { createAttestationService } from "./attestation/service";
import type { Config } from "./config";
import { HttpNansenClient, type NansenClient } from "./nansen/client";
import { FixtureNansenClient } from "./nansen/fixture";
import { cachedProfiler } from "./nansen/profile";
import { attestationRoutes } from "./routes/attestation";

// Composition root: config → clients → service → routes. index.ts only listens.
export async function buildApp(cfg: Config) {
  const account = privateKeyToAccount(cfg.attestorPrivateKey);
  const nansen: NansenClient = cfg.nansenApiKey
    ? new HttpNansenClient(cfg.nansenApiKey)
    : await FixtureNansenClient.fromFile(cfg.nansenFixture);
  const service = createAttestationService(account, cachedProfiler(nansen, cfg.nansenChain, cfg.profileTtlMs));

  return new Elysia()
    .get("/health", () => ({ ok: true, attestor: account.address, nansen: cfg.nansenApiKey ? "http" : "fixture" }))
    .use(attestationRoutes(service));
}
