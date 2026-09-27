import { describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryStore, redisStore } from "../src/store";

const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("memoryStore", () => {
  test("returns a value inside the TTL and nothing after it", async () => {
    const store = memoryStore();
    await store.set("k", "v", 1);
    expect(await store.get("k")).toBe("v");
    await store.set("short", "v", 0.001);
    await Bun.sleep(10);
    expect(await store.get("short")).toBeNull();
  });

  test("counts hits in a fixed window", async () => {
    const store = memoryStore();
    expect(await store.hit("c", 60)).toEqual({ count: 1, resetIn: 60 });
    const second = await store.hit("c", 60);
    expect(second.count).toBe(2);
    expect(second.resetIn).toBeLessThanOrEqual(60);
    expect((await store.hit("other", 60)).count).toBe(1);
  });
});

describe("redisStore with an unreachable server", () => {
  // Port 1 refuses every connection, which is what a Redis outage looks like.
  const store = redisStore("redis://127.0.0.1:1", memoryStore());

  test("falls back to the fallback store instead of throwing", async () => {
    await store.set("k", "v", 60);
    expect(await store.get("k")).toBe("v");
    expect((await store.hit("c", 60)).count).toBe(1);
    expect((await store.hit("c", 60)).count).toBe(2);
  });
});

describe("rate limit on /attestation", () => {
  const app = async (limit: number) =>
    buildApp(
      loadConfig({
        ATTESTOR_PRIVATE_KEY: KEY,
        NANSEN_FIXTURE: "fixtures/nansen.json",
        RATE_LIMIT: String(limit),
        RATE_LIMIT_WINDOW_S: "60",
      }),
    );

  test("answers 429 with Retry-After once the limit is passed", async () => {
    const server = await app(2);
    const call = () => server.handle(new Request(`http://localhost/attestation/${WALLET}`));
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const blocked = await call();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  test("leaves /health alone, so a load balancer keeps probing", async () => {
    const server = await app(1);
    await server.handle(new Request(`http://localhost/attestation/${WALLET}`));
    await server.handle(new Request(`http://localhost/attestation/${WALLET}`));
    const health = await server.handle(new Request("http://localhost/health"));
    expect(health.status).toBe(200);
    const body = (await health.json()) as { store: string; rateLimit: string };
    expect(body.store).toBe("memory");
    expect(body.rateLimit).toBe("1/60s");
  });
});
