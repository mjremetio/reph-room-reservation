import { ACCOUNTS } from '../config/accounts';
import { now } from '../lib/clock';
import type { AppStore } from './AppStore';
import { MemoryStore } from './memoryStore';

/**
 * Kept on globalThis, so there is one store per process: Next.js loads this file once for the API routes and once for
 * the pages, and the /admin layout must see the accounts as the API changed them (a new Admin, a role change).
 */
const proc = globalThis as typeof globalThis & { rephStore?: AppStore | null };

/** The app's own data (accounts, audit log, messages). In memory until P3-06 (PostgreSQL). */
export function getStore(): AppStore {
  return (proc.rephStore ??= new MemoryStore(ACCOUNTS, now()));
}

/** Evals and tests only: start again from the configured accounts. */
export function resetStore(): void {
  proc.rephStore = null;
}
