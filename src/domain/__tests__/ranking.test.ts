import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROOMS } from '../../data/rooms';
import { rankRooms, scoreRoom } from '../ranking';
import { manila } from '../time';
import type { Room, RoomRequest } from '../types';

const req: RoomRequest = { site: 'Manila', agendaType: 'Meeting', start: manila(2026, 9, 28, 15), end: manila(2026, 9, 28, 16), participants: 5 };
const room = (id: string): Room => {
  const r = ROOMS.find((x) => x.id === id);
  if (!r) throw new Error(`No room ${id}`);
  return r;
};

test('right-sized rooms rank above roomy and oversized ones (walk times from the prototype)', () => {
  // A training for 5: the meeting rooms take Training too, and Snowdon (20) is far too big.
  const walk: Record<string, number> = { capetown: 40, amsterdam: 60, batanes: 120, centralpark: 45, snowdon: 70 };
  const training = { ...req, agendaType: 'Training' as const };
  const ranked = rankRooms(['snowdon', 'centralpark', 'batanes', 'amsterdam', 'capetown'].map(room), training, (id) => walk[id]);
  assert.deepEqual(ranked.map((s) => s.room.id), ['capetown', 'amsterdam', 'batanes', 'centralpark', 'snowdon']);
  assert.equal(ranked.at(-1)?.fit, 'oversized');
});

test("rooms that are too small, don't take the type of agenda, or are not self-service are excluded", () => {
  assert.equal(scoreRoom(room('binondo'), req), null); // seats 4
  assert.equal(scoreRoom(room('snowdon'), req), null); // Training only
  assert.ok(scoreRoom(room('snowdon'), { ...req, agendaType: 'Training' }));
  assert.equal(scoreRoom(room('mph1'), { ...req, agendaType: 'Multi-purpose', participants: 51 }), null); // holds 50
  assert.equal(scoreRoom(room('tokyo'), req), null); // on no list of the room booking list
  assert.equal(scoreRoom(room('office-2f-024'), req), null); // Admin only
  assert.equal(scoreRoom(room('capetown'), { ...req, site: 'Iloilo' }), null);
});

test('rooms with unknown capacity rank below known good fits', () => {
  const unknown: Room = { ...room('capetown'), id: 'unknown', name: 'Unknown', capacity: null };
  const ranked = rankRooms([unknown, room('capetown')], req);
  assert.equal(ranked[0]?.room.id, 'capetown');
  assert.equal(ranked[1]?.fit, 'unknown size');
});

test('asking for video conferencing lowers rooms without it', () => {
  const withVc = scoreRoom(room('capetown'), { ...req, needsVC: true });
  const plain = scoreRoom(room('capetown'), req);
  assert.ok(withVc && plain && withVc.score < plain.score);
});
