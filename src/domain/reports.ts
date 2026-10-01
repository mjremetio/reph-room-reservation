/**
 * Admin reports (docs/spec/02-flows.md F32): how rooms are used over a range. Pure: bookings, rooms and the clock in,
 * figures out. Hours are the part of each booking inside [from, to). The office runs 24/7, so utilisation is booked
 * hours ÷ every hour of the range (a room used 8 hours a day is at 33%).
 */
import { shouldAutoRelease } from './rules';
import { addMinutes, manilaDateKey, manilaMinuteOfDay, manilaStartOfDay, manilaWeekday } from './time';
import type { AgendaType, Booking, BookingStatus, Room } from './types';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Bookings that use the room: everything except Cancelled and short-lived holds. */
export const usesRoom = (b: Booking) => b.status !== 'Cancelled' && b.status !== 'Held';

const round1 = (n: number) => Math.round(n * 10) / 10;
const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : 0);

export interface Counted {
  key: string;
  count: number;
  hours: number;
}

export interface Report {
  from: Date;
  to: Date;
  totals: {
    bookings: number;
    hours: number;
    people: number;
    waiting: number;
    approved: number;
    checkedIn: number;
    cancelled: number;
    noShows: number;
    /** 0–1: booked hours of the self-bookable rooms ÷ (their number × hours in the range). */
    utilisation: number;
    /** Average days between filing and the start, for bookings that know when they were filed. */
    avgLeadDays: number | null;
  };
  byStatus: Array<{ key: BookingStatus; count: number }>;
  byAgendaType: Counted[];
  byFloor: Array<Counted & { utilisation: number }>;
  byRoom: Array<{ roomId: string; name: string; floor: string; selfBookable: boolean; count: number; hours: number; utilisation: number; noShows: number }>;
  byDivision: Counted[];
  /** Every Manila day of the range, with zeros. */
  byDay: Array<{ day: string; count: number; hours: number }>;
  /** Booked hours by Manila weekday (0 = Monday) and hour of the day: heatmap[weekday][hour]. */
  heatmap: number[][];
  topRequesters: Array<{ name: string; division: string | null; count: number; hours: number }>;
}

const STATUSES: BookingStatus[] = ['In Progress', 'Approved', 'Checked-In', 'Completed', 'Cancelled', 'Held'];

function tally<T>(items: T[], key: (item: T) => string, hours: (item: T) => number): Counted[] {
  const map = new Map<string, Counted>();
  for (const item of items) {
    const k = key(item);
    const c = map.get(k) ?? { key: k, count: 0, hours: 0 };
    c.count += 1;
    c.hours += hours(item);
    map.set(k, c);
  }
  return [...map.values()].map((c) => ({ ...c, hours: round1(c.hours) })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function buildReport(input: { bookings: Booking[]; rooms: Room[]; from: Date; to: Date; now: Date }): Report {
  const { rooms, from, to, now } = input;
  const inRange = input.bookings.filter((b) => b.start < to && from < b.end);
  const used = inRange.filter(usesRoom);
  const hoursIn = (b: Booking) => (Math.min(b.end.getTime(), to.getTime()) - Math.max(b.start.getTime(), from.getTime())) / HOUR_MS;
  // Released for no check-in, or due and not released yet.
  const noShow = (b: Booking) => !!b.releasedAt || shouldAutoRelease(b, now);
  const rangeHours = (to.getTime() - from.getTime()) / HOUR_MS;
  const roomById = new Map(rooms.map((r) => [r.id, r] as const));
  const bookable = rooms.filter((r) => r.selfBookable);

  const byRoom = rooms
    .map((r) => {
      const mine = used.filter((b) => b.roomId === r.id);
      const hours = mine.reduce((s, b) => s + hoursIn(b), 0);
      return { roomId: r.id, name: r.name, floor: r.floor, selfBookable: r.selfBookable, count: mine.length, hours: round1(hours), utilisation: ratio(hours, rangeHours), noShows: inRange.filter((b) => b.roomId === r.id && noShow(b)).length };
    })
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));

  const floors = [...new Set(rooms.map((r) => r.floor))];
  const byFloor = floors.map((floor) => {
    const floorRooms = bookable.filter((r) => r.floor === floor);
    const mine = used.filter((b) => roomById.get(b.roomId)?.floor === floor);
    const hours = mine.reduce((s, b) => s + hoursIn(b), 0);
    return { key: floor, count: mine.length, hours: round1(hours), utilisation: ratio(hours, rangeHours * floorRooms.length) };
  });

  const days: Report['byDay'] = [];
  for (let d = manilaStartOfDay(from); d < to; d = new Date(d.getTime() + DAY_MS)) days.push({ day: manilaDateKey(d), count: 0, hours: 0 });
  const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const b of used) {
    const day = days.find((x) => x.day === manilaDateKey(b.start < from ? from : b.start));
    if (day) {
      day.count += 1;
      day.hours += hoursIn(b);
    }
    // Manila is a whole number of hours from UTC, so UTC hour boundaries are Manila hour boundaries.
    const first = Math.max(b.start.getTime(), from.getTime());
    const last = Math.min(b.end.getTime(), to.getTime());
    for (let t = Math.floor(first / HOUR_MS) * HOUR_MS; t < last; t += HOUR_MS) {
      const slot = new Date(t);
      const part = (Math.min(last, t + HOUR_MS) - Math.max(first, t)) / HOUR_MS;
      const row = heatmap[manilaWeekday(slot)] as number[];
      const hour = Math.floor(manilaMinuteOfDay(slot) / 60);
      row[hour] = (row[hour] ?? 0) + part;
    }
  }

  const people = new Map<string, { name: string; division: string | null; count: number; hours: number }>();
  for (const b of used) {
    const key = b.owner.email?.toLowerCase() ?? b.owner.name;
    const p = people.get(key) ?? { name: b.owner.name, division: b.owner.division ?? null, count: 0, hours: 0 };
    p.count += 1;
    p.hours += hoursIn(b);
    people.set(key, p);
  }

  const filed = used.filter((b) => b.createdAt);
  const usedHours = used.reduce((s, b) => s + hoursIn(b), 0);
  const bookableHours = used.filter((b) => roomById.get(b.roomId)?.selfBookable).reduce((s, b) => s + hoursIn(b), 0);
  return {
    from,
    to,
    totals: {
      bookings: used.length,
      hours: round1(usedHours),
      people: new Set(used.map((b) => b.owner.email?.toLowerCase() ?? b.owner.name)).size,
      waiting: inRange.filter((b) => b.status === 'In Progress').length,
      approved: inRange.filter((b) => b.status === 'Approved').length,
      checkedIn: inRange.filter((b) => b.status === 'Checked-In').length,
      cancelled: inRange.filter((b) => b.status === 'Cancelled').length,
      noShows: inRange.filter(noShow).length,
      utilisation: ratio(bookableHours, rangeHours * bookable.length),
      avgLeadDays: filed.length
        ? round1(filed.reduce((s, b) => s + (b.start.getTime() - (b.createdAt as Date).getTime()), 0) / filed.length / DAY_MS)
        : null,
    },
    byStatus: STATUSES.map((key) => ({ key, count: inRange.filter((b) => b.status === key).length })).filter((s) => s.count > 0),
    byAgendaType: tally(used, (b) => b.agendaType as AgendaType, hoursIn),
    byFloor,
    byRoom,
    byDivision: tally(used, (b) => b.owner.division ?? 'No division', hoursIn),
    byDay: days.map((d) => ({ ...d, hours: round1(d.hours) })),
    heatmap: heatmap.map((row) => row.map(round1)),
    topRequesters: [...people.values()].map((p) => ({ ...p, hours: round1(p.hours) })).sort((a, b) => b.count - a.count || b.hours - a.hours).slice(0, 10),
  };
}

/** Admin dashboard: the requests waiting for Admin, soonest first (the ones starting soonest matter most). */
export function waitingForAdmin(bookings: Booking[], now: Date): Booking[] {
  return bookings.filter((b) => b.status === 'In Progress' && b.end > now).sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** The Manila day [start, end) that contains `now`, for "today" figures. */
export function manilaToday(now: Date): { from: Date; to: Date } {
  const from = manilaStartOfDay(now);
  return { from, to: addMinutes(from, 24 * 60) };
}
