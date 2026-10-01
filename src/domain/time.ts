/**
 * Time helpers. Store and compare UTC Date objects; show Asia/Manila (UTC+8 all year, no daylight saving).
 */
export const MANILA_TZ = 'Asia/Manila';
const MINUTE_MS = 60 * 1000;
const MANILA_OFFSET_MS = 8 * 60 * MINUTE_MS;

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * MINUTE_MS);
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MINUTE_MS);
}

/** UTC Date for a Manila wall-clock time. month is 1-12. */
export function manila(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - MANILA_OFFSET_MS);
}

/** Minutes since Manila midnight, 0-1439. */
export function manilaMinuteOfDay(d: Date): number {
  const local = new Date(d.getTime() + MANILA_OFFSET_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

/** Manila midnight that starts d's Manila calendar day. */
export function manilaStartOfDay(d: Date): Date {
  const local = new Date(d.getTime() + MANILA_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - MANILA_OFFSET_MS);
}

/** Manila midnight on the Monday of d's Manila week. */
export function manilaStartOfWeek(d: Date): Date {
  const day = manilaStartOfDay(d);
  const weekday = new Date(day.getTime() + MANILA_OFFSET_MS).getUTCDay(); // 0 = Sunday
  return addMinutes(day, -((weekday + 6) % 7) * 24 * 60);
}

/** Day of the Manila week, 0 = Monday … 6 = Sunday. */
export function manilaWeekday(d: Date): number {
  return (new Date(d.getTime() + MANILA_OFFSET_MS).getUTCDay() + 6) % 7;
}

/** The Manila calendar date, "2026-09-28". */
export function manilaDateKey(d: Date): string {
  return new Date(d.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

const dateTime = new Intl.DateTimeFormat('en-US', {
  timeZone: MANILA_TZ,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const timeOnly = new Intl.DateTimeFormat('en-US', { timeZone: MANILA_TZ, hour: 'numeric', minute: '2-digit' });

/** "Mon, Sep 28, 3:00 PM" */
export function formatManila(d: Date): string {
  return dateTime.format(d);
}

/** "Mon, Sep 28, 3:00 PM – 4:00 PM", with the end date when the booking crosses midnight. */
export function formatRange(start: Date, end: Date): string {
  const sameDay = manilaStartOfDay(start).getTime() === manilaStartOfDay(addMinutes(end, -1)).getTime();
  return `${dateTime.format(start)} – ${sameDay ? timeOnly.format(end) : dateTime.format(end)}`;
}
