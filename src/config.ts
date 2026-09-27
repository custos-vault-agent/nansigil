import type { Hex } from "viem";

// Bun loads .env itself. Read once, fail at startup on anything missing.
function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

export type Config = {
  port: number;
  attestorPrivateKey: Hex;
  /** Empty = FixtureNansenClient (local/demo). */
  nansenApiKey: string;
  nansenFixture: string;
  /** Nansen chain slug for Profiler queries. */
  nansenChain: string;
  /** How long a wallet's Nansen profile is reused before re-querying (credits). */
  profileTtlMs: number;
  /** Length of the PnL window that the Profiler query asks for, in days. */
  pnlWindowDays: number;
  /** Value of Access-Control-Allow-Origin. The browser calls this service directly. */
  corsOrigin: string;
  /** Redis or Valkey URL for the shared cache and the rate limiter. Empty = memory. */
  redisUrl: string;
  /** Attestation requests allowed per client per window. */
  rateLimit: number;
  rateLimitWindowSeconds: number;
  /** Read the client address from X-Forwarded-For. Only behind a proxy you control. */
  trustProxy: boolean;
};

export function loadConfig(env = process.env): Config {
  return {
    port: Number(env.PORT ?? "3001"),
    attestorPrivateKey: required(env, "ATTESTOR_PRIVATE_KEY") as Hex,
    nansenApiKey: env.NANSEN_API_KEY ?? "",
    nansenFixture: env.NANSEN_FIXTURE ?? "fixtures/nansen.json",
    nansenChain: env.NANSEN_CHAIN ?? "all",
    profileTtlMs: Number(env.PROFILE_TTL_MS ?? String(10 * 60 * 1000)),
    pnlWindowDays: Number(env.PNL_WINDOW_DAYS ?? "365"),
    corsOrigin: env.CORS_ORIGIN ?? "*",
    redisUrl: env.REDIS_URL ?? "",
    rateLimit: Number(env.RATE_LIMIT ?? "30"),
    rateLimitWindowSeconds: Number(env.RATE_LIMIT_WINDOW_S ?? "60"),
    trustProxy: env.TRUST_PROXY === "true",
  };
}
