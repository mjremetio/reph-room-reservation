import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROOMS } from '../../data/rooms';
import { adminChangeIssues, bookableFrom, checkAgendaTitle, checkInWindow, fitsOneTrainingShift, initialStatus, shouldAutoRelease, urgentAllowed, validateRequest } from '../rules';
import { manila } from '../time';
import type { Booking, RoomRequest } from '../types';

const now = manila(2026, 9, 26, 9, 0);
const base: RoomRequest = { site: 'Manila', agendaType: 'Meeting', start: manila(2026, 9, 28, 15), end: manila(2026, 9, 28, 16), participants: 5, agenda: 'Q4 pipeline review' };
const codes = (req: RoomRequest, opts: Parameters<typeof validateRequest>[2] = {}) => validateRequest(req, now, opts).map((i) => i.code);

test('agenda titles must be specific', () => {
  for (const t of ['Meeting', 'training ', 'MEETING.', 'Training!']) assert.equal(checkAgendaTitle(t)?.code, 'AGENDA_TOO_GENERIC', t);
  assert.equal(checkAgendaTitle('')?.code, 'AGENDA_MISSING');
  assert.equal(checkAgendaTitle(undefined)?.code, 'AGENDA_MISSING');
  assert.equal(checkAgendaTitle('Q4 pipeline review'), null);
});

test('training bookings must fit one shift, including the night shift', () => {
  assert.equal(fitsOneTrainingShift(manila(2026, 9, 28, 9), manila(2026, 9, 28, 13)), true);
  assert.equal(fitsOneTrainingShift(manila(2026, 9, 28, 13), manila(2026, 9, 28, 15)), false);
  assert.equal(fitsOneTrainingShift(manila(2026, 9, 28, 22), manila(2026, 9, 29, 6)), true);
  assert.equal(fitsOneTrainingShift(manila(2026, 9, 29, 5), manila(2026, 9, 29, 6, 30)), false);
});

test('meeting rooms can be booked at most 10 days ahead (OPEN: the form says 90)', () => {
  assert.ok(codes({ ...base, start: manila(2026, 10, 8, 15), end: manila(2026, 10, 8, 16) }).includes('TOO_FAR_AHEAD'));
  assert.ok(!codes(base).includes('TOO_FAR_AHEAD'));
  assert.ok(!codes({ ...base, agendaType: 'Training', start: manila(2026, 10, 8, 9), end: manila(2026, 10, 8, 12) }).includes('TOO_FAR_AHEAD'));
});

test("the owner's room booking list: a room takes only its Types of agenda, up to its capacity", () => {
  const room = (id: string) => ROOMS.find((r) => r.id === id) as (typeof ROOMS)[number];
  const roomCodes = (req: RoomRequest, id: string) => codes(req, { room: room(id) }).filter((c) => c === 'ROOM_NOT_FOR_AGENDA' || c === 'OVER_CAPACITY');
  const training = { ...base, agendaType: 'Training' as const };
  const hall = { ...base, agendaType: 'Multi-purpose' as const };
  const lactation = { ...base, agendaType: 'Lactation Room' as const, participants: 1 };
  assert.deepEqual(roomCodes(base, 'amsterdam'), [], 'a meeting room takes Meeting');
  assert.deepEqual(roomCodes(training, 'amsterdam'), [], 'and Training');
  assert.deepEqual(roomCodes(base, 'snowdon'), ['ROOM_NOT_FOR_AGENDA'], 'a training room takes Training only');
  assert.deepEqual(roomCodes(training, 'snowdon'), []);
  assert.deepEqual(roomCodes({ ...training, participants: 20 }, 'mph2'), ['ROOM_NOT_FOR_AGENDA'], 'the halls take Multi-purpose only');
  assert.deepEqual(roomCodes({ ...hall, participants: 20 }, 'mph2'), [], 'a small group may book a hall: no warning any more');
  assert.deepEqual(roomCodes(lactation, 'lactation-3f'), []);
  assert.deepEqual(roomCodes(lactation, 'amsterdam'), ['ROOM_NOT_FOR_AGENDA']);
  assert.deepEqual(roomCodes(base, 'tokyo'), ['ROOM_NOT_FOR_AGENDA'], 'a room on no list cannot be booked');
  // "Capacity: 0–5" holds 5.
  assert.deepEqual(roomCodes({ ...base, participants: 6 }, 'amsterdam'), ['OVER_CAPACITY']);
  assert.deepEqual(roomCodes({ ...hall, participants: 50 }, 'mph1'), []);
  assert.deepEqual(roomCodes({ ...hall, participants: 51 }, 'mph1'), ['OVER_CAPACITY']);
  assert.deepEqual(roomCodes({ ...hall, participants: 93 }, 'mph2'), []);
  assert.deepEqual(roomCodes({ ...hall, participants: 94 }, 'mph2'), ['OVER_CAPACITY']);
  const message = (req: RoomRequest, id: string) => validateRequest(req, now, { room: room(id) }).find((i) => i.code === 'ROOM_NOT_FOR_AGENDA' || i.code === 'OVER_CAPACITY');
  assert.deepEqual(message({ ...base, participants: 6 }, 'amsterdam'), { code: 'OVER_CAPACITY', blocking: true, message: 'Amsterdam holds up to 5 people, not 6.' });
  assert.equal(message(base, 'snowdon')?.message, 'Snowdon can be booked for Training only, not Meeting.');
  assert.equal(message(lactation, 'amsterdam')?.message, 'Amsterdam can be booked for Meeting or Training only, not Lactation Room.');
  assert.equal(message(base, 'tokyo')?.message, "Tokyo can't be booked.");
});

test("Training, Pantry and Multi-purpose wait for Admin's approval; Meeting and Lactation Room are approved at once", () => {
  assert.equal(initialStatus('Training'), 'In Progress');
  assert.equal(initialStatus('Pantry'), 'In Progress');
  assert.equal(initialStatus('Multi-purpose'), 'In Progress');
  assert.equal(initialStatus('Meeting'), 'Approved');
  assert.equal(initialStatus('Lactation Room'), 'Approved');
});

test('agenda is only checked when booking, and visitor offices are not self-service', () => {
  const noTitle = { ...base, agenda: undefined };
  assert.ok(!codes(noTitle).includes('AGENDA_MISSING'));
  assert.ok(codes(noTitle, { forBooking: true }).includes('AGENDA_MISSING'));
  const office = ROOMS.find((r) => r.kind === 'Visitor Office');
  assert.ok(office);
  assert.ok(codes(base, { room: office, forBooking: true }).includes('NOT_SELF_BOOKABLE'));
});

test('end must be after start and the time cannot be in the past', () => {
  assert.ok(codes({ ...base, end: base.start }).includes('END_BEFORE_START'));
  assert.ok(codes({ ...base, start: manila(2026, 9, 25, 15), end: manila(2026, 9, 25, 16) }).includes('IN_PAST'));
});

test('check-in opens 1 hour before and the room is released 15 minutes after the start', () => {
  const b: Booking = { ticketNo: 'RM-1', roomId: 'tokyo', start: manila(2026, 9, 28, 10), end: manila(2026, 9, 28, 11), status: 'Approved', agenda: 'Weekly touchpoint meeting', agendaType: 'Meeting', participants: 4, owner: { name: 'Remetio, Mark Joseph' } };
  assert.deepEqual(checkInWindow(b), { start: manila(2026, 9, 28, 9), end: manila(2026, 9, 28, 10, 15) });
  assert.equal(shouldAutoRelease(b, manila(2026, 9, 28, 10, 14)), false);
  assert.equal(shouldAutoRelease(b, manila(2026, 9, 28, 10, 15)), true);
  assert.equal(shouldAutoRelease({ ...b, status: 'Checked-In' }, manila(2026, 9, 28, 10, 30)), false);
});

test('urgent priority follows the form hint (OPEN: business hours)', () => {
  assert.equal(urgentAllowed('Training', manila(2026, 10, 5, 9), now), true);
  assert.equal(urgentAllowed('Training', manila(2026, 10, 12, 9), now), false);
  assert.equal(urgentAllowed('Meeting', manila(2026, 9, 27, 8), now), true);
  assert.equal(urgentAllowed('Meeting', manila(2026, 9, 28, 15), now), false);
});

test('booking as Urgent is blocked unless the form rule allows it', () => {
  // The test clock is Sat, Sep 26, 9:00 AM.
  const soon: RoomRequest = { ...base, start: manila(2026, 9, 26, 15), end: manila(2026, 9, 26, 16) };
  const later: RoomRequest = { ...base, start: manila(2026, 9, 28, 15), end: manila(2026, 9, 28, 16) };
  assert.ok(!codes(soon, { forBooking: true, priority: 'Urgent' }).includes('URGENT_NOT_ALLOWED'), 'a meeting 6 hours away may be urgent');
  assert.ok(codes(later, { forBooking: true, priority: 'Urgent' }).includes('URGENT_NOT_ALLOWED'), 'a meeting 2 days away may not');
  assert.ok(!validateRequest(later, now, { forBooking: true, priority: 'Normal' }).some((i) => i.code === 'URGENT_NOT_ALLOWED'));
});

test('bookableFrom: this quarter hour within the start grace, else the next one', () => {
  assert.deepEqual(bookableFrom(manila(2026, 9, 28, 9, 0)), manila(2026, 9, 28, 9, 0));
  assert.deepEqual(bookableFrom(manila(2026, 9, 28, 9, 4)), manila(2026, 9, 28, 9, 0));
  assert.deepEqual(bookableFrom(manila(2026, 9, 28, 9, 6)), manila(2026, 9, 28, 9, 15));
  assert.deepEqual(bookableFrom(manila(2026, 9, 28, 23, 51)), manila(2026, 9, 29, 0, 0));
});

test("Admin changes follow the rules except the booking window, Admin-only rooms and the Urgent hint; the room's rules bind Admin too", () => {
  const now = manila(2026, 9, 28, 9);
  const room = (id: string) => ROOMS.find((r) => r.id === id) as (typeof ROOMS)[number];
  const amsterdam = room('amsterdam');
  const booking: Booking = {
    ticketNo: 'RM-1', roomId: 'amsterdam', status: 'In Progress', agenda: 'Board visit', agendaType: 'Meeting', participants: 3,
    owner: { name: 'Tester, Alpha' }, priority: 'Urgent', start: manila(2026, 11, 20, 10), end: manila(2026, 11, 20, 11),
  };
  const dayBefore = { ...booking, start: manila(2026, 11, 19, 10), end: manila(2026, 11, 19, 11) };
  assert.deepEqual(adminChangeIssues(dayBefore, booking, amsterdam, now), [], 'far ahead and Urgent are fine for Admin');
  const running = { ...booking, start: manila(2026, 9, 28, 8, 30), end: manila(2026, 9, 28, 10) };
  assert.deepEqual(adminChangeIssues({ ...running, end: manila(2026, 9, 28, 9, 30) }, running, amsterdam, now), [], 'extending a running booking');
  assert.deepEqual(adminChangeIssues(booking, running, amsterdam, now).map((i) => i.code), ['IN_PAST']);
  assert.deepEqual(adminChangeIssues(booking, { ...booking, agenda: 'Meeting', participants: 0 }, amsterdam, now).map((i) => i.code), ['NO_PARTICIPANTS', 'AGENDA_TOO_GENERIC']);
  // The owner's room booking list: no booking moves into a room that doesn't take its type or its group, not even by Admin.
  const office = ROOMS.find((r) => !r.selfBookable) as (typeof ROOMS)[number];
  assert.deepEqual(adminChangeIssues(booking, { ...booking, roomId: office.id }, office, now).map((i) => i.code), ['ROOM_NOT_FOR_AGENDA'], 'visitor offices take no type of agenda');
  assert.deepEqual(adminChangeIssues(booking, { ...booking, participants: 6 }, amsterdam, now).map((i) => i.code), ['OVER_CAPACITY']);
  assert.deepEqual(adminChangeIssues(booking, { ...booking, agendaType: 'Multi-purpose' }, amsterdam, now).map((i) => i.code), ['ROOM_NOT_FOR_AGENDA']);
  // A booking from before the list, in a room nobody can book now: its title can still be fixed, but it can't move.
  const old = { ...booking, roomId: 'tokyo' };
  assert.deepEqual(adminChangeIssues(old, { ...old, agenda: 'Board visit prep' }, room('tokyo'), now), []);
  assert.deepEqual(adminChangeIssues(old, { ...old, end: manila(2026, 11, 20, 12) }, room('tokyo'), now).map((i) => i.code), ['ROOM_NOT_FOR_AGENDA']);
});
