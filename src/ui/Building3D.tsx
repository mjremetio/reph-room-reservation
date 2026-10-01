'use client';

/**
 * 3D view of Bldg. H (docs/spec/06-ui.md S6 and 07 Rendering): the realistic cutaway model from
 * ./building3d/Scene plus room labels as real buttons, which stay sharp, follow their rooms and can be
 * reached with the keyboard. Lazy-loaded (next/dynamic) so three.js stays out of the initial bundle.
 */
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import type { RoomView } from './api';
import { Scene, FLOOR_GAP, SLAB_T, VIEW, WALL_H, wx, wz, type Shared } from './building3d/Scene';
import { FLOORS, TurnButtons } from './FloorMap';
import { reservedBy, STATE_WORDS, type RoomState, type RoomStatus } from './roomStates';

export default function Building3D({
  floor,
  rooms,
  statuses,
  selectedRoomId,
  highlight = null,
  onOpen,
}: {
  floor: string;
  rooms: Map<string, RoomView>;
  statuses: Map<string, RoomStatus>;
  selectedRoomId: string | null;
  /** Legend highlight: labels of rooms in other states fade. */
  highlight?: RoomState | null;
  onOpen: (roomId: string) => void;
}) {
  const activeIndex = Math.max(0, FLOORS.findIndex((f) => f.floor === floor));
  const shared = useMemo<Shared>(() => {
    const anchors: Shared['anchors'] = new Map();
    FLOORS.forEach((f, i) => {
      for (const s of f.rooms.filter((r) => !r.unplaced)) anchors.set(s.roomId, { floor: i, x: wx(s.x + s.w / 2), z: wz(s.y + s.h / 2), y: SLAB_T + WALL_H + 0.05 });
    });
    return {
      floorY: FLOORS.map((_, i) => i * FLOOR_GAP),
      hovered: null,
      labels: new Map(),
      anchors,
      invalidate: null,
      turn: null,
      spin: null,
      onSpin: null,
      resetView: null,
      compass: null,
    };
  }, []);
  // The 360° button shows whether the building is spinning; a drag in the view stops it.
  const [spinning, setSpinning] = useState(false);
  useEffect(() => {
    shared.onSpin = setSpinning;
    return () => {
      shared.onSpin = null;
    };
  }, [shared]);

  // Labels for the active floor; rooms that can't host the request stay unlabelled to keep the view calm.
  const active = FLOORS[activeIndex];
  const labels = (active?.rooms ?? [])
    .filter((s) => !s.unplaced)
    .map((s) => ({ room: rooms.get(s.roomId), status: statuses.get(s.roomId) }))
    .filter((l): l is { room: RoomView; status: RoomStatus | undefined } => !!l.room && l.status?.state !== 'unsuitable');

  useEffect(() => {
    shared.invalidate?.();
  }, [shared, activeIndex, statuses, selectedRoomId]);

  const fits = [...statuses.values()].filter((s) => s.state === 'fits').length;

  return (
    <div
      className="building3d"
      onKeyDown={(e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'r' || e.key === 'R') shared.turn?.(e.shiftKey ? -1 : 1);
        else if (e.key === 's' || e.key === 'S') shared.spin?.(!spinning);
        else if (e.key === '0') shared.resetView?.();
      }}
    >
      <Canvas
        frameloop="demand"
        shadows="soft"
        dpr={[1, 1.5]}
        camera={{ position: [2.6 * VIEW, 6.9 * VIEW + activeIndex * FLOOR_GAP, 7.1 * VIEW], fov: 34, near: 0.1, far: 80 * VIEW }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMappingExposure: 0.92 }}
        aria-label={`3D model of Bldg. H, ${floor} in front${fits ? `, ${fits} rooms fit` : ''}. Room labels are buttons; the 2D map and the list work without a pointer.`}
        role="img"
        fallback={<p className="building3d__fallback">3D view needs WebGL, which this browser can&apos;t use. Switch back to 2D.</p>}
      >
        <Scene floors={FLOORS} activeIndex={activeIndex} rooms={rooms} statuses={statuses} selectedRoomId={selectedRoomId} shared={shared} onOpen={onOpen} />
      </Canvas>

      <div className="b3d-labels" data-highlight={highlight ?? undefined}>
        {labels.map(({ room, status }) => {
          const state = status?.state ?? 'free';
          const rank = status?.rank && status.rank <= 3 && state === 'fits' ? status.rank : null;
          const who = reservedBy(status);
          return (
            <button
              key={room.id}
              ref={(el) => {
                if (el) shared.labels.set(room.id, el);
                else shared.labels.delete(room.id);
              }}
              className={`b3d-label b3d-label--${state}${selectedRoomId === room.id ? ' is-selected' : ''}`}
              style={{ visibility: 'hidden' }}
              onClick={() => onOpen(room.id)}
              onMouseEnter={() => {
                shared.hovered = room.id;
                shared.invalidate?.();
              }}
              onMouseLeave={() => {
                if (shared.hovered === room.id) shared.hovered = null;
                shared.invalidate?.();
              }}
              onFocus={() => {
                shared.hovered = room.id;
                shared.invalidate?.();
              }}
              onBlur={() => {
                if (shared.hovered === room.id) shared.hovered = null;
                shared.invalidate?.();
              }}
              aria-label={`${room.name}, ${room.floor}, ${room.capacity ? `seats ${room.capacity}, ` : ''}${STATE_WORDS[state]}${rank ? `, rank ${rank}` : ''}${who ? `, reserved by ${who.full}` : ''}`}
            >
              <span className="b3d-label__row">
                {rank ? <span className="b3d-label__rank">{rank}</span> : <span className="b3d-label__dot" aria-hidden />}
                <span>{room.name}</span>
                {room.capacity ? <span className="b3d-label__seats">{room.capacity}</span> : null}
              </span>
              {who && <span className="b3d-label__owner">{who.short}</span>}
            </button>
          );
        })}
      </div>

      <div className="map-zoom" role="group" aria-label="Turn">
        <TurnButtons onTurn={(dir) => shared.turn?.(dir)} />
        <button
          type="button"
          className={`b3d-spin${spinning ? ' is-on' : ''}`}
          aria-pressed={spinning}
          onClick={() => shared.spin?.(!spinning)}
          aria-label={spinning ? 'Stop turning' : 'Turn all the way round'}
          title={spinning ? 'Stop turning (S)' : 'Turn 360° (S)'}
        >
          360°
        </button>
        <button type="button" onClick={() => shared.resetView?.()} aria-label="Back to the start view" title="Back to the start view (0). The arrow points to the top of the 2D plan.">
          <span
            className="b3d-compass"
            ref={(el) => {
              shared.compass = el;
            }}
            aria-hidden
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M9 1.5l3 7.5H6z" fill="var(--red)" />
              <path d="M9 16.5l-3-7.5h6z" fill="currentColor" opacity="0.45" />
            </svg>
          </span>
        </button>
      </div>

      <div className="building3d__hint" aria-hidden>
        Drag to turn 360° · Shift- or right-drag to move · scroll to zoom
      </div>
    </div>
  );
}
