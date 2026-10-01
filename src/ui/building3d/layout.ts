/**
 * Plan layout for the realistic 3D view: walls with a glass front and door opening, and furniture sized to
 * the room. Pure (map units, no three.js) so it is unit tested. 1 map unit = 5 cm (unitMeters in the floor data).
 */
import type { AV, RoomKind } from '../../domain/types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Side = 'top' | 'bottom' | 'left' | 'right';
export interface Wall extends Rect {
  glass: boolean;
}
/** A seat and the direction the person faces (unit vector in plan, +y = south). */
export interface Seat {
  x: number;
  y: number;
  fx: number;
  fy: number;
}
export interface Furniture {
  tables: Rect[];
  seats: Seat[];
  screen: Rect | null;
  stage: Rect | null;
}

export const WALL_T = 3; // 15 cm partitions
export const DOOR_W = 18; // 90 cm door opening
const CLEAR = 6; // space kept free along the walls
const CHAIR_GAP = 7; // chair centre to table edge
const SEAT_PITCH = 12; // 60 cm per person along a table

export function doorSide(room: Rect, door: { x: number; y: number }): Side {
  const d = [
    ['top', Math.abs(door.y - room.y)],
    ['bottom', Math.abs(door.y - (room.y + room.h))],
    ['left', Math.abs(door.x - room.x)],
    ['right', Math.abs(door.x - (room.x + room.w))],
  ] as const;
  return [...d].sort((a, b) => a[1] - b[1])[0]![0];
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/** Four walls inside the room outline; the door side is glass with an opening centred on the door. */
export function roomWalls(room: Rect, door: { x: number; y: number }): Wall[] {
  const T = WALL_T;
  const side = doorSide(room, door);
  const sides: Record<Side, Rect> = {
    top: { x: room.x, y: room.y, w: room.w, h: T },
    bottom: { x: room.x, y: room.y + room.h - T, w: room.w, h: T },
    left: { x: room.x, y: room.y + T, w: T, h: room.h - 2 * T },
    right: { x: room.x + room.w - T, y: room.y + T, w: T, h: room.h - 2 * T },
  };
  const walls: Wall[] = [];
  for (const s of ['top', 'bottom', 'left', 'right'] as const) {
    const r = sides[s];
    if (s !== side) {
      walls.push({ ...r, glass: false });
      continue;
    }
    const horizontal = s === 'top' || s === 'bottom';
    const start = horizontal ? r.x : r.y;
    const len = horizontal ? r.w : r.h;
    const centre = Math.min(Math.max(horizontal ? door.x : door.y, start + DOOR_W / 2), start + len - DOOR_W / 2);
    const gapA = centre - DOOR_W / 2;
    const gapB = centre + DOOR_W / 2;
    const parts: Array<[number, number]> = [
      [start, gapA],
      [gapB, start + len],
    ];
    for (const [a, b] of parts) {
      if (b - a < 1) continue;
      walls.push(horizontal ? { x: a, y: r.y, w: b - a, h: r.h, glass: true } : { x: r.x, y: a, w: r.w, h: b - a, glass: true });
    }
  }
  return walls;
}

function inner(room: Rect): Rect {
  const m = WALL_T + CLEAR;
  return { x: room.x + m, y: room.y + m, w: room.w - 2 * m, h: room.h - 2 * m };
}

/** A screen on the wall opposite the door (rooms with VC or a BYOD dock, training rooms and halls). */
function screenFor(room: Rect, side: Side): Rect {
  const far = OPPOSITE[side];
  const T = WALL_T;
  const horizontal = far === 'top' || far === 'bottom';
  const len = (horizontal ? room.w : room.h) * 0.42;
  if (horizontal) return { x: room.x + room.w / 2 - len / 2, y: far === 'top' ? room.y + T : room.y + room.h - T - 1.5, w: len, h: 1.5 };
  return { x: far === 'left' ? room.x + T : room.x + room.w - T - 1.5, y: room.y + room.h / 2 - len / 2, w: 1.5, h: len };
}

/** Meeting-style table along the room's long side with chairs on both long edges (and the ends if needed). */
function meetingLayout(r: Rect, people: number): Pick<Furniture, 'tables' | 'seats'> {
  const alongX = r.w >= r.h;
  const long = alongX ? r.w : r.h;
  const short = alongX ? r.h : r.w;
  const tableW = Math.max(12, Math.min(24, short - 2 * (CHAIR_GAP + 6)));
  const perSide = Math.max(1, Math.ceil(people / 2));
  const tableL = Math.max(18, Math.min(long - 16, perSide * SEAT_PITCH));
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const table: Rect = alongX
    ? { x: cx - tableL / 2, y: cy - tableW / 2, w: tableL, h: tableW }
    : { x: cx - tableW / 2, y: cy - tableL / 2, w: tableW, h: tableL };
  const fit = Math.max(1, Math.floor(tableL / SEAT_PITCH));
  const seats: Seat[] = [];
  for (const sign of [-1, 1] as const) {
    const count = Math.min(fit, sign === -1 ? Math.ceil(people / 2) : Math.floor(people / 2));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5; // -0.5..0.5 along the table
      const off = tableW / 2 + CHAIR_GAP;
      seats.push(
        alongX
          ? { x: cx + t * tableL, y: cy + sign * off, fx: 0, fy: -sign }
          : { x: cx + sign * off, y: cy + t * tableL, fx: -sign, fy: 0 },
      );
    }
  }
  // Heads of the table when the long sides are full.
  let left = people - seats.length;
  for (const sign of [-1, 1] as const) {
    if (left <= 0) break;
    const off = tableL / 2 + CHAIR_GAP;
    const room = (alongX ? r.w : r.h) / 2 - off;
    if (room < 5) break;
    seats.push(alongX ? { x: cx + sign * off, y: cy, fx: -sign, fy: 0 } : { x: cx, y: cy + sign * off, fx: 0, fy: -sign });
    left--;
  }
  return { tables: [table], seats };
}

/** Rows of two-person desks (training) or plain rows of chairs (halls), all facing the screen wall. */
function rowsLayout(r: Rect, people: number, facing: Side, desks: boolean): Pick<Furniture, 'tables' | 'seats'> {
  const f = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[facing] as [number, number];
  const rowsAlongX = facing === 'top' || facing === 'bottom';
  const width = rowsAlongX ? r.w : r.h; // along a row
  const depth = rowsAlongX ? r.h : r.w; // front to back
  const rowPitch = desks ? 22 : 11;
  const seatPitch = desks ? 13 : 10;
  const front = 16; // space for the screen or stage
  const rows = Math.max(1, Math.floor((depth - front) / rowPitch));
  const perRow = Math.max(1, Math.floor((width - 8) / seatPitch));
  const tables: Rect[] = [];
  const seats: Seat[] = [];
  for (let row = 0; row < rows && seats.length < people; row++) {
    const d = front + row * rowPitch + rowPitch / 2; // distance from the screen wall
    const inRow = Math.min(perRow, people - seats.length);
    const rowLen = inRow * seatPitch;
    for (let i = 0; i < inRow; i++) {
      const a = -rowLen / 2 + (i + 0.5) * seatPitch;
      // Plan position: along = a (centred), back from the facing wall by d.
      const x = rowsAlongX ? r.x + r.w / 2 + a : f[0] < 0 ? r.x + d : r.x + r.w - d;
      const y = rowsAlongX ? (f[1] < 0 ? r.y + d : r.y + r.h - d) : r.y + r.h / 2 + a;
      seats.push({ x, y, fx: f[0], fy: f[1] });
    }
    if (desks) {
      const deskD = 8;
      const dd = d - 7; // desk in front of the chairs
      tables.push(
        rowsAlongX
          ? { x: r.x + r.w / 2 - rowLen / 2, y: (f[1] < 0 ? r.y + dd : r.y + r.h - dd) - deskD / 2, w: rowLen, h: deskD }
          : { x: (f[0] < 0 ? r.x + dd : r.x + r.w - dd) - deskD / 2, y: r.y + r.h / 2 - rowLen / 2, w: deskD, h: rowLen },
      );
    }
  }
  return { tables, seats };
}

/** Furniture for one room, never more seats than its capacity (demo value when the real one is unknown). */
export function roomFurniture(room: Rect, door: { x: number; y: number }, kind: RoomKind, capacity: number | null, av: AV): Furniture {
  const side = doorSide(room, door);
  const r = inner(room);
  const cap = capacity ?? 4;
  const screen = av || kind === 'Training' || kind === 'Multi-purpose' ? screenFor(room, side) : null;
  if (kind === 'Training') return { ...rowsLayout(r, Math.min(cap, 30), OPPOSITE[side], true), screen, stage: null };
  if (kind === 'Multi-purpose') {
    const far = OPPOSITE[side];
    const horizontal = far === 'top' || far === 'bottom';
    const stage: Rect = horizontal
      ? { x: r.x + r.w * 0.2, y: far === 'top' ? r.y : r.y + r.h - 10, w: r.w * 0.6, h: 10 }
      : { x: far === 'left' ? r.x : r.x + r.w - 10, y: r.y + r.h * 0.2, w: 10, h: r.h * 0.6 };
    return { ...rowsLayout(r, Math.min(cap, 60), far, false), screen, stage };
  }
  // A lactation room holds one or two people, not a meeting table.
  if (kind === 'Lactation Room') return { ...meetingLayout(r, Math.min(capacity ?? 2, 2)), screen: null, stage: null };
  return { ...meetingLayout(r, Math.min(cap, 14)), screen, stage: null };
}
