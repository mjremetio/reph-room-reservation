import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MANILA_BLDG_H } from '../../data/floorPlans';
import { ROOMS } from '../../data/rooms';
import { DOOR_W, doorSide, roomFurniture, roomWalls, WALL_T, type Rect } from '../building3d/layout';

const amsterdam: Rect = { x: 30, y: 430, w: 80, h: 90 }; // door at (70, 430), top side

test('the door side is glass with a door-wide opening at the door', () => {
  const walls = roomWalls(amsterdam, { x: 70, y: 430 });
  assert.equal(doorSide(amsterdam, { x: 70, y: 430 }), 'top');
  const glass = walls.filter((w) => w.glass);
  assert.equal(glass.length, 2);
  const [a, b] = glass.sort((p, q) => p.x - q.x);
  assert.equal(b!.x - (a!.x + a!.w), DOOR_W);
  assert.equal(a!.x + a!.w + DOOR_W / 2, 70, 'opening centred on the door');
  assert.equal(walls.filter((w) => !w.glass).length, 3);
});

test('a door near a corner still leaves a full opening inside the wall', () => {
  const walls = roomWalls(amsterdam, { x: 32, y: 430 });
  const glass = walls.filter((w) => w.glass);
  assert.equal(glass.length, 1, 'no sliver of glass before the opening');
  assert.ok(glass[0]!.x >= amsterdam.x + DOOR_W - 0.001);
});

test('every room in the floor data gets walls, and never more seats than it holds', () => {
  const byId = new Map(ROOMS.map((r) => [r.id, r] as const));
  for (const floor of MANILA_BLDG_H.floors) {
    const nodes = new Map(floor.nodes.map((n) => [n.id, n] as const));
    for (const shape of floor.rooms) {
      const room = byId.get(shape.roomId)!;
      const door = nodes.get(shape.door)!;
      const walls = roomWalls(shape, door);
      assert.ok(walls.length >= 4, `${shape.roomId} walls`);
      for (const w of walls) {
        assert.ok(w.w > 0 && w.h > 0, `${shape.roomId} wall size`);
        assert.ok(w.x >= shape.x - 0.001 && w.x + w.w <= shape.x + shape.w + 0.001, `${shape.roomId} wall inside x`);
        assert.ok(w.y >= shape.y - 0.001 && w.y + w.h <= shape.y + shape.h + 0.001, `${shape.roomId} wall inside y`);
      }
      const f = roomFurniture(shape, door, room.kind, room.capacity, room.av);
      if (room.capacity !== null) assert.ok(f.seats.length <= room.capacity, `${shape.roomId}: ${f.seats.length} seats > ${room.capacity}`);
      assert.ok(f.seats.length > 0, `${shape.roomId} has seats`);
      for (const s of f.seats) {
        assert.ok(s.x > shape.x + WALL_T && s.x < shape.x + shape.w - WALL_T, `${shape.roomId} seat inside x`);
        assert.ok(s.y > shape.y + WALL_T && s.y < shape.y + shape.h - WALL_T, `${shape.roomId} seat inside y`);
        assert.equal(Math.hypot(s.fx, s.fy), 1);
      }
    }
  }
});

test('meeting rooms seat their capacity around one table; training rooms face the screen', () => {
  const meeting = roomFurniture(amsterdam, { x: 70, y: 430 }, 'Meeting', 5, 'BYOD');
  assert.equal(meeting.tables.length, 1);
  assert.equal(meeting.seats.length, 5);
  assert.ok(meeting.screen, 'BYOD rooms have a screen');

  const training = roomFurniture({ x: 300, y: 430, w: 170, h: 90 }, { x: 385, y: 430 }, 'Training', 25, 'VC');
  assert.ok(training.seats.every((s) => s.fy === 1), 'screen is on the far (bottom) wall, so everyone faces +y');
  assert.ok(training.tables.length >= 1);
});
