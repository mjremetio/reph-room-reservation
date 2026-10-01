import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROOMS } from '../rooms';
import { roomIssues, RULES } from '../../domain/rules';
import { manila, manilaStartOfWeek } from '../../domain/time';
import type { AgendaType } from '../../domain/types';
import { DEMO_SCENARIO, EMPTY_SCENARIO, parseScenario, scenarioInWeekOf } from '../scenarios';

test('room ids are unique and capacities are unknown (null) or positive', () => {
  assert.equal(new Set(ROOMS.map((r) => r.id)).size, ROOMS.length);
  for (const r of ROOMS) assert.ok(r.capacity === null || r.capacity > 0, r.id);
});

test('visitor offices are the only rooms that are not self-service', () => {
  for (const r of ROOMS) assert.equal(r.selfBookable, r.kind !== 'Visitor Office', r.id);
});

test("the owner's room booking list (1 Oct 2026), exactly: the rooms of each Type of agenda, their names and capacities", () => {
  const listed = (t: AgendaType) => ROOMS.filter((r) => r.agendas.includes(t)).map((r) => `${r.toolName ?? r.name} (${r.capacity ?? 'no capacity'})`).sort();
  const meeting = [
    'Amsterdam (5)', 'Batanes 3F (6)', 'Binondo 3F (4)', 'Cape Town (5)', 'Central Park (10)', 'Coron (VIP Conference Room) 3F (10)',
    'Huddle Room 7 – 3F (4)', 'Huddle Room 8 – 3F (4)', 'Hyde Park (Collaboration Set up) (10)', 'Intramuros 3F (6)', 'Johannesburg (6)',
  ];
  assert.deepEqual(listed('Meeting'), [...meeting].sort());
  assert.deepEqual(listed('Training'), [...meeting, 'El Nido 3F (20)', 'Mt. Apo 3F (20)', 'Mt. Mayon 3F (20)', 'TR A – Snowdon (20)', 'TR B – Denali (20)'].sort());
  assert.deepEqual(listed('Multi-purpose'), ['MPH 1 (50)', 'MPH 2 (93)']);
  assert.deepEqual(listed('Lactation Room'), ['Lactation Room 1 (no capacity)']);
  assert.deepEqual(listed('Pantry'), [], 'no room yet');
  assert.deepEqual(RULES.needsApproval, ['Training', 'Pantry', 'Multi-purpose'], 'these need Admin approval');
});

test('the demo scenario loads and follows the booking rules', () => {
  assert.equal(DEMO_SCENARIO.bookings.length, 15);
  assert.equal(DEMO_SCENARIO.demoUser.name, 'Remetio, Mark Joseph');
  assert.equal(DEMO_SCENARIO.now.toISOString(), '2026-09-28T01:00:00.000Z');
  // Bookings in rooms nobody can book now (Tokyo, London…) are from before the room booking list; the rest follow it.
  for (const b of DEMO_SCENARIO.bookings) {
    const room = ROOMS.find((r) => r.id === b.roomId) as (typeof ROOMS)[number];
    if (room.agendas.length > 0) assert.deepEqual(roomIssues(room, b.agendaType, b.participants), [], b.ticketNo);
  }
});

test('the empty scenario (MOCK_SCENARIO=empty) has no bookings and no Tester people', () => {
  assert.deepEqual(EMPTY_SCENARIO.bookings, []);
  assert.deepEqual(EMPTY_SCENARIO.capacityOverrides, {});
  assert.ok(EMPTY_SCENARIO.people.every((p) => !p.name.startsWith('Tester, ') || p.email === 'admin.test@email.com'), 'only the test Admin account');
});

test('the scenario loader rejects bad data with a clear message', () => {
  const good = {
    name: 't', description: '', now: '2026-09-28T09:00:00+08:00', demoUser: { name: 'A, B', email: 'a@example.com' }, capacityOverrides: {},
    people: [{ name: 'A, B', email: 'a@example.com' }],
    bookings: [{ ticketNo: 'RM-1', roomId: 'tokyo', start: '2026-09-28T10:00:00+08:00', end: '2026-09-28T11:00:00+08:00', status: 'Approved', agenda: 'x', agendaType: 'Meeting', participants: 2, owner: 'a@example.com' }],
  };
  assert.doesNotThrow(() => parseScenario(good));
  const clash = { ...good, bookings: [...good.bookings, { ...good.bookings[0]!, ticketNo: 'RM-2' }] };
  assert.throws(() => parseScenario(clash), /overlaps/);
  assert.throws(() => parseScenario({ ...good, bookings: [{ ...good.bookings[0]!, roomId: 'atlantis' }] }), /unknown room/);
  assert.throws(() => parseScenario({ ...good, bookings: [{ ...good.bookings[0]!, status: 'Pending' }] }), /unknown status/);
});

test('on the real clock the demo week moves into the current Manila week, same weekdays and times', () => {
  assert.equal(scenarioInWeekOf(DEMO_SCENARIO, manila(2026, 10, 1, 17)), DEMO_SCENARIO, 'the demo week itself stays as it is');
  const later = scenarioInWeekOf(DEMO_SCENARIO, manila(2026, 11, 12, 8)); // Thursday, six weeks later
  assert.equal(later.now.toISOString(), manila(2026, 11, 9, 9).toISOString());
  const first = later.bookings.find((b) => b.ticketNo === 'RM-0129901');
  assert.equal(first?.start.toISOString(), manila(2026, 11, 9, 9, 30).toISOString());
  assert.equal(later.bookings.length, DEMO_SCENARIO.bookings.length);
  // Monday starts the week, also from a Sunday night.
  assert.equal(manilaStartOfWeek(manila(2026, 10, 4, 23, 59)).toISOString(), manila(2026, 9, 28).toISOString());
  assert.equal(manilaStartOfWeek(manila(2026, 10, 5, 0, 0)).toISOString(), manila(2026, 10, 5).toISOString());
});
