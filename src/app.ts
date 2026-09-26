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
    ? new HttpNansenClient(cfg.nansenApiKey, cfg.pnlWindowDays)
    : await FixtureNansenClient.fromFile(cfg.nansenFixture);
  const service = createAttestationService(account, cachedProfiler(nansen, cfg.nansenChain, cfg.profileTtlMs));

  // The Custos frontend calls this service from the browser, so every answer
  // needs CORS headers. A payload is public and signed, so "*" is the default;
  // set CORS_ORIGIN to pin it to one site.
  return new Elysia()
    .onRequest(({ set }) => {
      set.headers["access-control-allow-origin"] = cfg.corsOrigin;
      if (cfg.corsOrigin !== "*") set.headers.vary = "Origin";
    })
    // A bare GET needs no preflight, but a client that adds a header sends one.
    .options("/*", ({ set }) => {
      set.headers["access-control-allow-methods"] = "GET, OPTIONS";
      set.headers["access-control-allow-headers"] = "content-type";
      return new Response(null, { status: 204 });
    })
    .get("/health", () => ({ ok: true, attestor: account.address, nansen: cfg.nansenApiKey ? "http" : "fixture" }))
    .use(attestationRoutes(service));
}
