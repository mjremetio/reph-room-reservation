import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_SCENARIO } from '../../data/scenarios';
import { manila } from '../../domain/time';
import { MockGateway } from '../mockGateway';
import { ConflictError, NotAllowedError, type NewBooking } from '../ReservationGateway';
import { swapBookings } from '../swap';

const mark = { name: 'Remetio, Mark Joseph', email: 'markjoseph.remetio@lexisnexis.com', division: 'Sales' };
const alpha = { name: 'Tester, Alpha', email: 'alpha.tester@example.com', division: 'Operations' };
const bravo = { name: 'Tester, Bravo', email: 'bravo.tester@example.com', division: 'HR' };
const at = (h: number, m = 0) => manila(2026, 9, 28, h, m);
const emptyGateway = (now = at(9)) => new MockGateway({ withSamples: false, now: () => now });
const request = (roomId: string, who = mark, participants = 5): NewBooking => ({
  roomId, start: at(15), end: at(16), agenda: 'Q4 pipeline review', agendaType: 'Meeting', participants, requester: who,
});

test('double booking is rejected with the conflicting booking', async () => {
  const gw = emptyGateway();
  await gw.createBooking(request('capetown', alpha));
  await assert.rejects(gw.createBooking(request('capetown')), (err: unknown) => err instanceof ConflictError && err.conflicts.length === 1);
});

test('one room per person at a time: a second room at an overlapping time is refused, back to back is fine', async () => {
  const gw = emptyGateway();
  await gw.createBooking(request('capetown'));
  await assert.rejects(gw.createBooking(request('johannesburg')), (err: unknown) => err instanceof ConflictError && err.kind === 'requester' && err.conflicts[0]?.roomId === 'capetown');
  await gw.createBooking({ ...request('johannesburg'), start: at(16), end: at(17) });
  // Someone else can still take another room at the same time.
  await gw.createBooking(request('johannesburg', alpha));
});

test('only the owner can cancel, and cancelling frees the slot', async () => {
  const gw = emptyGateway();
  const b = await gw.createBooking(request('capetown', alpha));
  await assert.rejects(gw.cancelBooking(b.ticketNo, mark), NotAllowedError);
  await gw.cancelBooking(b.ticketNo, alpha);
  await gw.createBooking(request('capetown'));
});

test('check-in works for the owner from 1 hour before until 15 minutes after the start', async () => {
  const early = emptyGateway(at(13, 30));
  const b1 = await early.createBooking(request('capetown'));
  await assert.rejects(early.checkIn(b1.ticketNo, mark), NotAllowedError);

  const onTime = emptyGateway(at(14, 50));
  const b2 = await onTime.createBooking(request('capetown'));
  await assert.rejects(onTime.checkIn(b2.ticketNo, alpha), NotAllowedError);
  assert.equal((await onTime.checkIn(b2.ticketNo, mark)).status, 'Checked-In');

  const late = emptyGateway(at(15, 20));
  const b3 = await late.createBooking(request('capetown'));
  await assert.rejects(late.checkIn(b3.ticketNo, mark), NotAllowedError);
});

test('a booking nobody checked in to is released 15 minutes after the start, and its room is free again', async () => {
  let t = at(9);
  const gw = new MockGateway({ withSamples: false, now: () => t });
  const late = await gw.createBooking({ ...request('johannesburg', alpha), start: at(10), end: at(11) });
  const kept = await gw.createBooking({ ...request('intramuros', bravo), start: at(10), end: at(11) });
  t = at(9, 30);
  await gw.checkIn(kept.ticketNo, bravo);
  t = at(10, 14);
  assert.deepEqual(await gw.releaseNoShows(), [], 'still inside the check-in window');
  t = at(10, 15);
  const released = await gw.releaseNoShows();
  assert.deepEqual(released.map((b) => b.ticketNo), [late.ticketNo], 'the checked-in booking stays');
  const b = await gw.getBooking(late.ticketNo);
  assert.deepEqual([b?.status, b?.releasedAt?.getTime(), b?.modifiedBy, b?.adminComments], ['Cancelled', at(10, 15).getTime(), 'SYSTEM', 'Released: nobody checked in within 15 minutes of the start.']);
  assert.deepEqual(await gw.releaseNoShows(), [], 'once only');
  const again = await gw.createBooking({ ...request('johannesburg', mark), start: at(10, 15), end: at(11) });
  assert.equal(again.roomId, 'johannesburg', 'the room can be booked again');
});

test('visitor offices cannot be booked directly', async () => {
  await assert.rejects(emptyGateway().createBooking(request('office-2f-025')), NotAllowedError);
});

test('a swap moves the owner and books the freed room', async () => {
  const gw = emptyGateway();
  const theirs = await gw.createBooking(request('centralpark', alpha, 4));
  const result = await swapBookings(gw, theirs.ticketNo, 'batanes', request('centralpark', mark, 8), alpha);
  assert.equal(result.owner.roomId, 'batanes');
  assert.equal(result.requester.roomId, 'centralpark');
});

test('a failed swap puts the owner back where they were', async () => {
  const gw = emptyGateway();
  const theirs = await gw.createBooking(request('centralpark', alpha, 4));
  await gw.createBooking(request('capetown', bravo));
  await assert.rejects(swapBookings(gw, theirs.ticketNo, 'batanes', request('capetown'), alpha), ConflictError);
  assert.equal((await gw.getBooking(theirs.ticketNo))?.roomId, 'centralpark');
});

test('with the demo scenario, unknown capacities get demo values but real ones stay', async () => {
  const gw = new MockGateway({ scenario: DEMO_SCENARIO, now: () => DEMO_SCENARIO.now });
  const rooms = await gw.listRooms();
  assert.equal(rooms.find((r) => r.id === 'paris')?.capacity, 6);
  assert.equal(rooms.find((r) => r.id === 'capetown')?.capacity, 5);
  const mine = await gw.listMyBookings(mark.email, at(0), manila(2026, 10, 5));
  assert.deepEqual(mine.map((b) => b.ticketNo), ['RM-0129902', 'RM-0129912']);
  assert.equal((await gw.checkIn('RM-0129902', mark)).status, 'Checked-In');
});

const admin = { ...mark, login: 'MARKJOSEPH.REMETIO', role: 'admin' as const };

test("the gateway keeps the owner's room booking list: each room's types of agenda and capacity, and approval by type", async () => {
  const gw = emptyGateway();
  const delta = { name: 'Tester, Delta', email: 'delta.tester@example.com', division: 'Sales' };
  await assert.rejects(gw.createBooking(request('tokyo')), /Tokyo can't be booked/);
  await assert.rejects(gw.createBooking(request('snowdon')), /Snowdon can be booked for Training only, not Meeting/);
  await assert.rejects(gw.createBooking(request('amsterdam', mark, 6)), /Amsterdam holds up to 5 people, not 6/);
  assert.equal((await gw.createBooking(request('amsterdam'))).status, 'Approved', 'Meeting: approved at once');
  assert.equal((await gw.createBooking({ ...request('snowdon', alpha, 20), agendaType: 'Training' })).status, 'In Progress', 'Training waits for Admin');
  assert.equal((await gw.createBooking({ ...request('mph2', bravo, 93), agendaType: 'Multi-purpose' })).status, 'In Progress', 'Multi-purpose waits for Admin');
  assert.equal((await gw.createBooking({ ...request('lactation-3f', delta, 1), agendaType: 'Lactation Room' })).status, 'Approved', 'Lactation Room: approved at once');
});

test('Admin approves or turns down a request waiting for Admin; nobody else can', async () => {
  const gw = emptyGateway();
  // Training waits for Admin (the owner's room booking list); a Meeting is approved at once.
  const a = await gw.createBooking({ ...request('capetown', alpha), agendaType: 'Training' });
  const b = await gw.createBooking({ ...request('johannesburg', bravo), agendaType: 'Training' });
  assert.deepEqual([a.status, b.status], ['In Progress', 'In Progress']);
  await assert.rejects(gw.approveBooking(a.ticketNo, alpha), NotAllowedError);
  const approved = await gw.approveBooking(a.ticketNo, admin, 'Enjoy');
  assert.equal(approved.status, 'Approved');
  assert.equal(approved.adminComments, 'Enjoy');
  assert.equal(approved.modifiedBy, 'MARKJOSEPH.REMETIO');
  await assert.rejects(gw.approveBooking(a.ticketNo, admin), /Only requests waiting for Admin/);
  const rejected = await gw.rejectBooking(b.ticketNo, admin, 'Room kept for the townhall');
  assert.equal(rejected.status, 'Cancelled');
  assert.equal(rejected.adminComments, 'Room kept for the townhall');
  // The rejected slot is free again.
  const meeting = await gw.createBooking(request('johannesburg', mark));
  assert.equal(meeting.status, 'Approved', 'a Meeting needs no approval');
  await assert.rejects(gw.approveBooking(meeting.ticketNo, admin), /Only requests waiting for Admin/);
});

test('Admin changes a booking only where the room and the owner are free; Admin may cancel anyone', async () => {
  const gw = emptyGateway();
  const a = await gw.createBooking(request('capetown', alpha));
  await gw.createBooking(request('johannesburg', bravo));
  await gw.createBooking({ ...request('intramuros', alpha), start: at(17), end: at(18) });
  await assert.rejects(gw.updateBooking(a.ticketNo, { roomId: 'intramuros' }, alpha), NotAllowedError);
  await assert.rejects(gw.updateBooking(a.ticketNo, { roomId: 'johannesburg' }, admin), (e: unknown) => e instanceof ConflictError && e.kind === 'room');
  // Alpha already holds Intramuros 17–18: moving her Cape Town booking to 17:00 clashes with herself.
  await assert.rejects(gw.updateBooking(a.ticketNo, { start: at(17), end: at(18), roomId: 'capetown' }, admin), (e: unknown) => e instanceof ConflictError && e.kind === 'requester');
  // The room's rules bind Admin too: Amsterdam holds 5, MPH 1 takes Multi-purpose only.
  await assert.rejects(gw.updateBooking(a.ticketNo, { roomId: 'amsterdam', participants: 7 }, admin), /Amsterdam holds up to 5 people, not 7/);
  await assert.rejects(gw.updateBooking(a.ticketNo, { roomId: 'mph1' }, admin), /MPH 1 can be booked for Multi-purpose only, not Meeting/);
  const moved = await gw.updateBooking(a.ticketNo, { roomId: 'centralpark', participants: 7, start: undefined }, admin);
  assert.equal(moved.roomId, 'centralpark');
  assert.equal(moved.participants, 7);
  assert.equal(moved.start.getTime(), at(15).getTime(), 'an undefined field is left as it was');
  // Type of Training follows the type of agenda: On-Site for a training, none for anything else.
  assert.equal((await gw.updateBooking(a.ticketNo, { agendaType: 'Training' }, admin)).trainingType, 'On-Site');
  assert.equal((await gw.updateBooking(a.ticketNo, { agendaType: 'Meeting' }, admin)).trainingType, undefined);
  await gw.cancelBooking(a.ticketNo, admin, 'Double entry');
  assert.equal((await gw.getBooking(a.ticketNo))?.adminComments, 'Double entry');
  await assert.rejects(gw.updateBooking(a.ticketNo, { participants: 3 }, admin), /Cancelled/);
});

test('Admin swaps the rooms of two bookings in one step, and edits room details', async () => {
  const gw = emptyGateway();
  const a = await gw.createBooking(request('capetown', alpha));
  const b = await gw.createBooking(request('johannesburg', bravo));
  await assert.rejects(gw.swapRooms(a.ticketNo, b.ticketNo, alpha), NotAllowedError);
  const [x, y] = await gw.swapRooms(a.ticketNo, b.ticketNo, admin);
  assert.equal(x.roomId, 'johannesburg');
  assert.equal(y.roomId, 'capetown');
  // Charlie has Intramuros 17–18 and Mark has Intramuros 15:30–16:30: Alpha (15–16) can't take it, so nothing moves.
  await gw.createBooking({ ...request('intramuros', mark), start: at(15, 30), end: at(16, 30) });
  const charlie = { name: 'Tester, Charlie', email: 'charlie.tester@example.com', division: 'Learning' };
  const c = await gw.createBooking({ ...request('intramuros', charlie), start: at(17), end: at(18) });
  await assert.rejects(gw.swapRooms(a.ticketNo, c.ticketNo, admin), (e: unknown) => e instanceof ConflictError && e.conflicts[0]?.roomId === 'intramuros');
  assert.equal((await gw.getBooking(a.ticketNo))?.roomId, 'johannesburg');
  // Each booking must suit the other's room: Alpha's meeting can't go to a training room.
  const t = await gw.createBooking({ ...request('snowdon', charlie), agendaType: 'Training', start: at(19), end: at(20) });
  await assert.rejects(gw.swapRooms(a.ticketNo, t.ticketNo, admin), /Snowdon can be booked for Training only, not Meeting/);
  assert.equal((await gw.getBooking(t.ticketNo))?.roomId, 'snowdon');
  const room = await gw.updateRoom('capetown', { capacity: 6, notes: 'New screen', name: undefined }, admin);
  assert.equal(room.capacity, 6);
  assert.equal(room.name, 'Cape Town');
  assert.equal((await gw.listRooms()).find((r) => r.id === 'capetown')?.notes, 'New screen');
  await assert.rejects(gw.updateRoom('capetown', { capacity: 7 }, alpha), NotAllowedError);
});

test('one room per person leaves out Training and Multi-purpose: a person may hold several of those at once', async () => {
  const gw = emptyGateway();
  const training = (roomId: string) => ({ ...request(roomId, mark, 10), agendaType: 'Training' as const });
  const hall = (roomId: string) => ({ ...request(roomId, mark, 40), agendaType: 'Multi-purpose' as const });
  await gw.createBooking(training('snowdon'));
  await gw.createBooking(training('denali'));
  await gw.createBooking(hall('mph1'));
  await gw.createBooking(hall('mph2'));
  // A meeting then too: Training and Multi-purpose bookings don't count. A second meeting does.
  await gw.createBooking(request('capetown'));
  await assert.rejects(gw.createBooking(request('amsterdam')), (err: unknown) => err instanceof ConflictError && err.kind === 'requester' && err.conflicts[0]?.roomId === 'capetown');
  // A room still holds one booking at a time.
  await assert.rejects(gw.createBooking(training('snowdon')), (err: unknown) => err instanceof ConflictError && err.kind === 'room');
});

test('an Admin change of type checks the owner again: a Training may overlap their meeting, a Meeting may not', async () => {
  const gw = emptyGateway();
  await gw.createBooking(request('capetown'));
  const t = await gw.createBooking({ ...request('johannesburg'), agendaType: 'Training' });
  await assert.rejects(gw.updateBooking(t.ticketNo, { agendaType: 'Meeting' }, admin), (e: unknown) => e instanceof ConflictError && e.kind === 'requester');
  assert.equal((await gw.updateBooking(t.ticketNo, { agenda: 'Excel basics' }, admin)).agendaType, 'Training', 'other changes still work');
});
