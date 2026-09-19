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
};

export function loadConfig(env = process.env): Config {
  return {
    port: Number(env.PORT ?? "3001"),
    attestorPrivateKey: required(env, "ATTESTOR_PRIVATE_KEY") as Hex,
    nansenApiKey: env.NANSEN_API_KEY ?? "",
    nansenFixture: env.NANSEN_FIXTURE ?? "fixtures/nansen.json",
    nansenChain: env.NANSEN_CHAIN ?? "all",
    profileTtlMs: Number(env.PROFILE_TTL_MS ?? String(10 * 60 * 1000)),
  };
}
