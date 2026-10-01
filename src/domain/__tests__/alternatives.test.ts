import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROOMS } from '../../data/rooms';
import { swapOptionsFor } from '../alternatives';
import { availabilityFor } from '../availability';
import { manila } from '../time';
import type { Booking } from '../types';

const now = manila(2026, 9, 28, 9);
const alpha: Booking = {
  ticketNo: 'RM-0129908', roomId: 'centralpark', start: manila(2026, 9, 28, 15), end: manila(2026, 9, 28, 16, 30),
  status: 'Approved', agenda: 'Team sync', agendaType: 'Meeting', participants: 5, owner: { name: 'Tester, Alpha', email: 'alpha@example.com' },
};

test('swap options fit the owner, are free for their whole slot, and prefer the same floor', () => {
  const capetownBusy: Booking = { ...alpha, ticketNo: 'RM-2', roomId: 'capetown', start: manila(2026, 9, 28, 16), end: manila(2026, 9, 28, 17) };
  const bookings = [alpha, capetownBusy];
  const options = swapOptionsFor(alpha, ROOMS, bookings, now);
  const ids = options.map((o) => o.room.id);
  assert.ok(options.length > 0 && options.length <= 3);
  assert.ok(!ids.includes('centralpark'), 'not the room they are already in');
  assert.ok(!ids.includes('capetown'), 'Cape Town is busy from 4:00 PM');
  assert.ok(!ids.includes('binondo'), 'Binondo seats 4, Alpha has 5');
  for (const o of options) assert.equal(availabilityFor(o.room.id, alpha, bookings, now).kind, 'available');
  assert.equal(options[0]?.room.floor, '2F');
});
