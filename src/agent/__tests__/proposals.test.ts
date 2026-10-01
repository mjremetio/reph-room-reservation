import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMinutes, manila } from '../../domain/time';
import { newProposal, peekProposal, saveProposal, takeProposal } from '../proposals';

const now = manila(2026, 9, 28, 9);
const booking = {
  roomId: 'capetown', start: manila(2026, 9, 28, 15), end: manila(2026, 9, 28, 16), agenda: 'Q4 pipeline review',
  agendaType: 'Meeting' as const, participants: 5, requester: { name: 'Remetio, Mark Joseph', email: 'markjoseph.remetio@lexisnexis.com' },
};

test('a proposal can be confirmed once, only by its user, and keeps its dates', async () => {
  const p = await saveProposal(newProposal({ kind: 'book', userEmail: 'markjoseph.remetio@lexisnexis.com', booking }, now));
  assert.equal(await takeProposal(p.id, 'someone.else@example.com', now), null);
  assert.equal((await peekProposal(p.id, 'markjoseph.remetio@lexisnexis.com', now))?.booking?.start.getTime(), booking.start.getTime());
  assert.equal((await takeProposal(p.id, 'MARKJOSEPH.REMETIO@lexisnexis.com', now))?.id, p.id);
  assert.equal(await takeProposal(p.id, 'markjoseph.remetio@lexisnexis.com', now), null);
});

test('a proposal expires after 3 minutes', async () => {
  const p = await saveProposal(newProposal({ kind: 'book', userEmail: 'markjoseph.remetio@lexisnexis.com', booking }, now));
  assert.equal(await takeProposal(p.id, 'markjoseph.remetio@lexisnexis.com', addMinutes(now, 4)), null);
});

test('a proposal that was never saved is not found', async () => {
  const p = newProposal({ kind: 'cancel', userEmail: 'markjoseph.remetio@lexisnexis.com', ticketNo: 'RM-0130001' }, now);
  assert.equal(await peekProposal(p.id, 'markjoseph.remetio@lexisnexis.com', now), null);
});
