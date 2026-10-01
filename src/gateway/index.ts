import { DEMO_SCENARIO, EMPTY_SCENARIO, scenarioInWeekOf } from '../data/scenarios';
import { now } from '../lib/clock';
import { MockGateway } from './mockGateway';
import type { ReservationGateway } from './ReservationGateway';

/** Kept on globalThis, so there is one per process: Next.js loads this file once for the API routes and once for the pages. */
const proc = globalThis as typeof globalThis & { rephGateway?: ReservationGateway | null };

/**
 * Picks the implementation from RESERVATION_GATEWAY (default "mock").
 * The mock uses MOCK_SCENARIO: "demo" (default, fixed data from data/scenarios/demo.json), "empty" (no bookings; the
 * people are the sign-in accounts, data/scenarios/empty.json) or "random". With DEMO_NOW the demo week stays on its own
 * dates; on the real clock it moves into the current week (scenarioInWeekOf).
 * Add "api" or "db" here once IT confirms how to connect (docs/spec/08-integration.md).
 */
export function getGateway(): ReservationGateway {
  if (proc.rephGateway) return proc.rephGateway;
  const kind = process.env.RESERVATION_GATEWAY ?? 'mock';
  if (kind === 'mock') {
    const which = process.env.MOCK_SCENARIO ?? 'demo';
    const demo = process.env.DEMO_NOW ? DEMO_SCENARIO : scenarioInWeekOf(DEMO_SCENARIO, now());
    const scenario = which === 'empty' ? EMPTY_SCENARIO : which === 'demo' ? demo : undefined;
    return (proc.rephGateway = new MockGateway({ now, scenario }));
  }
  throw new Error(`RESERVATION_GATEWAY="${kind}" is not implemented yet. See docs/spec/08-integration.md.`);
}

/** Evals and tests only: forget the in-memory gateway, so the next call starts from the scenario again. */
export function resetGateway(): void {
  proc.rephGateway = null;
}
