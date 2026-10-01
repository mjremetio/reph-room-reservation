import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availabilityFor, conflictsFor, freeIntervals, nearestFreeSlots, overlaps, ownConflicts } from '../availability';
import { addMinutes, manila } from '../time';
import type { Booking } from '../types';

const now = manila(2026, 9, 26, 9, 0);
const owner = { name: 'Tester, Alpha', email: 'alpha@example.com', division: 'Operations' };

function booking(roomId: string, start: Date, end: Date, extra: Partial<Booking> = {}): Booking {
  return { ticketNo: 'RM-0000001', roomId, start, end, status: 'Approved', agenda: 'Team sync', agendaType: 'Meeting', participants: 4, owner, ...extra };
}

test('back-to-back meetings do not clash', () => {
  const a = { start: manila(2026, 9, 28, 15), end: manila(2026, 9, 28, 16) };
  assert.equal(overlaps(a, { start: manila(2026, 9, 28, 16), end: manila(2026, 9, 28, 17) }), false);
  assert.equal(overlaps(a, { start: manila(2026, 9, 28, 15, 30), end: manila(2026, 9, 28, 16, 30) }), true);
});

test('cancelled bookings and expired holds do not block; live holds do', () => {
  const want = { start: manila(2026, 9, 28, 15), end: manila(2026, 9, 28, 16) };
  const ignored = [
    booking('centralpark', want.start, want.end, { status: 'Cancelled' }),
    booking('centralpark', want.start, want.end, { status: 'Held', holdExpiresAt: addMinutes(now, -1) }),
  ];
  assert.deepEqual(conflictsFor('centralpark', want, ignored, now), []);
  const liveHold = booking('centralpark', want.start, want.end, { status: 'Held', holdExpiresAt: addMinutes(now, 3) });
  assert.equal(conflictsFor('centralpark', want, [liveHold], now).length, 1);
});

test('ownConflicts: the same person in any room at an overlapping time, never cancelled ones or other people', () => {
  const want = { start: manila(2026, 9, 28, 15), end: manila(2026, 9, 28, 16), agendaType: 'Meeting' as const };
  const other = { ...owner, name: 'Tester, Bravo', email: 'bravo@example.com' };
  const bookings = [
    booking('tokyo', manila(2026, 9, 28, 15, 30), manila(2026, 9, 28, 16, 30), { ticketNo: 'RM-1' }),
    booking('capetown', manila(2026, 9, 28, 14), manila(2026, 9, 28, 15), { ticketNo: 'RM-2' }), // back to back
    booking('jolo', want.start, want.end, { ticketNo: 'RM-3', status: 'Cancelled' }),
    booking('rio', want.start, want.end, { ticketNo: 'RM-4', owner: other }),
  ];
  assert.deepEqual(
    ownConflicts('ALPHA@example.com', want, bookings, now).map((b) => b.ticketNo),
    ['RM-1'],
  );
  assert.deepEqual(ownConflicts('nobody@example.com', want, bookings, now), []);
});

test("ownConflicts: Training and Multi-purpose bookings may be held several at once (the owner's request)", () => {
  const at = { start: manila(2026, 9, 28, 15), end: manila(2026, 9, 28, 16) };
  const meeting = booking('amsterdam', at.start, at.end, { ticketNo: 'RM-M' });
  const training = booking('snowdon', at.start, at.end, { ticketNo: 'RM-T', agendaType: 'Training' });
  const hall = booking('mph1', at.start, at.end, { ticketNo: 'RM-H', agendaType: 'Multi-purpose' });
  const mine = [meeting, training, hall];
  // A new Training or Multi-purpose booking clashes with nothing of theirs, not even a meeting.
  assert.deepEqual(ownConflicts(owner.email, { ...at, agendaType: 'Training' }, mine, now), []);
  assert.deepEqual(ownConflicts(owner.email, { ...at, agendaType: 'Multi-purpose' }, mine, now), []);
  // A new Meeting or Lactation Room booking clashes with their meeting only: their training and hall don't count.
  assert.deepEqual(ownConflicts(owner.email, { ...at, agendaType: 'Meeting' }, mine, now).map((b) => b.ticketNo), ['RM-M']);
  assert.deepEqual(ownConflicts(owner.email, { ...at, agendaType: 'Lactation Room' }, mine, now).map((b) => b.ticketNo), ['RM-M']);
  assert.deepEqual(ownConflicts(owner.email, { ...at, agendaType: 'Meeting' }, [training, hall], now), []);
});

test('flow B: partly free returns the free part and who has the rest', () => {
  const want = { start: manila(2026, 9, 28, 14), end: manila(2026, 9, 28, 16) };
  const alpha = booking('centralpark', manila(2026, 9, 28, 15), manila(2026, 9, 28, 16, 30));
  const result = availabilityFor('centralpark', want, [alpha], now);
  assert.equal(result.kind, 'partial');
  if (result.kind !== 'partial') return;
  assert.deepEqual(result.free, [{ start: manila(2026, 9, 28, 14), end: manila(2026, 9, 28, 15) }]);
  assert.equal(result.conflicts[0]?.owner.name, 'Tester, Alpha');
});

test('flow C: a fully covered request is unavailable', () => {
  const want = { start: manila(2026, 10, 2, 13), end: manila(2026, 10, 2, 17) };
  const hall = booking('mph1', manila(2026, 10, 2, 12), manila(2026, 10, 2, 18));
  assert.equal(availabilityFor('mph1', want, [hall], now).kind, 'unavailable');
});

test('free slivers shorter than 15 minutes are ignored', () => {
  const want = { start: manila(2026, 9, 28, 14), end: manila(2026, 9, 28, 15) };
  const b = booking('tokyo', manila(2026, 9, 28, 14, 10), manila(2026, 9, 28, 15));
  assert.equal(availabilityFor('tokyo', want, [b], now).kind, 'unavailable');
});

test('night-shift bookings across midnight block early-morning requests', () => {
  const night = booking('amsterdam', manila(2026, 9, 29, 22), manila(2026, 9, 30, 6));
  const want = { start: manila(2026, 9, 30, 1), end: manila(2026, 9, 30, 2) };
  assert.equal(availabilityFor('amsterdam', want, [night], now).kind, 'unavailable');
});

test('overlapping bookings merge when computing free time', () => {
  const window = { start: manila(2026, 9, 28, 9), end: manila(2026, 9, 28, 13) };
  const bookings = [
    booking('paris', manila(2026, 9, 28, 9, 30), manila(2026, 9, 28, 10, 30)),
    booking('paris', manila(2026, 9, 28, 10), manila(2026, 9, 28, 11)),
  ];
  assert.deepEqual(freeIntervals('paris', window, bookings, now), [
    { start: manila(2026, 9, 28, 9), end: manila(2026, 9, 28, 9, 30) },
    { start: manila(2026, 9, 28, 11), end: manila(2026, 9, 28, 13) },
  ]);
});

test('nearest free slots skip booked times and never overlap each other', () => {
  const want = { start: manila(2026, 9, 28, 14), end: manila(2026, 9, 28, 16) };
  const alpha = booking('centralpark', manila(2026, 9, 28, 15), manila(2026, 9, 28, 16, 30));
  const slots = nearestFreeSlots('centralpark', want, [alpha], now, { limit: 2 });
  assert.equal(slots.length, 2);
  for (const s of slots) assert.equal(conflictsFor('centralpark', s, [alpha], now).length, 0);
  assert.equal(overlaps(slots[0]!, slots[1]!), false);
});

test("Admin's room block holds the room like a booking, but is nobody's own booking (one room per person)", () => {
  const want = { start: manila(2026, 9, 28, 15), end: manila(2026, 9, 28, 16), agendaType: 'Meeting' as const };
  const block = booking('coron', want.start, want.end, { ticketNo: 'RM-5', status: 'Blocked', agenda: 'Aircon maintenance', participants: 0 });
  assert.deepEqual(conflictsFor('coron', want, [block], now).map((b) => b.ticketNo), ['RM-5']);
  assert.deepEqual(ownConflicts(owner.email, want, [block], now), [], 'the Admin who blocked it may still book a room then');
});
