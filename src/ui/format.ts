/** Display helpers for the browser. Always Asia/Manila, whatever the viewer's own time zone (docs/spec/06-ui.md, Copy). */
import { manilaStartOfDay, MANILA_TZ } from '../domain/time';

const day = new Intl.DateTimeFormat('en-US', { timeZone: MANILA_TZ, weekday: 'short', month: 'short', day: 'numeric' });
const time = new Intl.DateTimeFormat('en-US', { timeZone: MANILA_TZ, hour: 'numeric', minute: '2-digit' });
const parts = new Intl.DateTimeFormat('en-US', { timeZone: MANILA_TZ, hour: 'numeric', minute: '2-digit', hour12: true });

export const toDate = (v: string | Date) => (typeof v === 'string' ? new Date(v) : v);

/** "Mon, Sep 28" */
export const fmtDay = (d: string | Date) => day.format(toDate(d));
/** "3:00 PM" */
export const fmtTime = (d: string | Date) => time.format(toDate(d));

function meridiem(d: Date): string {
  return parts.formatToParts(d).find((p) => p.type === 'dayPeriod')?.value ?? '';
}

/** "3:00–4:00 PM", "11:30 AM–1:30 PM", or with dates when it crosses midnight. */
export function fmtSpan(startIn: string | Date, endIn: string | Date): string {
  const start = toDate(startIn);
  const end = toDate(endIn);
  const sameDay = manilaStartOfDay(start).getTime() === manilaStartOfDay(new Date(end.getTime() - 1)).getTime();
  if (!sameDay) return `${fmtDay(start)}, ${fmtTime(start)} – ${fmtDay(end)}, ${fmtTime(end)}`;
  if (meridiem(start) === meridiem(end)) return `${fmtTime(start).replace(/\s?[AP]M$/, '')}–${fmtTime(end)}`;
  return `${fmtTime(start)}–${fmtTime(end)}`;
}

/** "Mon, Sep 28 · 3:00–4:00 PM" */
export function fmtWhen(start: string | Date, end: string | Date): string {
  const span = fmtSpan(start, end);
  return span.includes(' – ') ? span : `${fmtDay(start)} · ${span}`;
}

/** The Room Reservation Tool's list format: "2026-09-28 10:30 PM". */
export function fmtTool(d: string | Date): string {
  return `${toManilaIso(toDate(d)).slice(0, 10)} ${fmtTime(d)}`;
}

/** The tool's date-only format: "2026-09-26". */
export const fmtToolDate = (d: string | Date) => toManilaIso(toDate(d)).slice(0, 10);

/** ISO with the +08:00 offset, the format the API expects: 2026-09-28T15:00:00+08:00 */
export function toManilaIso(d: Date): string {
  const local = new Date(d.getTime() + 8 * 3_600_000);
  return local.toISOString().slice(0, 19) + '+08:00';
}

export const STATUS_WORDS: Record<string, string> = {
  Approved: 'Approved',
  'In Progress': 'Requested – waiting for Admin',
  'Checked-In': 'Checked in',
  Cancelled: 'Cancelled',
  Completed: 'Completed',
  Held: 'Held',
};

/** Status in a few words for list rows ("In Progress" → "Requested"). */
export const shortStatus = (status: string) => ({ 'In Progress': 'Requested', 'Checked-In': 'Checked in' } as Record<string, string>)[status] ?? status;

/** First name from "Last, First". */
export function firstName(name: string): string {
  const [, first] = name.split(',').map((s) => s.trim());
  return first || name;
}
