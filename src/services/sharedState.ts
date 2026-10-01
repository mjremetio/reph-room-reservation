/**
 * One state for every server instance (docs/spec/09-quality.md, Deployment, Shared state). Vercel runs the API routes
 * in separate functions, each with its own memory, and recycles them: without this, a booking made in one is missing
 * from My bookings or Admin in another, and a role change only reaches some of them. With Redis configured
 * (src/lib/kv.ts), everything that reads or writes the mock reservations or the app's store runs inside `withShared`:
 *   1. pull: when Redis holds a newer version of the state (rooms, bookings, accounts, audit log, messages), load it;
 *   2. run;
 *   3. push: when the run changed the state, save it as the next version.
 * A write holds a lock from before the pull until after the push, so writes never interleave (the routes' POST, PATCH
 * and DELETE through `shared` in src/app/api/_shared.ts, and `sharedWrite` for a tool that writes, like check_in).
 * A read that changes something takes the lock only to push, and drops its change if another instance wrote in
 * between. Without Redis (development, tests, one EC2 server) the memory is the state and this only runs the work.
 * Proposals and used one-time OAuth ids have their own keys (src/agent/proposals.ts, src/lib/tokens.ts).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { getGateway } from '../gateway';
import { MockGateway, type MockSnapshot } from '../gateway/mockGateway';
import { fromJson, kv, kvKey, kvShared, toJson, type Kv } from '../lib/kv';
import { getStore } from '../store';
import { MemoryStore, type StoreSnapshot } from '../store/memoryStore';

/**
 * Bump when the snapshot's shape or the seed accounts change: a saved state in an older format is replaced by this
 * instance's fresh demo. 2: the sign-in accounts' work e-mails and the new people (1 Oct 2026).
 */
const FORMAT = 2;
const STATE = kvKey('state');
const VERSION = kvKey('state', 'version');
const LOCK = kvKey('state', 'lock');
/** A lock outlives a stuck holder by this much at most; a write waits this long for it. */
const LOCK_MS = 15_000;
const WAIT_MS = 8_000;

/** Redis can't be reached, or the lock stayed taken: the message is for people. */
export class SharedStateError extends Error {}

interface Snapshot {
  format: number;
  gateway: MockSnapshot;
  store: StoreSnapshot;
}

type Parts = { gw: MockGateway; store: MemoryStore };

/**
 * `synced`: the version this instance last loaded or saved, and the state as it was then (to tell whether a run
 * changed it); `testKv`: the tests' store. On globalThis, so there is one per process: Next.js loads this file once for
 * the API routes and once for the pages (the /admin layout pulls too), and both work on the same gateway and store.
 */
type Sync = { synced: { version: string; json: string } | null; testKv: Kv | null };
const sync: Sync = ((globalThis as typeof globalThis & { rephSync?: Sync }).rephSync ??= { synced: null, testKv: null });
/** Set inside a locked run, so a write nested in it (a tool in a locked route) uses that lock instead of waiting for it. */
const locked = new AsyncLocalStorage<true>();

/** Tests only: share through this store (as if Redis were configured), starting as a new server instance. */
export function shareThroughForTests(store: Kv | null): void {
  sync.testKv = store;
  sync.synced = null;
}

function parts(): Parts | null {
  if (!kvShared() && !sync.testKv) return null;
  const gw = getGateway();
  const store = getStore();
  // The real tool (Phase 3) and PostgreSQL (P3-06) are shared already.
  return gw instanceof MockGateway && store instanceof MemoryStore ? { gw, store } : null;
}

const capture = (p: Parts) => toJson({ format: FORMAT, gateway: p.gw.snapshot(), store: p.store.snapshot() } satisfies Snapshot);
const log = (fields: Record<string, unknown>) => console.log(JSON.stringify({ route: 'shared-state', ...fields }));

function unreachable(error: unknown): never {
  log({ error: error instanceof Error ? error.message : String(error) });
  throw new SharedStateError('The app can’t reach its storage right now. Try again in a moment.');
}

async function lock(store: Kv): Promise<string | null> {
  const token = randomUUID();
  const until = Date.now() + WAIT_MS;
  while (!(await store.setNew(LOCK, token, LOCK_MS))) {
    if (Date.now() > until) return null;
    await new Promise((resolve) => setTimeout(resolve, 40 + Math.random() * 60));
  }
  return token;
}

/** Loads the shared state when Redis has a newer version than this instance. */
async function pull(store: Kv, p: Parts): Promise<void> {
  const latest = (await store.get(VERSION)) ?? '0';
  if (sync.synced?.version === latest) return;
  const [version, json] = latest === '0' ? ['0', null] : await store.mget([VERSION, STATE]);
  const at = version ?? '0';
  if (sync.synced?.version === at) return; // another request in this instance loaded it meanwhile
  const saved = json ? fromJson<Snapshot>(json) : null;
  if (saved?.format === FORMAT) {
    p.gw.restore(saved.gateway);
    p.store.restore(saved.store);
    sync.synced = { version: at, json: capture(p) };
  } else {
    // Nothing saved yet (or an older shape): this instance's fresh demo is pushed as the first version.
    sync.synced = { version: at, json: '' };
  }
}

/** Saves the state as the next version when this instance changed it. `held`: the caller holds the lock already. */
async function push(store: Kv, p: Parts, held: boolean): Promise<void> {
  if (!sync.synced || capture(p) === sync.synced.json) return;
  const token = held ? null : await lock(store);
  if (!held && !token) return log({ warning: 'busy: a change from a read was not saved' });
  try {
    const json = capture(p);
    if (json === sync.synced.json) return; // a write in this instance saved it meanwhile
    const version = (await store.get(VERSION)) ?? '0';
    if (version !== sync.synced.version) return log({ warning: 'changed elsewhere: a change from a read was not saved' });
    const next = String(Number(version) + 1);
    await store.mset({ [STATE]: json, [VERSION]: next });
    sync.synced = { version: next, json };
  } finally {
    if (token) await store.release(LOCK, token);
  }
}

/**
 * Runs `work` on the shared state (see above). `write`: hold the lock for the whole run. Throws SharedStateError when
 * Redis can't be reached or the lock stays taken; errors from `work` pass through.
 */
export async function withShared<T>(work: () => Promise<T>, write: boolean): Promise<T> {
  const p = parts();
  if (!p || (write && locked.getStore())) return work();
  const store = sync.testKv ?? kv();
  let token: string | null = null;
  try {
    if (write) {
      token = await lock(store).catch(unreachable);
      if (!token) throw new SharedStateError('The app is busy. Try again in a moment.');
    }
    await pull(store, p).catch(unreachable);
    const result = token ? await locked.run(true, work) : await work();
    await push(store, p, !!token).catch(unreachable);
    return result;
  } finally {
    if (token) await store.release(LOCK, token).catch(() => undefined);
  }
}

/** A write outside a route's own lock, e.g. a tool that checks someone in while the assistant streams its reply. */
export const sharedWrite = <T>(work: () => Promise<T>): Promise<T> => withShared(work, true);

/** Brings this instance up to date before a page reads the session (the /admin layout). */
export async function pullShared(): Promise<void> {
  const p = parts();
  if (p) await pull(sync.testKv ?? kv(), p).catch(unreachable);
}
