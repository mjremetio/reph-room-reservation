'use client';

/** Small pieces shared by the Admin pages (docs/spec/06-ui.md, Admin): the server clock, date ranges, chips, actions. */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { addMinutes, manilaStartOfDay, manilaStartOfWeek } from '../../domain/time';
import { ApiError, useHealth } from '../api';
import { shortStatus, toManilaIso } from '../format';

/** The server's clock (DEMO_NOW replays the demo week), like useNow() in the main app. */
export function useServerNow(): () => Date {
  const { data } = useHealth();
  const offset = useMemo(() => (data ? Date.parse(data.now) - Date.now() : 0), [data]);
  return useMemo(() => () => new Date(Date.now() + offset), [offset]);
}

const DAY = 24 * 60;
export type RangeKey = 'today' | 'week' | 'next7' | 'next30' | 'lastWeek' | 'last30' | 'custom';

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Today',
  week: 'This week',
  next7: 'Next 7 days',
  next30: 'Next 30 days',
  lastWeek: 'Last week',
  last30: 'Last 30 days',
  custom: 'Custom',
};

/** [from, to) for a preset, in Manila days. */
export function presetRange(key: Exclude<RangeKey, 'custom'>, now: Date): { from: Date; to: Date } {
  const today = manilaStartOfDay(now);
  const week = manilaStartOfWeek(now);
  switch (key) {
    case 'today':
      return { from: today, to: addMinutes(today, DAY) };
    case 'week':
      return { from: week, to: addMinutes(week, 7 * DAY) };
    case 'next7':
      return { from: today, to: addMinutes(today, 7 * DAY) };
    case 'next30':
      return { from: today, to: addMinutes(today, 30 * DAY) };
    case 'lastWeek':
      return { from: addMinutes(week, -7 * DAY), to: week };
    case 'last30':
      return { from: addMinutes(today, -30 * DAY), to: addMinutes(today, DAY) };
  }
}

/** "2026-09-28" ⇄ Manila midnight, for date inputs. */
export const ymd = (d: Date) => toManilaIso(d).slice(0, 10);
export const fromYmd = (s: string) => new Date(`${s}T00:00:00+08:00`);
/** "2026-09-28T15:00" ⇄ Date, for datetime-local inputs in Manila time. */
export const toLocalInput = (iso: string | Date) => toManilaIso(typeof iso === 'string' ? new Date(iso) : iso).slice(0, 16);
export const fromLocalInput = (v: string) => `${v}:00+08:00`;

export type Range = { key: RangeKey; from: Date; to: Date };

/**
 * A range starting on a preset. Presets follow the server's clock: once /api/health arrives (DEMO_NOW may be days
 * away from the browser's date), a preset range is worked out again.
 */
export function useRange(initial: Exclude<RangeKey, 'custom'>): [Range, (r: Range) => void, () => Date] {
  const now = useServerNow();
  const [range, setRange] = useState<Range>(() => ({ key: initial, ...presetRange(initial, now()) }));
  useEffect(() => {
    setRange((r) => (r.key === 'custom' ? r : { key: r.key, ...presetRange(r.key, now()) }));
  }, [now]);
  return [range, setRange, now];
}

/** A range picker: presets and, for Custom, two dates (the end date is included). */
export function RangePicker({
  value,
  onChange,
  presets,
  now,
}: {
  value: Range;
  onChange: (v: Range) => void;
  presets: Array<Exclude<RangeKey, 'custom'>>;
  now: () => Date;
}) {
  return (
    <>
      <label className="dt-field">
        Range
        <select
          value={value.key}
          onChange={(e) => {
            const key = e.target.value as RangeKey;
            onChange(key === 'custom' ? { ...value, key } : { key, ...presetRange(key, now()) });
          }}
        >
          {[...presets, 'custom' as const].map((k) => (
            <option key={k} value={k}>
              {RANGE_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      {value.key === 'custom' && (
        <>
          <label className="dt-field">
            From
            <input type="date" value={ymd(value.from)} onChange={(e) => e.target.value && onChange({ ...value, from: fromYmd(e.target.value) })} />
          </label>
          <label className="dt-field">
            To
            <input
              type="date"
              value={ymd(addMinutes(value.to, -1))}
              onChange={(e) => e.target.value && onChange({ ...value, to: addMinutes(fromYmd(e.target.value), DAY) })}
            />
          </label>
        </>
      )}
    </>
  );
}

export function StatusChip({ status }: { status: string }) {
  return <span className={`dt-chip dt-status--${status.toLowerCase().replace(/\s+/g, '-')}`}>{shortStatus(status)}</span>;
}

/**
 * Runs an Admin action with a busy flag and an error line; afterwards refreshes every Admin view and the message
 * threads (an action leaves a note for the owner).
 */
export function useAdminAction() {
  const client = useQueryClient();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setWorking(true);
    setError(null);
    try {
      const result = await fn();
      await Promise.all([client.invalidateQueries({ queryKey: ['admin'] }), client.invalidateQueries({ queryKey: ['messages'] })]);
      return result;
    } catch (err) {
      setError(err instanceof ApiError ? [err.message, ...(err.problems?.slice(1) ?? [])].join(' ') : 'That did not go through. Please try again.');
      return undefined;
    } finally {
      setWorking(false);
    }
  };
  return { run, working, error, setError };
}

/** "82%" from 0.82 (one decimal under 10%). */
export const pct = (x: number) => `${x < 0.1 ? Math.round(x * 1000) / 10 : Math.round(x * 100)}%`;
