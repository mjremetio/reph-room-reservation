import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MANILA_BLDG_H } from '../../data/floorPlans';
import { corners, floorFurniture } from '../floorLayout';

test('a back-to-back bench has a desk and a facing chair per seat', () => {
  const f = floorFurniture([{ t: 'bench', x: 0, y: 0, w: 60, h: 20, n: 3, along: 'x', double: true }]);
  assert.equal(f.desks.length, 6);
  assert.equal(f.chairs.length, 6);
  // First row's chairs sit above the bench and face down to their desks; the second row's below, facing up.
  assert.ok(f.chairs.slice(0, 3).every((c) => c.y < 0 && c.fy === 1));
  assert.ok(f.chairs.slice(3).every((c) => c.y > 20 && c.fy === -1));
});

test('diagonal bands stay inside their box', () => {
  const box = { x: 100, y: 100, w: 200, h: 150 };
  const f = floorFurniture([{ t: 'diagonal', ...box, angle: 32, pitch: 70, desk: 29 }]);
  assert.ok(f.desks.length > 10);
  assert.equal(f.desks.length, f.chairs.length);
  for (const d of f.desks) for (const [x, y] of corners(d)) assert.ok(x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h, `${x},${y}`);
  for (const c of f.chairs) assert.ok(c.x >= box.x && c.x <= box.x + box.w && c.y >= box.y && c.y <= box.y + box.h);
});

test('tables get their seats around them, facing in', () => {
  const round = floorFurniture([{ t: 'table', x: 0, y: 0, w: 20, h: 20, seats: 4, round: true }]);
  assert.equal(round.chairs.length, 4);
  for (const c of round.chairs) assert.ok(Math.abs(c.x - 10 + c.fx * 16) < 1e-9 && Math.abs(c.y - 10 + c.fy * 16) < 1e-9);
  assert.equal(floorFurniture([{ t: 'table', x: 0, y: 0, w: 40, h: 16, seats: 5 }]).chairs.length, 5);
});

test('both traced floors have an outline, labelled areas and workstations', () => {
  for (const floor of MANILA_BLDG_H.floors) {
    assert.ok(floor.outline.length >= 4, floor.floor);
    assert.ok(floor.areas.some((a) => a.kind === 'lift') && floor.areas.some((a) => a.kind === 'stairs') && floor.areas.some((a) => a.kind === 'restroom'), floor.floor);
    assert.ok(floorFurniture(floor.furniture).desks.length > 150, `${floor.floor} workstations`);
  }
});
