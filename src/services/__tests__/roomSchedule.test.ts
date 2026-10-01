/** Who has which room when (room_schedule) on the demo week; the clock is Mon, Sep 28, 9:00 AM. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_SCENARIO } from '../../data/scenarios';
import { ROOMS } from '../../data/rooms';
import { manila } from '../../domain/time';
import { MockGateway } from '../../gateway/mockGateway';
import { matchRooms, roomSchedule } from '../roomSchedule';

const now = DEMO_SCENARIO.now;
const gw = () => new MockGateway({ scenario: DEMO_SCENARIO, now: () => now });
const mark = DEMO_SCENARIO.demoUser.email;
const monday = { start: manila(2026, 9, 28), end: manila(2026, 9, 29) };
const ids = (rooms: { id: string }[]) => rooms.map((r) => r.id);

test('rooms are found the way people name them', () => {
  assert.deepEqual(ids(matchRooms(ROOMS, 'Batanes 3F')), ['batanes']);
  assert.deepEqual(ids(matchRooms(ROOMS, 'the batanes room')), ['batanes']);
  assert.deepEqual(ids(matchRooms(ROOMS, 'huddle 7')), ['huddle7']);
  assert.deepEqual(ids(matchRooms(ROOMS, 'Mount Apo')), ['mtapo']);
  assert.deepEqual(ids(matchRooms(ROOMS, 'rio')), ['rio']);
  assert.deepEqual(ids(matchRooms(ROOMS, 'park')), ['hydepark', 'centralpark']);
  assert.deepEqual(matchRooms(ROOMS, 'room'), []);
  assert.deepEqual(matchRooms(ROOMS, 'Atlantis'), []);
});

test("a room's day: who has it (privacy-filtered) and the free times from now on", async () => {
  const r = await roomSchedule(gw(), { site: 'Manila', room: 'Central Park', ...monday, viewerEmail: mark }, now);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const [cp] = r.rooms;
  assert.equal(cp?.room.id, 'centralpark');
  assert.deepEqual(
    cp?.bookings.map((b) => [b.ticketNo, b.owner, b.division, b.participants, b.status, b.mine, b.agenda]),
    [['RM-0129908', 'Tester, Alpha', 'Operations', 4, 'Approved', false, undefined]],
  );
  // Free before and after Alpha, but nothing before 9:00 AM (it is 9:00 AM now).
  assert.deepEqual(
    cp?.free.map((f) => [f.start.toISOString(), f.end.toISOString()]),
    [
      [manila(2026, 9, 28, 9).toISOString(), manila(2026, 9, 28, 15).toISOString()],
      [manila(2026, 9, 28, 16, 30).toISOString(), monday.end.toISOString()],
    ],
  );
  assert.deepEqual(r.freeRooms, [], 'a named room lists no other rooms');
});

test('your own booking shows with its agenda; cancelled ones never show', async () => {
  const tokyo = await roomSchedule(gw(), { site: 'Manila', room: 'tokyo', ...monday, viewerEmail: mark }, now);
  assert.ok(tokyo.ok && tokyo.rooms[0]?.bookings[0]?.mine && tokyo.rooms[0].bookings[0].agenda === 'Weekly touchpoint meeting');
  const cape = await roomSchedule(gw(), { site: 'Manila', room: 'Cape Town', ...monday, viewerEmail: mark }, now);
  assert.ok(cape.ok && cape.rooms[0]?.bookings.length === 0, 'RM-0129911 is cancelled');
});

test('a floor lists only the booked rooms, and names the bookable rooms free the whole time', async () => {
  const r = await roomSchedule(gw(), { site: 'Manila', floor: '3F', ...monday, viewerEmail: mark }, now);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(ids(r.rooms.map((s) => s.room)), ['coron', 'elnido']);
  assert.equal(r.rooms[1]?.bookings[0]?.status, 'In Progress', "Charlie's El Nido training waits for Admin");
  assert.ok(r.freeRooms.some((room) => room.id === 'batanes'));
  // Only rooms someone can book: Mactan, Tagaytay and the other rooms on no list are never offered.
  assert.ok(r.freeRooms.every((room) => room.floor === '3F' && room.selfBookable && room.agendas.length > 0));
  assert.ok(!r.freeRooms.some((room) => room.id === 'mactan' || room.id === 'tagaytay'));
  assert.equal(r.more, 0);
});

test('bad windows and unknown rooms are explained', async () => {
  const unknown = await roomSchedule(gw(), { site: 'Manila', room: 'Atlantis', ...monday, viewerEmail: mark }, now);
  assert.deepEqual(unknown, { ok: false, problem: 'There is no room called "Atlantis".' });
  const backwards = await roomSchedule(gw(), { site: 'Manila', room: 'tokyo', start: monday.end, end: monday.start, viewerEmail: mark }, now);
  assert.equal(backwards.ok, false);
  const tooLong = await roomSchedule(gw(), { site: 'Manila', room: 'tokyo', start: monday.start, end: manila(2026, 10, 6), viewerEmail: mark }, now);
  assert.deepEqual(tooLong, { ok: false, problem: 'Ask for at most 7 days at a time.' });
});
