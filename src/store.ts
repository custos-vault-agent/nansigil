import { RedisClient } from "bun";

// Two things the service needs to keep outside a request: a cached Nansen profile
// and a request counter per window. Redis shares both between instances and keeps
// them over a restart. Memory is the fallback, and it is enough for one instance.

export type Store = {
  /** What /health reports, including whether Redis is reachable right now. */
  describe(): string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Counter after this hit, plus the seconds until the window resets. */
  hit(key: string, windowSeconds: number): Promise<{ count: number; resetIn: number }>;
};

export function memoryStore(): Store {
  const values = new Map<string, { value: string; expiresAt: number }>();
  const counters = new Map<string, { count: number; expiresAt: number }>();
  return {
    describe: () => "memory",
    async get(key) {
      const entry = values.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        values.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, ttlSeconds) {
      values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async hit(key, windowSeconds) {
      const now = Date.now();
      const entry = counters.get(key);
      if (!entry || entry.expiresAt <= now) {
        const fresh = { count: 1, expiresAt: now + windowSeconds * 1000 };
        counters.set(key, fresh);
        return { count: 1, resetIn: windowSeconds };
      }
      entry.count += 1;
      return { count: entry.count, resetIn: Math.ceil((entry.expiresAt - now) / 1000) };
    },
  };
}

/** Redis first, memory when a command fails. A cache that is briefly unreachable
 *  must not take the service down; it only costs Nansen credits. */
export function redisStore(url: string, fallback: Store = memoryStore()): Store {
  // enableOfflineQueue must be off: with the default, a command issued while the
  // server is unreachable is queued instead of failing, and the request hangs
  // rather than falling back. autoReconnect still brings the client back.
  const client = new RedisClient(url, {
    connectionTimeout: 1_000,
    enableOfflineQueue: false,
  });
  client.onclose = (err) => console.warn("redis disconnected:", err.message);

  // Bun connects lazily on the first command, and with the offline queue off that
  // command would fail. Start the connection here, and let a command wait a short
  // moment for it. Waiting for the whole connect attempt would stall the first
  // request for seconds while the server is down.
  // One line at startup, because a wrong password and an unreachable server look
  // the same from a failed command: both end up on the fallback store.
  const ready = client
    .connect()
    .then(() => console.log("redis connected"))
    .catch((err: Error) => console.warn("redis connect failed:", err.message));
  const CONNECT_WAIT_MS = 200;
  const COOLDOWN_MS = 5_000;
  let downUntil = 0;

  async function guard<T>(command: () => Promise<T>, onError: () => Promise<T>): Promise<T> {
    // After a failure, skip Redis for a moment. Without this every request pays
    // the connect timeout for as long as the server is down.
    if (Date.now() < downUntil) return onError();
    try {
      if (!client.connected) await Promise.race([ready, Bun.sleep(CONNECT_WAIT_MS)]);
      return await command();
    } catch (err) {
      downUntil = Date.now() + COOLDOWN_MS;
      console.warn("redis command failed, using memory for now:", (err as Error).message);
      return onError();
    }
  }

  return {
    describe: () => (client.connected ? "redis" : "redis (unreachable, using memory)"),
    get: (key) => guard(() => client.get(key), () => fallback.get(key)),
    set: (key, value, ttlSeconds) =>
      guard(
        async () => {
          await client.set(key, value, "EX", ttlSeconds);
        },
        () => fallback.set(key, value, ttlSeconds),
      ),
    hit: (key, windowSeconds) =>
      guard(
        async () => {
          const count = await client.incr(key);
          // The first hit of a window owns the expiry, so the window is fixed
          // and a burst cannot keep pushing the reset away.
          if (count === 1) {
            await client.expire(key, windowSeconds);
            return { count, resetIn: windowSeconds };
          }
          const ttl = await client.ttl(key);
          return { count, resetIn: ttl > 0 ? ttl : windowSeconds };
        },
        () => fallback.hit(key, windowSeconds),
      ),
  };
}
