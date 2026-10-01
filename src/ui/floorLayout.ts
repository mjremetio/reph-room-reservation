/**
 * Expands a floor's furniture items (data/floors/*.json) into desks, tables and chairs for the 2D map and the
 * 3D model (docs/spec/07-map-routing.md, Furniture). Pure and in map units (1 unit = 5 cm), so it is unit tested.
 */
import type { FurnitureItem } from '../domain/routing';
import type { Seat } from './building3d/layout';

/** A rectangle given by its centre, size and rotation (radians, clockwise in plan). */
export interface Piece {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
}
export interface Table extends Piece {
  round: boolean;
}
export interface FloorFurniture {
  desks: Piece[];
  tables: Table[];
  chairs: Seat[];
}

const CHAIR_GAP = 6; // chair centre to desk edge (30 cm)
const INSET = 3; // diagonal bands stay this far inside their box

function bench(f: Extract<FurnitureItem, { t: 'bench' }>, out: FloorFurniture) {
  const rows = f.double ? 2 : 1;
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < f.n; i++) {
      if (f.along === 'x') {
        const w = f.w / f.n;
        const h = f.h / rows;
        const cx = f.x + (i + 0.5) * w;
        const cy = f.y + (row + 0.5) * h;
        out.desks.push({ cx, cy, w: w - 1, h: h - 0.6, angle: 0 });
        // Back-to-back: the first row's chairs above, the second's below (a single row: below).
        const up = f.double && row === 0;
        out.chairs.push({ x: cx, y: up ? f.y - CHAIR_GAP : f.y + f.h + CHAIR_GAP, fx: 0, fy: up ? 1 : -1 });
      } else {
        const w = f.w / rows;
        const h = f.h / f.n;
        const cx = f.x + (row + 0.5) * w;
        const cy = f.y + (i + 0.5) * h;
        out.desks.push({ cx, cy, w: w - 0.6, h: h - 1, angle: 0 });
        const left = f.double && row === 0;
        out.chairs.push({ x: left ? f.x - CHAIR_GAP : f.x + f.w + CHAIR_GAP, y: cy, fx: left ? 1 : -1, fy: 0 });
      }
    }
  }
}

/** Parallel bands of back-to-back desks at an angle, clipped to the box: the layout's herringbone areas. */
function diagonal(f: Extract<FurnitureItem, { t: 'diagonal' }>, out: FloorFurniture) {
  const a = (f.angle * Math.PI) / 180;
  const u = [Math.cos(a), Math.sin(a)] as const; // along the band
  const v = [-Math.sin(a), Math.cos(a)] as const; // across it
  const depth = f.desk * 0.55;
  const cx0 = f.x + f.w / 2;
  const cy0 = f.y + f.h / 2;
  const reach = Math.hypot(f.w, f.h) / 2;
  const inside = (x: number, y: number, m: number) => x >= f.x + m && x <= f.x + f.w - m && y >= f.y + m && y <= f.y + f.h - m;
  for (let k = -Math.ceil(reach / f.pitch); k <= Math.ceil(reach / f.pitch); k++) {
    for (let s = -Math.ceil(reach / f.desk); s <= Math.ceil(reach / f.desk); s++) {
      const bx = cx0 + v[0] * k * f.pitch + u[0] * s * f.desk;
      const by = cy0 + v[1] * k * f.pitch + u[1] * s * f.desk;
      for (const side of [-1, 1] as const) {
        const dx = bx + v[0] * side * (depth / 2);
        const dy = by + v[1] * side * (depth / 2);
        const chx = bx + v[0] * side * (depth + CHAIR_GAP);
        const chy = by + v[1] * side * (depth + CHAIR_GAP);
        if (!inside(dx, dy, INSET + f.desk / 2) || !inside(chx, chy, INSET)) continue;
        out.desks.push({ cx: dx, cy: dy, w: f.desk - 1.2, h: depth - 0.6, angle: a });
        out.chairs.push({ x: chx, y: chy, fx: -v[0] * side, fy: -v[1] * side });
      }
    }
  }
}

function table(f: Extract<FurnitureItem, { t: 'table' }>, out: FloorFurniture) {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  out.tables.push({ cx, cy, w: f.w, h: f.h, angle: 0, round: !!f.round });
  if (f.round) {
    const r = Math.max(f.w, f.h) / 2 + CHAIR_GAP;
    for (let i = 0; i < f.seats; i++) {
      const t = (i / f.seats) * Math.PI * 2 - Math.PI / 2;
      out.chairs.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r, fx: -Math.cos(t), fy: -Math.sin(t) });
    }
    return;
  }
  // Chairs along the two long sides (the second side takes the odd one out).
  const alongX = f.w >= f.h;
  const long = alongX ? f.w : f.h;
  for (const side of [-1, 1] as const) {
    const count = side === -1 ? Math.floor(f.seats / 2) : Math.ceil(f.seats / 2);
    for (let i = 0; i < count; i++) {
      const t = ((i + 0.5) / count - 0.5) * long;
      const off = (alongX ? f.h : f.w) / 2 + CHAIR_GAP;
      out.chairs.push(alongX ? { x: cx + t, y: cy + side * off, fx: 0, fy: -side } : { x: cx + side * off, y: cy + t, fx: -side, fy: 0 });
    }
  }
}

function desk(f: Extract<FurnitureItem, { t: 'desk' }>, out: FloorFurniture) {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  out.desks.push({ cx, cy, w: f.w, h: f.h, angle: 0 });
  const [fx, fy] = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] }[f.chair];
  const x = f.chair === 'e' ? f.x + f.w + CHAIR_GAP : f.chair === 'w' ? f.x - CHAIR_GAP : cx;
  const y = f.chair === 's' ? f.y + f.h + CHAIR_GAP : f.chair === 'n' ? f.y - CHAIR_GAP : cy;
  out.chairs.push({ x, y, fx: fx as number, fy: fy as number });
}

export function floorFurniture(items: FurnitureItem[]): FloorFurniture {
  const out: FloorFurniture = { desks: [], tables: [], chairs: [] };
  for (const f of items) {
    if (f.t === 'bench') bench(f, out);
    else if (f.t === 'diagonal') diagonal(f, out);
    else if (f.t === 'table') table(f, out);
    else desk(f, out);
  }
  return out;
}

/** The four corners of a piece, for drawing it as a polygon. */
export function corners(p: Piece): Array<[number, number]> {
  const c = Math.cos(p.angle);
  const s = Math.sin(p.angle);
  return [
    [-p.w / 2, -p.h / 2],
    [p.w / 2, -p.h / 2],
    [p.w / 2, p.h / 2],
    [-p.w / 2, p.h / 2],
  ].map(([x, y]) => [p.cx + (x as number) * c - (y as number) * s, p.cy + (x as number) * s + (y as number) * c]);
}
