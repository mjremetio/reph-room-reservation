import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MANILA_BLDG_H, manilaGraph } from '../../data/floorPlans';
import { ROOMS } from '../../data/rooms';
import { shortestRoute } from '../routing';

test('every room on the map exists in the room list, and every bookable Manila room is on the map', () => {
  const onMap = new Set(MANILA_BLDG_H.floors.flatMap((f) => f.rooms.map((r) => r.roomId)));
  for (const id of onMap) assert.ok(ROOMS.some((r) => r.id === id), `${id} is on the map but not in ROOMS`);
  for (const r of ROOMS.filter((x) => x.site === 'Manila' && x.selfBookable)) assert.ok(onMap.has(r.id), `${r.id} has no map shape`);
  for (const f of MANILA_BLDG_H.floors) {
    for (const shape of f.rooms) assert.equal(ROOMS.find((r) => r.id === shape.roomId)?.floor, f.floor, `${shape.roomId} is drawn on the wrong floor`);
  }
});

test('every door on the plan can be reached from both lift lobbies', () => {
  const g = manilaGraph();
  for (const f of MANILA_BLDG_H.floors) {
    for (const shape of f.rooms.filter((r) => !r.unplaced)) {
      for (const lobby of ['2F-lobby', '3F-lobby']) assert.ok(shortestRoute(g, lobby, shape.door), `${shape.roomId} unreachable from ${lobby}`);
    }
  }
});

test('Cape Town is under a minute from the 2F lift lobby', () => {
  const route = shortestRoute(manilaGraph(), '2F-lobby', '2F-door-capetown');
  assert.ok(route);
  assert.ok(route.seconds < 60, `${route.seconds}s`);
  assert.deepEqual(route.floors, ['2F']);
});

test('going to 3F uses the lift by default, and never the stairs when avoiding them', () => {
  const g = manilaGraph();
  const route = shortestRoute(g, '2F-lobby', '3F-door-batanes');
  assert.ok(route);
  assert.deepEqual(route.floors, ['2F', '3F']);
  assert.ok(route.nodeIds.includes('2F-lift'));
  const noStairs = shortestRoute(g, '2F-lobby', '3F-door-batanes', { avoidStairs: true });
  assert.equal(noStairs?.usesStairs, false);
});

test('rooms missing from the appendix layout are marked unplaced, not guessed onto the plan', () => {
  const unplaced = MANILA_BLDG_H.floors.flatMap((f) => f.rooms.filter((r) => r.unplaced).map((r) => r.roomId)).sort();
  assert.deepEqual(unplaced, ['huddle6', 'huddle7', 'huddle8', 'intramuros']);
});

test('unknown nodes return no route', () => {
  assert.equal(shortestRoute(manilaGraph(), '2F-lobby', 'nowhere'), null);
});
