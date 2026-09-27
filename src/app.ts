import { Elysia } from "elysia";
import { privateKeyToAccount } from "viem/accounts";
import { createAttestationService } from "./attestation/service";
import type { Config } from "./config";
import { HttpNansenClient, type NansenClient } from "./nansen/client";
import { FixtureNansenClient, fixtureFirst } from "./nansen/fixture";
import { cachedProfiler } from "./nansen/profile";
import { attestationRoutes } from "./routes/attestation";

// Composition root: config → clients → service → routes. index.ts only listens.
export async function buildApp(cfg: Config) {
  const account = privateKeyToAccount(cfg.attestorPrivateKey);
  // A wallet in the fixture is answered from the fixture, anything else from
  // Nansen. With no key the service is fixture-only, with no fixture file it is
  // Nansen-only.
  const live = cfg.nansenApiKey ? new HttpNansenClient(cfg.nansenApiKey, cfg.pnlWindowDays) : null;
  const fixture = live
    ? await FixtureNansenClient.fromFileIfPresent(cfg.nansenFixture)
    : await FixtureNansenClient.fromFile(cfg.nansenFixture);
  let nansen: NansenClient;
  let source: string;
  if (live && fixture) [nansen, source] = [fixtureFirst(fixture, live), "fixture+http"];
  else if (live) [nansen, source] = [live, "http"];
  else if (fixture) [nansen, source] = [fixture, "fixture"];
  else throw new Error("no data source: set NANSEN_API_KEY or NANSEN_FIXTURE");
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
    .get("/health", () => ({ ok: true, attestor: account.address, nansen: source }))
    .use(attestationRoutes(service));
}
