'use client';

/**
 * Small charts for the Admin dashboard and reports (docs/spec/06-ui.md, Charts), drawn with SVG and CSS in the app's
 * colour tokens: no chart library. Every chart has a title, an aria-label and a "Show data" table, so the numbers
 * are there for screen readers and for copying.
 */
import type { ReactNode } from 'react';

export const STATUS_COLOURS: Record<string, string> = {
  'In Progress': 'var(--orange)',
  Approved: 'var(--green)',
  'Checked-In': 'var(--blue)',
  Completed: 'var(--muted)',
  Cancelled: 'var(--red)',
  Held: 'var(--line)',
  Blocked: 'var(--ink)',
};

function DataTable({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <details className="chart__data">
      <summary>Show data</summary>
      <table className="dt dt--compact">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={typeof c === 'number' ? 'dt-num' : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Figure({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <figure className={`chart ${className}`}>
      <figcaption className="chart__title">
        {title}
        {note && <span className="chart__note">{note}</span>}
      </figcaption>
      {children}
    </figure>
  );
}

/** A big number with a label: "3 · Waiting for Admin". */
export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'warn' | 'good' | 'bad' }) {
  return (
    <div className={`stat${tone ? ` stat--${tone}` : ''}`}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

/** Horizontal bars, longest first as given: rooms by hours, bookings by type, … */
export function BarList({ title, note, rows, unit = '' }: { title: string; note?: string; rows: Array<{ label: string; value: number; detail?: string }>; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Figure title={title} note={note}>
      {rows.length === 0 ? (
        <p className="chart__empty">No data in this range.</p>
      ) : (
        <ul className="bars" aria-label={title}>
          {rows.map((r) => (
            <li key={r.label} className="bars__row">
              <span className="bars__label">{r.label}</span>
              <span className="bars__track" aria-hidden>
                <span className="bars__bar" style={{ width: `${(r.value / max) * 100}%` }} />
              </span>
              <span className="bars__value">
                {r.value}
                {unit}
                {r.detail && <span className="bars__detail"> · {r.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <DataTable head={['', `Value${unit ? ` (${unit.trim()})` : ''}`]} rows={rows.map((r) => [r.label, r.value])} />
    </Figure>
  );
}

/** Columns per day (bookings), with the day under each column. */
export function ColumnChart({ title, note, points, unit = '' }: { title: string; note?: string; points: Array<{ label: string; value: number }>; unit?: string }) {
  const W = 640;
  const H = 180;
  const pad = { top: 16, bottom: 28, left: 8, right: 8 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = (W - pad.left - pad.right) / Math.max(1, points.length);
  const bar = Math.max(4, Math.min(48, step * 0.6));
  const every = Math.ceil(points.length / 14); // at most 14 labels
  return (
    <Figure title={title} note={note}>
      <svg className="columns" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${points.map((p) => `${p.label} ${p.value}${unit}`).join(', ')}`}>
        <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} className="columns__axis" />
        {points.map((p, i) => {
          const h = ((H - pad.top - pad.bottom) * p.value) / max;
          const x = pad.left + i * step + (step - bar) / 2;
          return (
            <g key={p.label}>
              <rect x={x} y={H - pad.bottom - h} width={bar} height={h} rx={3} className="columns__bar">
                <title>{`${p.label}: ${p.value}${unit}`}</title>
              </rect>
              {p.value > 0 && step > 22 && (
                <text x={x + bar / 2} y={H - pad.bottom - h - 4} className="columns__value">
                  {p.value}
                </text>
              )}
              {i % every === 0 && (
                <text x={x + bar / 2} y={H - 8} className="columns__label">
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <DataTable head={['Day', `Value${unit ? ` (${unit.trim()})` : ''}`]} rows={points.map((p) => [p.label, p.value])} />
    </Figure>
  );
}

/** The share of each status, as a ring with a legend. */
export function Donut({ title, note, parts }: { title: string; note?: string; parts: Array<{ label: string; value: number; colour: string }> }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <Figure title={title} note={note} className="chart--donut">
      <div className="donut">
        <svg viewBox="0 0 120 120" role="img" aria-label={`${title}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
          <circle cx={60} cy={60} r={R} className="donut__track" />
          {total > 0 &&
            parts.map((p) => {
              const len = (p.value / total) * C;
              const seg = (
                <circle key={p.label} cx={60} cy={60} r={R} fill="none" stroke={p.colour} strokeWidth={16} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)">
                  <title>{`${p.label}: ${p.value}`}</title>
                </circle>
              );
              offset += len;
              return seg;
            })}
          <text x={60} y={58} className="donut__total">
            {total}
          </text>
          <text x={60} y={74} className="donut__caption">
            total
          </text>
        </svg>
        <ul className="legend-list">
          {parts.map((p) => (
            <li key={p.label}>
              <span className="legend-list__swatch" style={{ background: p.colour }} aria-hidden />
              {p.label} <strong>{p.value}</strong>
            </li>
          ))}
        </ul>
      </div>
      <DataTable head={['Status', 'Bookings']} rows={parts.map((p) => [p.label, p.value])} />
    </Figure>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;

/** Booked hours by weekday and hour of the day (24/7 office): darker = busier. */
export function Heatmap({ title, note, grid }: { title: string; note?: string; grid: number[][] }) {
  const max = Math.max(0.0001, ...grid.flat());
  return (
    <Figure title={title} note={note}>
      <div className="heat" role="img" aria-label={`${title}. Busiest: ${busiest(grid)}`}>
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="heat__hour">
            {h % 3 === 0 ? hourLabel(h) : ''}
          </span>
        ))}
        {grid.map((row, d) => (
          <div key={d} className="heat__row">
            <span className="heat__day">{WEEKDAYS[d]}</span>
            {row.map((v, h) => (
              <span key={h} className="heat__cell" style={{ opacity: v > 0 ? 0.15 + 0.85 * (v / max) : 1, background: v > 0 ? 'var(--brand)' : undefined }} title={`${WEEKDAYS[d]} ${hourLabel(h)}: ${v} h`} />
            ))}
          </div>
        ))}
      </div>
      <DataTable head={['Day', ...Array.from({ length: 24 }, (_, h) => hourLabel(h))]} rows={grid.map((row, d) => [WEEKDAYS[d] as string, ...row])} />
    </Figure>
  );
}

function busiest(grid: number[][]): string {
  let best = { d: 0, h: 0, v: -1 };
  grid.forEach((row, d) => row.forEach((v, h) => v > best.v && (best = { d, h, v })));
  return best.v > 0 ? `${WEEKDAYS[best.d]} ${hourLabel(best.h)} (${best.v} h)` : 'no bookings';
}
