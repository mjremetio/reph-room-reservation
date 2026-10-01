import { randomUUID } from 'node:crypto';
import { sameEmail } from '../domain/people';
import { RULES } from '../domain/rules';
import { addMinutes } from '../domain/time';
import type { NewBooking } from '../gateway/ReservationGateway';
import { fromJson, kv, kvKey, toJson } from '../lib/kv';
import type { CancelView } from '../services/prepareBooking';
import type { ProposalView } from './context';

/**
 * A change the assistant prepared and the user still has to confirm with a button.
 * Bookings and cancellations only happen in POST /api/proposals/[id], never inside the agent.
 */
export interface Proposal {
  id: string;
  kind: 'book' | 'cancel';
  userEmail: string;
  booking?: NewBooking;
  ticketNo?: string;
  expiresAt: Date;
  /** What the confirm card shows, so a confirm link can open it again (GET /api/proposals/{id}). */
  view?: { kind: 'book'; proposal: ProposalView } | { kind: 'cancel'; cancel: CancelView };
}

// In Redis when it is configured (every server instance sees them), else in this process's memory (src/lib/kv.ts).
const keyOf = (id: string) => kvKey('proposal', id);

/**
 * A new proposal with its id and expiry; nothing is kept until saveProposal (after its card view is added).
 * holdMinutes: RULES.proposalHoldMinutes for the app's cards, RULES.linkProposalHoldMinutes for MCP confirm links.
 */
export function newProposal(p: Omit<Proposal, 'id' | 'expiresAt'>, now: Date = new Date(), holdMinutes: number = RULES.proposalHoldMinutes): Proposal {
  return { ...p, id: randomUUID(), expiresAt: addMinutes(now, holdMinutes) };
}

/** Keeps the proposal for its confirm. The real check is expiresAt (the app's clock); the store forgets it a little after the longest hold. */
export async function saveProposal(p: Proposal): Promise<Proposal> {
  await kv().set(keyOf(p.id), toJson(p), (RULES.linkProposalHoldMinutes + 1) * 60_000);
  return p;
}

const valid = (p: Proposal | null, userEmail: string, now: Date): Proposal | null =>
  p && sameEmail(p.userEmail, userEmail) && p.expiresAt.getTime() > now.getTime() ? p : null;

/** The proposal without using it up (a confirm link opening its card), only for the same user and before it expires. */
export async function peekProposal(id: string, userEmail: string, now: Date = new Date()): Promise<Proposal | null> {
  const json = await kv().get(keyOf(id));
  return valid(json ? fromJson<Proposal>(json) : null, userEmail, now);
}

/** Returns the proposal and removes it, but only for the same user and before it expires. */
export async function takeProposal(id: string, userEmail: string, now: Date = new Date()): Promise<Proposal | null> {
  const json = await kv().get(keyOf(id));
  const p = json ? fromJson<Proposal>(json) : null;
  if (!p || !sameEmail(p.userEmail, userEmail)) return null;
  // Only one confirm wins: whoever deletes it gets it.
  const taken = await kv().take(keyOf(id));
  return taken ? valid(p, userEmail, now) : null;
}
