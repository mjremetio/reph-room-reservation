'use client';

/**
 * Map legend (docs/spec/06-ui.md, Legend), under the 2D and 3D views.
 * Room status: one button per state with the map's own swatch and cue (rank badge, half clock, check) and how many
 * rooms on this floor are in it. Hover or focus previews those rooms on the map; a click keeps them highlighted
 * (click again to clear).
 * Key (a toggle, closed by default): everything else on the traced layout, drawn with the map's CSS classes.
 */
import { useState, type ReactNode } from 'react';
import type { RoomState } from './roomStates';

const STATES: Array<{ state: RoomState; label: string; hint: string }> = [
  { state: 'fits', label: 'Fits', hint: 'Free for the whole time and big enough; numbers are the best three' },
  { state: 'yours', label: 'Yours', hint: 'Booked by you at this time' },
  { state: 'partial', label: 'Partly free', hint: 'Free for part of the time' },
  { state: 'taken', label: 'Taken', hint: "Someone else's booking at this time" },
  { state: 'free', label: 'Free', hint: 'Free at this time' },
  { state: 'unsuitable', label: 'Not suitable', hint: 'Wrong type or too small for the request' },
];

const SWATCH: Record<RoomState, { fill: string; stroke: string; dash?: string; width: number }> = {
  fits: { fill: 'var(--green-fill)', stroke: 'var(--green)', width: 2 },
  yours: { fill: 'var(--blue)', stroke: 'var(--blue)', width: 2 },
  partial: { fill: 'var(--orange-tint)', stroke: 'var(--orange)', width: 2 },
  taken: { fill: 'url(#legend-hatch)', stroke: 'var(--red)', width: 1.5 },
  free: { fill: 'var(--green-tint)', stroke: 'var(--green)', width: 1.5 },
  unsuitable: { fill: 'var(--plate)', stroke: 'var(--line)', dash: '3 2', width: 1 },
};

/** The small cue each state carries on the map, drawn on its swatch. */
function Cue({ state }: { state: RoomState }) {
  if (state === 'fits') {
    return (
      <g>
        <circle cx="21" cy="5" r="5" fill="var(--green)" />
        <text x="21" y="7.6" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">
          1
        </text>
      </g>
    );
  }
  if (state === 'free') return <circle cx="7" cy="8" r="3.5" fill="var(--green)" />;
  if (state === 'yours') return <path d="M5 9l3 3 6-7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />;
  if (state === 'partial') {
    return (
      <g>
        <circle cx="7" cy="8" r="4" fill="var(--surface)" stroke="var(--orange)" strokeWidth="1.2" />
        <path d="M7 4A4 4 0 0 1 7 12Z" fill="var(--orange)" />
      </g>
    );
  }
  return null;
}

function PlanItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="legend__item legend__item--plan">
      <svg width="26" height="16" viewBox="0 0 26 16" aria-hidden>
        {children}
      </svg>
      {label}
    </span>
  );
}

export function MapLegend({
  counts,
  pinned,
  onPin,
  onPreview,
}: {
  /** Rooms per state on the floor shown; undefined while loading. */
  counts: Partial<Record<RoomState, number>> | undefined;
  /** The state kept highlighted by a click. */
  pinned: RoomState | null;
  onPin: (state: RoomState | null) => void;
  /** Hover and focus preview; null when the pointer or focus leaves. */
  onPreview: (state: RoomState | null) => void;
}) {
  const [keyOpen, setKeyOpen] = useState(false);
  return (
    <div className="legend">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <pattern id="legend-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--red-tint)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--red-hatch)" strokeWidth="2.5" />
          </pattern>
        </defs>
      </svg>

      <div className="legend__row" role="group" aria-label="Room status: highlight rooms on the map">
        {STATES.map(({ state, label, hint }) => {
          const s = SWATCH[state];
          const n = counts ? (counts[state] ?? 0) : undefined;
          const on = pinned === state;
          return (
            <button
              key={state}
              type="button"
              className={`legend__item legend__state${on ? ' is-on' : ''}`}
              aria-pressed={on}
              title={`${hint}. Click to highlight.`}
              onMouseEnter={() => onPreview(state)}
              onMouseLeave={() => onPreview(null)}
              onFocus={() => onPreview(state)}
              onBlur={() => onPreview(null)}
              onClick={() => onPin(on ? null : state)}
            >
              <svg width="26" height="16" viewBox="0 0 26 16" aria-hidden>
                <rect x="1" y="1" width="24" height="14" rx="3" fill={s.fill} stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} />
                <Cue state={state} />
              </svg>
              {label}
              {n !== undefined && <span className={`legend__count${n === 0 ? ' is-zero' : ''}`}>{n}</span>}
            </button>
          );
        })}
        <div className="legend__spacer" />
        <button
          type="button"
          className="btn btn--link btn--small legend__key"
          aria-expanded={keyOpen}
          aria-controls="plan-key"
          title="What the other shapes mean. The plan is traced from the guidelines layout; positions are approximate."
          onClick={() => setKeyOpen((o) => !o)}
        >
          Key
        </button>
      </div>

      {keyOpen && (
        <div className="legend__row legend__plan" id="plan-key">
          <PlanItem label="Office">
            <rect className="area area--office" x="1" y="1" width="24" height="14" />
            <rect x="8" y="5" width="10" height="4" fill="#fff" stroke="#aab2ae" strokeWidth="0.8" />
          </PlanItem>
          <PlanItem label="Core">
            <rect className="area area--core" x="1" y="1" width="24" height="14" />
            <path d="M4 4l6 8M10 4l-6 8M14 3v10M17 3v10M20 3v10" stroke="#9aa39f" strokeWidth="1" fill="none" />
          </PlanItem>
          <PlanItem label="Service">
            <rect className="area area--service" x="1" y="1" width="24" height="14" />
          </PlanItem>
          <PlanItem label="Amenity">
            <rect className="area area--amenity" x="1" y="1" width="24" height="14" />
          </PlanItem>
          <PlanItem label="Not in tool">
            <rect className="area area--unlisted" x="1" y="1" width="24" height="14" />
          </PlanItem>
          <PlanItem label="Desk">
            <rect className="furniture__desks" x="5" y="3" width="16" height="6" />
            <circle className="furniture__chairs" cx="13" cy="12.5" r="2.6" />
          </PlanItem>
          <PlanItem label="To confirm">
            <rect x="1" y="1" width="24" height="14" rx="2" fill="var(--surface)" stroke="var(--line)" strokeDasharray="4 3" />
          </PlanItem>
          <PlanItem label="You">
            <circle cx="13" cy="8" r="6.5" fill="rgb(34 48 58 / 15%)" />
            <circle cx="13" cy="8" r="3" fill="var(--ink)" />
          </PlanItem>
        </div>
      )}
    </div>
  );
}
