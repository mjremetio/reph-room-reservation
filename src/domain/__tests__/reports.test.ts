import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROOMS } from '../../data/rooms';
import { buildReport, manilaToday, waitingForAdmin } from '../reports';
import { manila } from '../time';
import type { Booking } from '../types';

const alpha = { name: 'Tester, Alpha', email: 'alpha.tester@example.com', division: 'Operations' };
const bravo = { name: 'Tester, Bravo', email: 'bravo.tester@example.com', division: 'HR' };
const b = (ticketNo: string, roomId: string, day: number, h: number, hours: number, status: Booking['status'], owner = alpha, extra: Partial<Booking> = {}): Booking => ({
  ticketNo, roomId, start: manila(2026, 9, day, h), end: manila(2026, 9, day, h + hours), status, agenda: 'Team sync', agendaType: 'Meeting', participants: 4, owner, ...extra,
});

test('a report counts bookings, hours, statuses, no-shows and utilisation over the range', () => {
  const now = manila(2026, 9, 29, 12);
  const bookings = [
    b('RM-1', 'tokyo', 28, 9, 2, 'Checked-In'),
    b('RM-2', 'tokyo', 28, 14, 1, 'Approved'), // not checked in, long past: a no-show
    b('RM-3', 'capetown', 29, 10, 1, 'In Progress', bravo, { createdAt: manila(2026, 9, 27, 10) }),
    b('RM-4', 'capetown', 29, 15, 1, 'Cancelled', bravo),
    b('RM-5', 'mtapo', 30, 23, 3, 'Approved', bravo, { agendaType: 'Training' }), // runs past the range end (Oct 1, 0:00)
    b('RM-6', 'tokyo', 20, 9, 1, 'Approved'), // before the range
  ];
  const r = buildReport({ bookings, rooms: ROOMS, from: manila(2026, 9, 28), to: manila(2026, 10, 1), now });
  assert.equal(r.totals.bookings, 4, 'cancelled and out-of-range bookings are not used');
  assert.equal(r.totals.hours, 5, '2 + 1 + 1 + 1 (only the hour of RM-5 inside the range)');
  assert.equal(r.totals.people, 2);
  assert.deepEqual([r.totals.waiting, r.totals.approved, r.totals.checkedIn, r.totals.cancelled], [1, 2, 1, 1]);
  assert.equal(r.totals.noShows, 2, 'RM-2, and RM-3 (In Progress, started 26 hours ago)');
  assert.equal(r.totals.avgLeadDays, 2);
  const bookable = ROOMS.filter((x) => x.selfBookable).length;
  assert.equal(r.totals.utilisation, Math.round((5 / (72 * bookable)) * 1000) / 1000);
  assert.deepEqual(r.byStatus.map((s) => [s.key, s.count]), [['In Progress', 1], ['Approved', 2], ['Checked-In', 1], ['Cancelled', 1]]);
  assert.deepEqual(r.byAgendaType.map((c) => [c.key, c.count, c.hours]), [['Meeting', 3, 4], ['Training', 1, 1]]);
  const tokyo = r.byRoom.find((x) => x.roomId === 'tokyo');
  assert.deepEqual(tokyo && [tokyo.count, tokyo.hours, tokyo.noShows], [2, 3, 1]);
  assert.equal(tokyo?.utilisation, Math.round((3 / 72) * 1000) / 1000);
  assert.deepEqual(r.byDay, [
    { day: '2026-09-28', count: 2, hours: 3 },
    { day: '2026-09-29', count: 1, hours: 1 },
    { day: '2026-09-30', count: 1, hours: 1 },
  ]);
  // Mon 9–11 AM, Mon 2 PM, Tue 10 AM, Wed 11 PM (weekday 0 = Monday).
  assert.equal(r.heatmap[0]?.[9], 1);
  assert.equal(r.heatmap[0]?.[10], 1);
  assert.equal(r.heatmap[0]?.[14], 1);
  assert.equal(r.heatmap[1]?.[10], 1);
  assert.equal(r.heatmap[2]?.[23], 1);
  assert.equal(r.heatmap.flat().reduce((s, x) => s + x, 0), 5);
  assert.deepEqual(r.byDivision.map((c) => [c.key, c.count]), [['HR', 2], ['Operations', 2]]);
  assert.equal(r.topRequesters[0]?.name, 'Tester, Alpha', 'two bookings each; Alpha has more hours');
});

test('waiting for Admin lists open requests soonest first; today is the Manila day', () => {
  const now = manila(2026, 9, 29, 12);
  const list = waitingForAdmin(
    [b('RM-1', 'tokyo', 30, 9, 1, 'In Progress'), b('RM-2', 'tokyo', 29, 14, 1, 'In Progress'), b('RM-3', 'tokyo', 29, 8, 1, 'In Progress'), b('RM-4', 'tokyo', 29, 16, 1, 'Approved')],
    now,
  );
  assert.deepEqual(list.map((x) => x.ticketNo), ['RM-2', 'RM-1'], 'ended ones and approved ones are left out');
  const today = manilaToday(manila(2026, 9, 29, 0, 30));
  assert.deepEqual([today.from, today.to], [manila(2026, 9, 29), manila(2026, 9, 30)]);
});

test('a booking released because nobody checked in still counts as a no-show', () => {
  const now = manila(2026, 9, 29, 12);
  const released = b('RM-7', 'tokyo', 28, 16, 1, 'Cancelled', alpha, { releasedAt: manila(2026, 9, 28, 16, 15) });
  const r = buildReport({ bookings: [released, b('RM-8', 'tokyo', 28, 18, 1, 'Cancelled')], rooms: ROOMS, from: manila(2026, 9, 28), to: manila(2026, 10, 1), now });
  assert.deepEqual([r.totals.bookings, r.totals.cancelled, r.totals.noShows], [0, 2, 1], 'cancelled, and only the released one is a no-show');
  assert.equal(r.byRoom.find((x) => x.roomId === 'tokyo')?.noShows, 1);
});
