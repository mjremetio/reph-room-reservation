/**
 * The three flows from the target process, run on the demo scenario (docs/spec/02-flows.md).
 * If these fail after changing data/scenarios/demo.json, the demo no longer matches the spec.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_SCENARIO } from '../../data/scenarios';
import { swapOptionsFor } from '../../domain/alternatives';
import { formatRange, manila } from '../../domain/time';
import type { RoomRequest } from '../../domain/types';
import { MockGateway } from '../../gateway/mockGateway';
import { searchRooms } from '../searchRooms';
import { searchResultViews } from '../views';

const now = DEMO_SCENARIO.now; // Mon, Sep 28, 2026, 9:00 AM
const gw = () => new MockGateway({ scenario: DEMO_SCENARIO, now: () => now });
const monday = (h: number, m = 0) => manila(2026, 9, 28, h, m);
const friday = (h: number) => manila(2026, 10, 2, h);
const meeting = (participants: number, start: Date, end: Date): RoomRequest => ({ site: 'Manila', agendaType: 'Meeting', participants, start, end });

test('flow A: 5 people, Mon 3:00–4:00 PM → right-size rooms first', async () => {
  const r = await searchRooms(gw(), meeting(5, monday(15), monday(16)), now);
  assert.equal(r.flow, 'A');
  assert.deepEqual(r.fullyFree.slice(0, 3).map((m) => m.room.id), ['amsterdam', 'batanes', 'capetown']);
  for (const busy of ['centralpark', 'hydepark', 'coron']) assert.ok(!r.fullyFree.some((m) => m.room.id === busy), busy);
  // Only rooms on the owner's room booking list: Tokyo, London, Bacolod… are never offered.
  for (const m of [...r.fullyFree, ...r.partlyFree, ...r.taken]) assert.ok(m.room.agendas.includes('Meeting'), m.room.id);
  assert.equal(r.alternatives.length, 0);
});

test('flow B: 8 people, Mon 2:00–4:00 PM → Central Park free 2–3 PM, Alpha has the rest', async () => {
  const g = gw();
  const r = await searchRooms(g, meeting(8, monday(14), monday(16)), now);
  assert.equal(r.flow, 'B');
  assert.equal(r.fullyFree.length, 0);
  const cp = r.partlyFree.find((m) => m.room.id === 'centralpark');
  assert.ok(cp && cp.availability.kind === 'partial');
  assert.deepEqual(cp.availability.free, [{ start: monday(14), end: monday(15) }]);
  assert.equal(cp.availability.conflicts[0]?.owner.name, 'Tester, Alpha');
  assert.ok(r.partlyFree.some((m) => m.room.id === 'coron'), 'Bravo has Coron 1:30–3:30 PM');
  assert.ok(r.alternatives.length > 0);

  const alphas = await g.getBooking('RM-0129908');
  assert.ok(alphas);
  const options = swapOptionsFor(alphas, await g.listRooms(), await g.getBookings({ from: alphas.start, to: alphas.end }), now);
  // The 2F rooms first (same floor as Central Park), then Binondo on 3F; all take Meeting and hold Alpha's 4.
  assert.deepEqual(options.map((o) => o.room.id), ['amsterdam', 'capetown', 'binondo']);
  assert.ok(options.every((o) => o.room.agendas.includes('Meeting') && (o.room.capacity ?? 0) >= 4));
});

test('flow C: hall for 60, Fri Oct 2, 1:00–5:00 PM → MPH 1 holds 50, MPH 2 is taken, evening alternative, no other hall to move to', async () => {
  const g = gw();
  const r = await searchRooms(g, { site: 'Manila', agendaType: 'Multi-purpose', participants: 60, start: friday(13), end: friday(17) }, now);
  assert.equal(r.flow, 'C');
  assert.deepEqual(r.taken.map((m) => m.room.id), ['mph2']);
  assert.ok(![...r.fullyFree, ...r.partlyFree, ...r.taken].some((m) => m.room.id === 'mph1'), 'MPH 1 holds up to 50');
  assert.ok(r.alternatives.some((a) => a.room.id === 'mph2' && formatRange(a.start, a.end).includes('5:00') && a.end.getTime() === friday(21).getTime()));

  // Charlie's 24 in MPH 2 could only move to the other hall (halls take Multi-purpose only), and Bravo has MPH 1 then.
  const carlos = await g.getBooking('RM-0129914');
  assert.ok(carlos);
  assert.deepEqual(swapOptionsFor(carlos, await g.listRooms(), await g.getBookings({ from: carlos.start, to: carlos.end }), now), []);

  const marias = await g.getBooking('RM-0129913');
  assert.ok(marias);
  assert.equal(swapOptionsFor(marias, await g.listRooms(), await g.getBookings({ from: marias.start, to: marias.end }), now).length, 0);
});

test('rule problems stop the search, and Iloilo has no rooms yet', async () => {
  const tooFar = await searchRooms(gw(), meeting(4, manila(2026, 10, 20, 10), manila(2026, 10, 20, 11)), now);
  assert.equal(tooFar.ok, false);
  assert.match(tooFar.problems[0] ?? '', /10 days/);
  const iloilo = await searchRooms(gw(), { ...meeting(6, monday(14), monday(15)), site: 'Iloilo' }, now);
  assert.equal(iloilo.flow, 'none');
  // The owner's room booking list has no Pantry room yet.
  const pantry = await searchRooms(gw(), { ...meeting(4, monday(14), monday(15)), agendaType: 'Pantry' }, now);
  assert.deepEqual([pantry.ok, pantry.flow, pantry.problems], [false, 'none', ['No room is set up for Pantry bookings yet. Contact Admin.']]);
  // The lactation room takes Lactation Room bookings, and nothing else does.
  const lactation = await searchRooms(gw(), { ...meeting(1, monday(14), monday(15)), agendaType: 'Lactation Room' }, now);
  assert.deepEqual(lactation.fullyFree.map((m) => m.room.id), ['lactation-3f']);
});

test('one room per person: searching while you already hold a room then warns, and a booking is refused', async () => {
  const g = gw();
  const mark = DEMO_SCENARIO.demoUser;
  // The demo user has Tokyo, 2F on Mon 10:00–11:00 AM.
  const r = await searchRooms(g, meeting(4, monday(10, 30), monday(11, 30)), now, mark.email);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes('You already have Tokyo, 2F') && w.includes('RM-0129902')), r.warnings.join(' | '));
  const later = await searchRooms(g, meeting(4, monday(11), monday(12)), now, mark.email);
  assert.deepEqual(later.warnings, [], 'back to back is fine');

  const { prepareBooking } = await import('../prepareBooking');
  const draft = { roomId: 'amsterdam', agendaType: 'Meeting' as const, agenda: 'Design review', start: monday(10, 30), end: monday(11, 30), participants: 4 };
  const refused = await prepareBooking(g, mark, draft, now);
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.equal(refused.code, 'CONFLICT');
  assert.deepEqual(refused.fields, ['time']);
  assert.match(refused.problems[0] ?? '', /^You already have Tokyo, 2F .*One room per person at a time\.$/);
});

test('a named room is reported with its real status even when it is not a best fit, and leads its group', async () => {
  // Coron (10 seats) is free Mon 12:00–1:30 PM (Bravo has it from 1:30), but too big to be a best fit for 3.
  const plain = await searchRooms(gw(), meeting(3, monday(12), monday(13, 30)), now);
  assert.ok(!plain.fullyFree.some((m) => m.room.id === 'coron'), 'not among the five best fits');
  const r = await searchRooms(gw(), meeting(3, monday(12), monday(13, 30)), now, undefined, { room: 'coron' });
  assert.equal(r.requested?.canHost, true);
  assert.equal(r.requested?.match?.availability.kind, 'available');
  assert.equal(r.fullyFree[0]?.room.id, 'coron', 'the named room comes first');
  assert.equal(r.fullyFree.filter((m) => m.room.id === 'coron').length, 1);
  assert.equal(r.fullyFree.length, 5, 'still at most five');
  // Taken: Alpha has Central Park 3:00–4:30 PM.
  const cp = await searchRooms(gw(), meeting(4, monday(15), monday(16)), now, undefined, { room: 'Central Park' });
  assert.equal(cp.requested?.match?.availability.kind, 'unavailable');
  assert.equal(cp.taken[0]?.room.id, 'centralpark');
  // Can't host, or not a room at all: said in words, nothing pinned.
  const small = await searchRooms(gw(), meeting(6, monday(12), monday(13)), now, undefined, { room: 'Amsterdam' });
  assert.equal(small.requested?.canHost, false);
  assert.equal(small.requested?.note, 'Amsterdam holds up to 5 people, not 6.');
  assert.ok(!small.fullyFree.some((m) => m.room.id === 'amsterdam'));
  const note = async (room: string) => (await searchRooms(gw(), meeting(4, monday(12), monday(13)), now, undefined, { room })).requested?.note;
  assert.equal(await note('Tokyo'), "Tokyo can't be booked.");
  assert.equal(await note('Snowdon'), 'Snowdon can be booked for Training only, not Meeting.');
  const unknown = await searchRooms(gw(), meeting(3, monday(12), monday(13)), now, undefined, { room: 'Atlantis' });
  assert.deepEqual([unknown.requested?.match, unknown.requested?.note], [null, 'No room called "Atlantis".']);
});

test("a room Admin blocked shows as taken by \"Admin\": never the Admin's name, division or reason, never the viewer's own", async () => {
  const g = gw();
  const admin = { name: 'Remetio, Mark Joseph', email: 'markjoseph.remetio@lexisnexis.com', login: 'MARKJOSEPH.REMETIO', role: 'admin' as const };
  await g.blockRooms({ roomIds: ['amsterdam'], start: friday(9), end: friday(17), reason: 'Aircon maintenance' }, admin, []);
  const r = await searchRooms(g, meeting(5, friday(10), friday(11)), now);
  assert.ok(!r.fullyFree.some((m) => m.room.id === 'amsterdam'));
  // The Admin who blocked it searches too: it is still "Admin", not "mine".
  for (const viewer of ['lili.lagunoy@lexisnexis.com', admin.email]) {
    const view = searchResultViews(r, viewer).results.find((x) => x.roomId === 'amsterdam');
    assert.deepEqual(view?.conflicts?.map((c) => [c.owner, c.division, c.mine, c.status]), [['Admin', undefined, false, 'Blocked']], viewer);
  }
  assert.ok(!JSON.stringify(searchResultViews(r, admin.email)).includes('Aircon'), 'the reason stays with Admin');
});
