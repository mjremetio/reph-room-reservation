import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RULES } from '../../domain/rules';
import { manila } from '../../domain/time';
import { GUIDELINES } from '../guidelines';
import { buildInstructions } from '../instructions';

const ctx = { user: { name: 'Remetio, Mark Joseph', email: 'markjoseph.remetio@lexisnexis.com', login: 'MARKJOSEPH.REMETIO', division: 'Sales' }, now: manila(2026, 9, 28, 9), defaultSite: 'Manila' as const, emit: () => {} };

test('the assistant carries the guidelines knowledge', () => {
  const text = buildInstructions(ctx);
  assert.ok(text.includes(GUIDELINES));
  for (const fact of ['In Progress', '.ics', 'Forward', 'Cancel Reservation', 'hot desks', '2F-024 to 2F-027', 'Don\'t use audio', 'docking station', 'Toolkit app']) {
    assert.ok(GUIDELINES.includes(fact), `missing: ${fact}`);
  }
});

test('guideline numbers follow RULES, so answers match what the code enforces', () => {
  assert.ok(GUIDELINES.includes(`up to ${RULES.maxDaysAhead.Meeting} days`));
  assert.ok(GUIDELINES.includes(`${RULES.checkInGraceMinutes} minutes after the start`));
  assert.ok(GUIDELINES.includes(`${RULES.needsApproval.join(', ')} bookings are "In Progress" until Admin approves them`));
  for (const s of RULES.trainingShifts) assert.ok(GUIDELINES.includes(s.label));
});

test('the guidelines knowledge holds no email addresses (the source is confidential)', () => {
  assert.doesNotMatch(GUIDELINES, /@/);
});

test('the signed-in person is the requestor: the assistant never asks for a name or books for someone else', () => {
  const text = buildInstructions(ctx);
  assert.match(text, /User: Remetio, Mark Joseph \(Sales\), signed in/);
  assert.match(text, /never book for someone else/);
  assert.doesNotMatch(text, /needs_requestor|no sign-in/i);
});

test('the assistant knows the room schedule and the one-room-per-person rule', () => {
  const text = buildInstructions(ctx);
  assert.match(text, /call room_schedule/);
  assert.match(text, /One room per person at a time/);
});
