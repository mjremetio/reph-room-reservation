'use client';

/**
 * "Starts at" and "Ends at", each a date and a time in 30-minute steps, like the Room Reservation Tool's form.
 * Used by the map's search bar and by the reservation form. In a repeating booking (`series`), the Ends at
 * date is the last date of the series and the times are each date's start and end (Guidelines 3.6).
 */
import { useId } from 'react';
import { addMinutes, manilaMinuteOfDay, manilaStartOfDay } from '../domain/time';
import type { AgendaType } from '../domain/types';
import { fmtTime, toManilaIso } from './format';
import { useNow, type Slot } from './store';

export const AGENDA_TYPES: AgendaType[] = ['Meeting', 'Training', 'Pantry', 'Lactation Room', 'Multi-purpose'];

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i * 30);
/** Adds `value` to the steps when it isn't one (e.g. a time the assistant chose). */
const withValue = (options: number[], value: number) => (options.includes(value) ? options : [...options, value].sort((a, b) => a - b));
const dayInput = (d: Date) => toManilaIso(d).slice(0, 10);
const fromDayInput = (v: string) => new Date(`${v}T00:00:00+08:00`);

function DateTime({
  label,
  day,
  minute,
  minDay,
  invalid,
  onChange,
}: {
  label: string;
  day: Date;
  minute: number;
  minDay: Date;
  invalid?: boolean;
  onChange: (day: Date, minute: number) => void;
}) {
  const id = useId();
  return (
    <div className="field field--datetime">
      <label htmlFor={`${id}-d`}>{label}</label>
      <span className="field__pair">
        <input
          id={`${id}-d`}
          type="date"
          value={dayInput(day)}
          min={dayInput(minDay)}
          required
          aria-invalid={invalid || undefined}
          onChange={(e) => e.target.value && onChange(fromDayInput(e.target.value), minute)}
        />
        <select aria-label={`${label} time`} aria-invalid={invalid || undefined} value={minute} onChange={(e) => onChange(day, Number(e.target.value))}>
          {withValue(HALF_HOURS, minute).map((m) => (
            <option key={m} value={m}>
              {fmtTime(addMinutes(day, m))}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

export function TimeFields({ slot, onChange, series = false, invalid = false }: { slot: Slot; onChange: (slot: Slot) => void; series?: boolean; invalid?: boolean }) {
  const now = useNow();
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  const today = manilaStartOfDay(now());
  const startDay = manilaStartOfDay(start);

  const setStart = (day: Date, minute: number) => {
    const s = addMinutes(day, minute);
    // Keep the length (or, in a series, the gap to the last date).
    onChange({ start: s.toISOString(), end: new Date(s.getTime() + (end.getTime() - start.getTime())).toISOString() });
  };
  const setEnd = (day: Date, minute: number) => {
    let e = addMinutes(day, minute);
    if (!series && e <= start) e = addMinutes(start, 30);
    onChange({ start: slot.start, end: e.toISOString() });
  };

  return (
    <>
      <DateTime label="Starts at" day={startDay} minute={manilaMinuteOfDay(start)} minDay={today} invalid={invalid} onChange={setStart} />
      <DateTime label={series ? 'Ends at (last date)' : 'Ends at'} day={manilaStartOfDay(end)} minute={manilaMinuteOfDay(end)} minDay={startDay} invalid={invalid} onChange={setEnd} />
    </>
  );
}
