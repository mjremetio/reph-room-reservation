'use client';

/**
 * SVG floor map from data/floors/*.json (docs/spec/07-map-routing.md, Rendering; 06 Room states): the floor plate,
 * every room and area from the appendix layouts (offices, core, service rooms, amenities), workstations with
 * their chairs, and the bookable rooms on top, coloured by state. Only bookable rooms are interactive.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MANILA_BLDG_H } from '../data/floorPlans';
import type { Area, FloorData, RoomShape } from '../domain/routing';
import type { RoomView } from './api';
import { roomFurniture } from './building3d/layout';
import { corners, floorFurniture, type Piece } from './floorLayout';
import { fmtSpan } from './format';
import { fitView, MAX_ZOOM, panBy, rotatedBox, turnTransform, turnView, viewBoxOf, zoomAt, ZOOM_STEP, type Box, type View } from './mapZoom';
import { reservedBy, STATE_WORDS, type RoomState, type RoomStatus } from './roomStates';

export const FLOORS: FloorData[] = MANILA_BLDG_H.floors;
const floorData = (floor: string) => FLOORS.find((f) => f.floor === floor) ?? (FLOORS[0] as FloorData);

const CHAR_WIDTH = 0.47; // Barlow Condensed semibold, em per character (approximate)
const SUB_SIZE = 13;
const CHAIR_R = 4.2;

/**
 * Largest font (max → min map units, times the floor's text scale) at which the text fits on one or two lines;
 * null = too small, hide the label.
 */
function fitLabel(name: string, w: number, h: number, k: number, max = 17, min = 13): { lines: string[]; size: number } | null {
  const words = name.split(' ');
  const options: string[][] = [[name]];
  for (let i = 1; i < words.length; i++) options.push([words.slice(0, i).join(' '), words.slice(i).join(' ')]);
  for (let step = max; step >= min; step--) {
    const size = step * k;
    const fits = options
      .filter((lines) => lines.every((l) => l.length * size * CHAR_WIDTH <= w - 8 * k) && lines.length * size * 1.05 <= h - 8 * k)
      .sort((a, b) => a.length - b.length || Math.max(...a.map((l) => l.length)) - Math.max(...b.map((l) => l.length)));
    if (fits[0]) return { lines: fits[0], size };
  }
  return null;
}

/**
 * Keeps text upright on a turned plan: the rectangle as it looks on screen (width and height swap on a quarter
 * turn) and the counter-turn around its centre for the text drawn in it.
 */
function upright(x: number, y: number, w: number, h: number, angle: number) {
  const [ux, uy, uw, uh] = rotatedBox([x, y, w, h], angle);
  return { x: ux, y: uy, w: uw, h: uh, transform: angle ? `rotate(${-angle} ${x + w / 2} ${y + h / 2})` : undefined };
}

const rectPath = (p: Piece) => `M${corners(p).map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
const circlePath = (x: number, y: number, r: number) => `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** Plan symbols: treads for stairs, a cross for a lift car. */
function symbolPath(a: Area): string {
  if (a.kind === 'lift') return `M${a.x + 3} ${a.y + 3}L${a.x + a.w - 3} ${a.y + a.h - 3}M${a.x + a.w - 3} ${a.y + 3}L${a.x + 3} ${a.y + a.h - 3}`;
  if (a.kind !== 'stairs') return '';
  const alongX = a.w >= a.h;
  const len = alongX ? a.w : a.h;
  let d = '';
  for (let t = 8; t < len - 4; t += 8) d += alongX ? `M${a.x + t} ${a.y + 3}V${a.y + a.h - 3}` : `M${a.x + 3} ${a.y + t}H${a.x + a.w - 3}`;
  return d;
}

/** Walls, fills and plan symbols for everything that is not a bookable room. */
function AreaShapes({ areas }: { areas: Area[] }) {
  return (
    <g className="areas" aria-hidden>
      {areas.map((a, i) => (a.kind === 'open' ? null : <rect key={i} className={`area area--${a.kind}`} x={a.x} y={a.y} width={a.w} height={a.h} />))}
      <path className="area-symbols" d={areas.map(symbolPath).join('')} />
    </g>
  );
}

/** Generic names the colour and the legend's Key already say; only specific names are written on the plan. */
const UNLABELLED = new Set(['Office', 'Service room', 'Room', 'Workstations']);

/** Their names, drawn above the furniture. */
function AreaLabels({ areas, k, angle }: { areas: Area[]; k: number; angle: number }) {
  return (
    <g aria-hidden>
      {areas.map((a, i) => {
        if (a.kind === 'core' || a.kind === 'lift' || UNLABELLED.has(a.label)) return null;
        const u = upright(a.x, a.y, a.w, a.h, angle);
        // Open-area labels are spaced capitals: about a third wider than the estimate.
        const label = fitLabel(a.label, a.kind === 'open' ? u.w * 0.72 : u.w, u.h, k, a.kind === 'open' ? 12 : 10, 6);
        if (!label) return null;
        const lineH = label.size * 1.05;
        const top = u.y + u.h / 2 - (label.lines.length * lineH) / 2;
        return (
          <text key={i} className={`area-label area-label--${a.kind}`} fontSize={label.size} textAnchor="middle" transform={u.transform}>
            {label.lines.map((line, j) => (
              <tspan key={j} x={u.x + u.w / 2} y={top + j * lineH + label.size * 0.8}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </g>
  );
}

function ariaLabel(room: RoomView, status: RoomStatus | undefined, slot: { start: Date; end: Date }): string {
  const bits = [`${room.name}, ${room.floor}`, `${room.kind.toLowerCase()} room`, room.capacity ? `seats ${room.capacity}` : 'capacity not on file'];
  if (status) {
    bits.push(STATE_WORDS[status.state]);
    if (status.state === 'fits' || status.state === 'free') bits.push(`free ${fmtSpan(slot.start, slot.end).replace('–', ' to ')}`);
    if (status.rank) bits.push(`rank ${status.rank}`);
    const who = reservedBy(status);
    if (who) bits.push(`reserved by ${who.full}`);
  }
  return bits.join(', ');
}

function StateIcon({ status, x, y }: { status: RoomStatus; x: number; y: number }) {
  if (status.state === 'free' || status.state === 'fits') {
    // Green dot: the second cue for "free" (red rooms are hatched, partly free ones carry a half clock).
    return <circle cx={x} cy={y} r="5" fill="var(--green)" stroke="var(--surface)" strokeWidth="1.5" aria-hidden />;
  }
  if (status.state === 'yours') {
    return <path d={`M${x - 6} ${y}l4 4 8-9`} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden />;
  }
  if (status.state === 'partial') {
    // Half-filled clock: the second cue for "partly free".
    return (
      <g aria-hidden>
        <circle cx={x} cy={y} r="7" fill="var(--surface)" stroke="var(--orange)" strokeWidth="1.5" />
        <path d={`M${x} ${y - 7}A7 7 0 0 1 ${x} ${y + 7}Z`} fill="var(--orange)" />
      </g>
    );
  }
  return null;
}

function Room({
  shape,
  door,
  room,
  status,
  selected,
  slot,
  k,
  angle,
  onOpen,
}: {
  shape: RoomShape;
  door: { x: number; y: number } | undefined;
  room: RoomView;
  status?: RoomStatus;
  selected: boolean;
  slot: { start: Date; end: Date };
  /** Text scale of this floor (map units per 940-wide plan). */
  k: number;
  /** The plan's turn; the name, icon and badge stay upright. */
  angle: number;
  onOpen: (roomId: string) => void;
}) {
  const { x, y, w, h } = shape;
  const u = upright(x, y, w, h, angle);
  const state = status?.state ?? 'free';
  // Second line: who has the room at this time, otherwise the capacity. Shrinks to fit, hidden below 9 units.
  const who = reservedBy(status);
  const subText = who ? who.short : room.capacity ? `seats ${room.capacity}` : null;
  const subSize = subText ? Math.min(SUB_SIZE * k, (u.w - 10) / (subText.length * 0.5)) : 0;
  const withSub = subText && subSize >= 9 * k ? fitLabel(room.name, u.w, u.h - subSize - 4, k) : null;
  // Small rooms on the traced plan still get their name, smaller, or its first word ("Lactation").
  const label = withSub && u.h >= 50 * k ? withSub : (fitLabel(room.name, u.w, u.h, k, 17, 7) ?? fitLabel(room.name.split(' ')[0] ?? room.name, u.w, u.h, k, 12, 4));
  const showSub = !!(withSub && u.h >= 50 * k && label === withSub);
  // The room's own table and chairs, faint under the label (same layout as the 3D model).
  const furniture = useMemo(() => {
    const f = roomFurniture(shape, door ?? { x: x + w / 2, y: y + h }, room.kind, room.capacity, room.av);
    return {
      tables: f.tables.map((t) => `M${t.x} ${t.y}h${t.w}v${t.h}h${-t.w}Z`).join(''),
      chairs: f.seats.map((c) => circlePath(c.x, c.y, CHAIR_R * 0.8)).join(''),
    };
  }, [shape, door, room.kind, room.capacity, room.av, x, y, w, h]);
  const lineH = label ? label.size * 1.05 : 0;
  const blockH = label ? label.lines.length * lineH + (showSub ? subSize + 4 : 0) : 0;
  const top = u.y + u.h / 2 - blockH / 2;
  return (
    <g
      className={`room room--${state}${selected ? ' room--selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel(room, status, slot)}
      aria-pressed={selected}
      onClick={() => onOpen(room.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(room.id);
        }
      }}
    >
      <rect className={`shape${shape.unplaced ? ' shape--unplaced' : ''}`} x={x} y={y} width={w} height={h} rx="3" />
      <path className="room__furn" d={furniture.tables} />
      <path className="room__chairs" d={furniture.chairs} />
      <rect className="focus-ring" x={x - 4} y={y - 4} width={w + 8} height={h + 8} rx="6" />
      <g transform={u.transform}>
        {label?.lines.map((line, i) => (
          <text key={i} className="label" x={u.x + u.w / 2} y={top + i * lineH + label.size * 0.8} fontSize={label.size} textAnchor="middle">
            {line}
          </text>
        ))}
        {showSub && (
          <text className={`sub${who ? ' sub--owner' : ''}`} x={u.x + u.w / 2} y={top + blockH - 2} fontSize={subSize} textAnchor="middle">
            {subText}
          </text>
        )}
        {status && <StateIcon status={status} x={u.x + 14} y={u.y + 14} />}
        {status?.rank && status.rank <= 3 && state === 'fits' && (
          <g transform={`translate(${u.x + u.w - 14 * k} ${u.y + 14 * k}) scale(${k})`} aria-hidden>
            <g className="badge">
              <circle cx={0} cy={0} r="11" />
              <text x={0} y={5} textAnchor="middle">
                {status.rank}
              </text>
            </g>
          </g>
        )}
      </g>
    </g>
  );
}

export function FloorMap({
  floor,
  rooms,
  statuses,
  selectedRoomId,
  slot,
  highlight = null,
  onOpen,
}: {
  floor: string;
  rooms: Map<string, RoomView>;
  statuses: Map<string, RoomStatus>;
  selectedRoomId: string | null;
  slot: { start: Date; end: Date };
  /** Legend highlight: rooms in other states fade. */
  highlight?: RoomState | null;
  onOpen: (roomId: string) => void;
}) {
  const f = floorData(floor);
  const [vx, vy, vw, vh] = f.viewBox;
  const k = vw / 940;
  const nodes = new Map(f.nodes.map((n) => [n.id, n] as const));
  const lobby = nodes.get(f.liftLobby);
  // Reading order for keyboard users: top to bottom, then left to right.
  const shapes = [...f.rooms].sort((a, b) => a.y - b.y || a.x - b.x);
  const unplaced = f.rooms.filter((r) => r.unplaced);
  const furniture = useMemo(() => {
    const ff = floorFurniture(f.furniture);
    return {
      desks: ff.desks.map(rectPath).join(''),
      tables: ff.tables.map((t) => (t.round ? circlePath(t.cx, t.cy, t.w / 2) : rectPath(t))).join(''),
      chairs: ff.chairs.map((c) => circlePath(c.x, c.y, CHAIR_R)).join(''),
    };
  }, [f]);

  // Zoom, pan and turn (mapZoom.ts): wheel at the pointer, drag once zoomed, pinch, the buttons and + − 0 R keys.
  const box: Box = [vx, vy, vw, vh];
  const [view, setView] = useState<View>(() => fitView(box));
  const svgRef = useRef<SVGSVGElement>(null);
  const live = useRef({ view, box });
  live.current = { view, box };
  const gesture = useRef({ pointers: new Map<number, { x: number; y: number }>(), start: { x: 0, y: 0 }, pinch: 0, moved: false, suppressClick: false });
  useEffect(() => setView((v) => fitView(live.current.box, v.angle)), [floor]);
  const toMap = (x: number, y: number) => {
    const m = svgRef.current?.getScreenCTM();
    return m ? new DOMPoint(x, y).matrixTransform(m.inverse()) : null;
  };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      // Scrolling down on the whole floor scrolls the page as usual.
      if (e.deltaY > 0 && live.current.view.zoom <= 1) return;
      e.preventDefault();
      const p = toMap(e.clientX, e.clientY);
      if (p) setView((v) => zoomAt(v, Math.exp(-e.deltaY * 0.0015), p.x, p.y, live.current.box));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);
  const zoomBy = (factor: number) => setView((v) => zoomAt(v, factor, v.cx, v.cy, box));
  const ARROWS: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  const turnBy = (dir: 1 | -1) => setView((v) => turnView(v, dir, box));
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave the browser's own shortcuts alone
    const arrow = ARROWS[e.key];
    if (e.key === 'r' || e.key === 'R') turnBy(e.shiftKey ? -1 : 1);
    else if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / ZOOM_STEP);
    else if (e.key === '0') setView(fitView(box));
    else if (arrow && view.zoom > 1) {
      setView((v) => {
        const [, , w, h] = viewBoxOf(v, box);
        return panBy(v, (arrow[0] * w) / 8, (arrow[1] * h) / 8, box); // an eighth of the view
      });
    } else return;
    e.preventDefault();
  };
  const [x0, y0, w0, h0] = viewBoxOf(view, box);
  const unplacedBox = unplaced.length
    ? (() => {
        const x = Math.min(...unplaced.map((r) => r.x));
        const y = Math.min(...unplaced.map((r) => r.y));
        return upright(x, y, Math.max(...unplaced.map((r) => r.x + r.w)) - x, Math.max(...unplaced.map((r) => r.y + r.h)) - y, view.angle);
      })()
    : null;

  return (
    <div className="floormap-wrap" onKeyDown={onKeyDown}>
    <svg
      ref={svgRef}
      className={`floormap${view.zoom > 1 ? ' is-zoomed' : ''}`}
      viewBox={`${x0} ${y0} ${w0} ${h0}`}
      role="group"
      aria-label={`Floor map, ${floor}, Bldg. H`}
      data-highlight={highlight ?? undefined}
      // Whole floor: one finger scrolls the page and two fingers zoom the map. Zoomed: one finger pans.
      style={{ touchAction: view.zoom > 1 ? 'none' : 'pan-x pan-y' }}
      onPointerDown={(e) => {
        const g = gesture.current;
        g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        g.start = { x: e.clientX, y: e.clientY };
        g.moved = false;
        g.suppressClick = false;
        g.pinch = 0;
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        const prev = g.pointers.get(e.pointerId);
        if (!prev) return;
        const cur = { x: e.clientX, y: e.clientY };
        g.pointers.set(e.pointerId, cur);
        if (g.pointers.size >= 2) {
          const [a, b] = [...g.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const mid = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
          if (g.pinch && mid) setView((v) => zoomAt(v, d / g.pinch, mid.x, mid.y, box));
          g.pinch = d;
          g.moved = true;
          return;
        }
        if (!g.moved && Math.hypot(cur.x - g.start.x, cur.y - g.start.y) < 5) return; // still a click
        if (live.current.view.zoom <= 1) return; // nothing to pan
        if (!g.moved) {
          g.moved = true;
          svgRef.current?.setPointerCapture(e.pointerId);
        }
        const m = svgRef.current?.getScreenCTM();
        if (m) setView((v) => panBy(v, (cur.x - prev.x) / m.a, (cur.y - prev.y) / m.d, box));
      }}
      onPointerUp={(e) => {
        const g = gesture.current;
        g.pointers.delete(e.pointerId);
        if (g.moved) g.suppressClick = true; // a drag or pinch is not a click on a room
      }}
      onPointerCancel={(e) => gesture.current.pointers.delete(e.pointerId)}
      onClickCapture={(e) => {
        if (!gesture.current.suppressClick) return;
        gesture.current.suppressClick = false;
        e.stopPropagation();
      }}
    >
      <defs>
        <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="var(--red-tint)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--red-hatch)" strokeWidth="3" />
        </pattern>
      </defs>
      <g key={floor} className="floor-layer" transform={turnTransform(view, box)}>
        <path className="plate" d={`M${f.outline.map(([x, y]) => `${x} ${y}`).join('L')}Z`} />
        <AreaShapes areas={f.areas} />
        <g className="furniture" aria-hidden>
          <path className="furniture__desks" d={furniture.desks} />
          <path className="furniture__tables" d={furniture.tables} />
          <path className="furniture__chairs" d={furniture.chairs} />
        </g>
        <AreaLabels areas={f.areas} k={k} angle={view.angle} />
        {unplacedBox && (
          <g className="unplaced" aria-hidden transform={unplacedBox.transform}>
            <text x={unplacedBox.x} y={unplacedBox.y - 8 * k} fontSize={11 * k}>
              Location to confirm
            </text>
          </g>
        )}
        {shapes.map((shape) => {
          const room = rooms.get(shape.roomId);
          if (!room) return null;
          return (
            <Room
              key={shape.roomId}
              shape={shape}
              door={nodes.get(shape.door)}
              room={room}
              status={statuses.get(shape.roomId)}
              selected={selectedRoomId === shape.roomId}
              slot={slot}
              k={k}
              angle={view.angle}
              onOpen={onOpen}
            />
          );
        })}
        {lobby && (
          <g className="you-marker" aria-label={`You are here: ${lobby.label ?? 'lift lobby'}`} transform={`translate(${lobby.x} ${lobby.y}) rotate(${-view.angle}) scale(${k})`}>
            <circle className="halo" cx={0} cy={0} r="14" />
            <circle cx={0} cy={0} r="6" />
            <text x={18} y={4}>
              You
            </text>
          </g>
        )}
      </g>
    </svg>
      <div className="map-zoom" role="group" aria-label="Zoom and turn">
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)} disabled={view.zoom >= MAX_ZOOM} aria-label="Zoom in" title="Zoom in (+)">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={view.zoom <= 1} aria-label="Zoom out" title="Zoom out (−)">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <TurnButtons onTurn={turnBy} />
        <button type="button" onClick={() => setView(fitView(box))} disabled={view.zoom <= 1 && !view.angle} aria-label="Fit the whole floor" title="Whole floor (0)">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Turn left and Turn right, shared by the 2D map (a quarter turn) and the 3D view (an eighth). */
export function TurnButtons({ onTurn }: { onTurn: (dir: 1 | -1) => void }) {
  return (
    <>
      <button type="button" onClick={() => onTurn(-1)} aria-label="Turn left" title="Turn left (Shift+R)">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path d="M1 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L1 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" onClick={() => onTurn(1)} aria-label="Turn right" title="Turn right (R)">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path d="M23 4v6h-6M20.5 15a9 9 0 1 1-2.1-9.4L23 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </>
  );
}
