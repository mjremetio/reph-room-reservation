/**
 * Recurrence as the Room Reservation Tool's form offers it (Guidelines 3.6, p.6–7):
 * Daily "Every N day(s)"; Weekly "Recur every N week(s) on" Sunday–Saturday; Monthly "Day D of every N month(s)"
 * or "The <First…Last> <weekday> of every N month(s)"; Yearly. The series runs from the first date to `until`
 * (the tool's "Ends at" date when Recurrence is ticked). Every date keeps the same Manila start time and length.
 */
import { manila } from './time';
import type { Interval } from './types';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEK_OF_MONTH = ['First', 'Second', 'Third', 'Fourth', 'Last'] as const;
export type WeekOfMonth = (typeof WEEK_OF_MONTH)[number];

export type Recurrence =
  | { freq: 'Daily'; every: number; until: Date }
  | { freq: 'Weekly'; every: number; days: Weekday[]; until: Date }
  | { freq: 'Monthly'; every: number; on: { day: number } | { week: WeekOfMonth; weekday: Weekday }; until: Date }
  | { freq: 'Yearly'; every: number; until: Date };

/** The same series in JSON (API bodies and views): `until` as an ISO string. */
type WithoutUntil<T> = T extends unknown ? Omit<T, 'until'> : never;
export type RecurrenceJson = WithoutUntil<Recurrence> & { until: string };
export const toRecurrenceJson = (r: Recurrence): RecurrenceJson => ({ ...r, until: r.until.toISOString() }) as RecurrenceJson;
export const fromRecurrenceJson = (r: RecurrenceJson): Recurrence => ({ ...r, until: new Date(r.until) }) as Recurrence;

const MANILA_OFFSET_MS = 8 * 3_600_000;
const DAY_MS = 86_400_000;

/** Manila calendar date of an instant: { y, m (1-12), d, wd (0 = Sunday) }. */
function localDate(t: Date) {
  const l = new Date(t.getTime() + MANILA_OFFSET_MS);
  return { y: l.getUTCFullYear(), m: l.getUTCMonth() + 1, d: l.getUTCDate(), wd: l.getUTCDay(), h: l.getUTCHours(), min: l.getUTCMinutes() };
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Midnight UTC key for a calendar date, for comparing and stepping dates. */
const key = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

/** The dates of a series, first one included, in order. Stops after `max` dates. */
export function expandRecurrence(first: Interval, rec: Recurrence, max = 100): Interval[] {
  const start = localDate(first.start);
  const length = first.end.getTime() - first.start.getTime();
  const firstKey = key(start.y, start.m, start.d);
  const u = localDate(rec.until);
  const untilKey = key(u.y, u.m, u.d);
  const every = Math.max(1, Math.floor(rec.every));
  const keys: number[] = [];
  const push = (k: number) => {
    if (k >= firstKey && k <= untilKey && keys.length < max) keys.push(k);
  };

  if (rec.freq === 'Daily') {
    for (let k = firstKey; k <= untilKey && keys.length < max; k += every * DAY_MS) push(k);
  } else if (rec.freq === 'Weekly') {
    const days = (rec.days.length ? rec.days : [WEEKDAYS[start.wd] as Weekday]).map((d) => WEEKDAYS.indexOf(d)).sort((a, b) => a - b);
    const weekStart = firstKey - start.wd * DAY_MS; // the Sunday of the first week
    for (let w = weekStart; w <= untilKey && keys.length < max; w += every * 7 * DAY_MS) for (const i of days) push(w + i * DAY_MS);
  } else if (rec.freq === 'Monthly') {
    for (let n = 0; keys.length < max; n += every) {
      const mm = start.m - 1 + n;
      const y = start.y + Math.floor(mm / 12);
      const m = (mm % 12) + 1;
      if (key(y, m, 1) > untilKey) break;
      if ('day' in rec.on) {
        if (rec.on.day <= daysInMonth(y, m)) push(key(y, m, rec.on.day));
      } else {
        const wd = WEEKDAYS.indexOf(rec.on.weekday);
        const firstWd = (wd - new Date(key(y, m, 1)).getUTCDay() + 7) % 7; // 0-based day of the first such weekday
        const nth = WEEK_OF_MONTH.indexOf(rec.on.week);
        let d = 1 + firstWd + (rec.on.week === 'Last' ? 0 : nth * 7);
        if (rec.on.week === 'Last') while (d + 7 <= daysInMonth(y, m)) d += 7;
        if (d <= daysInMonth(y, m)) push(key(y, m, d));
      }
    }
  } else {
    for (let y = start.y; key(y, 1, 1) <= untilKey && keys.length < max; y += every) {
      if (start.d <= daysInMonth(y, start.m)) push(key(y, start.m, start.d)); // Feb 29 only in leap years
    }
  }

  return keys.map((k) => {
    const day = new Date(k);
    const s = manila(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), start.h, start.min);
    return { start: s, end: new Date(s.getTime() + length) };
  });
}

/** "Weekly on Wednesday until Sep 12" style summary for cards and tables. */
export function describeRecurrence(rec: Recurrence): string {
  const every = rec.every > 1 ? ` every ${rec.every}` : '';
  const until = `until ${new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(rec.until)}`;
  switch (rec.freq) {
    case 'Daily':
      return `${every ? `Every ${rec.every} days` : 'Daily'} ${until}`;
    case 'Weekly':
      return `${every ? `Every ${rec.every} weeks` : 'Weekly'} on ${rec.days.join(', ')} ${until}`;
    case 'Monthly':
      return `${every ? `Every ${rec.every} months` : 'Monthly'} on ${'day' in rec.on ? `day ${rec.on.day}` : `the ${rec.on.week.toLowerCase()} ${rec.on.weekday}`} ${until}`;
    case 'Yearly':
      return `${every ? `Every ${rec.every} years` : 'Yearly'} ${until}`;
  }
}
