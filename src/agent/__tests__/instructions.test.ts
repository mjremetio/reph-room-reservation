import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RULES } from '../../domain/rules';
import { manila } from '../../domain/time';
import { GUIDELINES } from '../guidelines';
import { buildInstructions } from '../instructions';

const ctx = { user: { name: 'Remetio, Mark Joseph', email: 'markjoseph.remetio@lexisnexis.com', login: 'MARKJOSEPH.REMETIO', division: 'Sales' }, now: manila(2026, 9, 28, 9), defaultSite: 'Manila' as const, emit: () => {} };

test('both assistants know today in Manila, with the weekday and the year, and to count from it', async () => {
  const { buildAdminInstructions } = await import('../adminAgent');
  for (const text of [buildInstructions(ctx), buildAdminInstructions(ctx)]) {
    assert.ok(text.includes('Today is Monday, September 28, 2026 (2026-09-28), 9:00 AM in Asia/Manila (UTC+8, PHT)'), text.slice(0, 400));
    assert.ok(text.includes('dates without a year from it, in Asia/Manila whatever'));
  }
});

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
