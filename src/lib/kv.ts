/**
 * Key-value storage every server instance sees (docs/spec/09-quality.md, Deployment, Shared state): Upstash Redis over
 * its REST API (fetch, no package) when KV_REST_API_URL and KV_REST_API_TOKEN are set (the Vercel Upstash integration
 * adds them; UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN work too), else this process's memory (development,
 * tests, one EC2 server). Holds the confirm-card proposals, used one-time OAuth ids and, with Redis, the shared state.
 */
export interface Kv {
  get(key: string): Promise<string | null>;
  /** Several keys in one atomic read. */
  mget(keys: string[]): Promise<Array<string | null>>;
  /** Several keys in one atomic write, without expiry. */
  mset(values: Record<string, string>): Promise<void>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  /** Sets the key only when it doesn't exist yet; true when it was set. */
  setNew(key: string, value: string, ttlMs: number): Promise<boolean>;
  /** Reads and deletes the key in one step (single use). */
  take(key: string): Promise<string | null>;
  /** Deletes the key only while it still holds this value (a lock released by its owner). */
  release(key: string, value: string): Promise<void>;
}

const restUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const restToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

/** True when Redis is configured, so several server instances share one state. */
export const kvShared = (): boolean => !!(restUrl() && restToken());

/** One Redis command over Upstash's REST API, e.g. command('SET', 'k', 'v', 'NX', 'PX', 5000). */
async function command<T>(...args: Array<string | number>): Promise<T> {
  const res = await fetch(restUrl() as string, {
    method: 'POST',
    headers: { authorization: `Bearer ${restToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok || data.error) throw new Error(`Redis ${args[0]} failed (${res.status}): ${data.error ?? 'no answer'}`);
  return data.result as T;
}

const RELEASE = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0";

const redisKv: Kv = {
  get: (key) => command<string | null>('GET', key),
  mget: (keys) => command<Array<string | null>>('MGET', ...keys),
  mset: async (values) => void (await command('MSET', ...Object.entries(values).flat())),
  set: async (key, value, ttlMs) => void (await command('SET', key, value, 'PX', ttlMs)),
  setNew: async (key, value, ttlMs) => (await command<string | null>('SET', key, value, 'NX', 'PX', ttlMs)) === 'OK',
  take: (key) => command<string | null>('GETDEL', key),
  release: async (key, value) => void (await command('EVAL', RELEASE, 1, key, value)),
};

/** The same operations in one process's memory, with expiry. */
export function memoryKv(clock: () => number = Date.now): Kv {
  const items = new Map<string, { value: string; until: number }>();
  const read = (key: string) => {
    const item = items.get(key);
    if (item && item.until <= clock()) items.delete(key);
    return items.get(key)?.value ?? null;
  };
  return {
    get: async (key) => read(key),
    mget: async (keys) => keys.map(read),
    mset: async (values) => Object.entries(values).forEach(([k, v]) => items.set(k, { value: v, until: Infinity })),
    set: async (key, value, ttlMs) => void items.set(key, { value, until: clock() + ttlMs }),
    setNew: async (key, value, ttlMs) => {
      if (read(key) !== null) return false;
      items.set(key, { value, until: clock() + ttlMs });
      return true;
    },
    take: async (key) => {
      const value = read(key);
      items.delete(key);
      return value;
    },
    release: async (key, value) => void (read(key) === value && items.delete(key)),
  };
}

/** Kept on globalThis, so there is one per process: Next.js loads this file once for the API routes and once for the pages. */
const proc = globalThis as typeof globalThis & { rephKv?: Kv };

/** Redis when configured, else this process's memory. */
export const kv = (): Kv => (kvShared() ? redisKv : (proc.rephKv ??= memoryKv()));

/** Key names, all under one prefix. */
export const kvKey = (...parts: string[]) => ['reph', ...parts].join(':');

/** JSON that keeps dates: a Date is written as { "$date": "<ISO>" } and read back as a Date. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, key, v) {
    const raw = this[key];
    return raw instanceof Date ? { $date: raw.toISOString() } : v;
  });
}

export function fromJson<T>(json: string): T {
  return JSON.parse(json, (_key, v) => (v && typeof v === 'object' && typeof v.$date === 'string' && Object.keys(v).length === 1 ? new Date(v.$date) : v)) as T;
}
