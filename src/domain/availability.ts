import { sameEmail } from './people';
import { countsForOneRoom } from './rules';
import type { AgendaType, Booking, Interval } from './types';
import { addMinutes, minutesBetween } from './time';

/** Booking statuses that occupy a room. A "Held" proposal only blocks until it expires. */
export function isBlocking(b: Booking, now: Date): boolean {
  switch (b.status) {
    case 'Cancelled':
    case 'Completed':
      return false;
    case 'Held':
      return !!b.holdExpiresAt && b.holdExpiresAt.getTime() > now.getTime();
    default:
      return true; // In Progress, Approved, Checked-In, Blocked
  }
}

/** Half-open intervals, so back-to-back meetings (3-4 PM, then 4-5 PM) do not clash. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

export function conflictsFor(roomId: string, want: Interval, bookings: Booking[], now: Date): Booking[] {
  return bookings
    .filter((b) => b.roomId === roomId && isBlocking(b, now) && overlaps(want, b))
    .sort((x, y) => x.start.getTime() - y.start.getTime());
}

/**
 * The person's own bookings (any room) that overlap `want` and still hold their room (RULES.oneRoomPerPersonAtATime).
 * Training and Multi-purpose bookings may be held several at once: they neither clash nor count (countsForOneRoom).
 * Admin's room blocks never count either.
 */
export function ownConflicts(email: string, want: Interval & { agendaType: AgendaType }, bookings: Booking[], now: Date): Booking[] {
  if (!countsForOneRoom(want.agendaType)) return [];
  return bookings
    .filter((b) => b.status !== 'Blocked' && countsForOneRoom(b.agendaType) && sameEmail(b.owner.email, email) && isBlocking(b, now) && overlaps(want, b))
    .sort((x, y) => x.start.getTime() - y.start.getTime());
}

/** Free parts of `window` in one room, ignoring slivers shorter than minMinutes. */
export function freeIntervals(roomId: string, window: Interval, bookings: Booking[], now: Date, minMinutes = 15): Interval[] {
  const busy = conflictsFor(roomId, window, bookings, now); // sorted by start
  const free: Interval[] = [];
  let cursor = window.start.getTime();
  for (const b of busy) {
    const busyStart = Math.max(b.start.getTime(), window.start.getTime());
    const busyEnd = Math.min(b.end.getTime(), window.end.getTime());
    if (busyStart > cursor) free.push({ start: new Date(cursor), end: new Date(busyStart) });
    cursor = Math.max(cursor, busyEnd);
  }
  if (cursor < window.end.getTime()) free.push({ start: new Date(cursor), end: new Date(window.end.getTime()) });
  return free.filter((f) => minutesBetween(f.start, f.end) >= minMinutes);
}

/** Flow A (available), B (partial) or C (unavailable) from the target process, for one room. */
export type Availability =
  | { kind: 'available' }
  | { kind: 'partial'; free: Interval[]; conflicts: Booking[] }
  | { kind: 'unavailable'; conflicts: Booking[] };

export function availabilityFor(roomId: string, want: Interval, bookings: Booking[], now: Date, minMinutes = 15): Availability {
  const conflicts = conflictsFor(roomId, want, bookings, now);
  if (conflicts.length === 0) return { kind: 'available' };
  const free = freeIntervals(roomId, want, bookings, now, minMinutes);
  return free.length > 0 ? { kind: 'partial', free, conflicts } : { kind: 'unavailable', conflicts };
}

/** The same room at nearby times with the same length, nearest first, never overlapping each other. */
export function nearestFreeSlots(
  roomId: string,
  want: Interval,
  bookings: Booking[],
  now: Date,
  opts: { stepMinutes?: number; searchHours?: number; limit?: number } = {},
): Interval[] {
  const step = opts.stepMinutes ?? 15;
  const horizon = (opts.searchHours ?? 8) * 60;
  const limit = opts.limit ?? 3;
  const length = minutesBetween(want.start, want.end);
  const found: Interval[] = [];
  for (let offset = step; offset <= horizon && found.length < limit; offset += step) {
    for (const direction of [1, -1]) {
      if (found.length >= limit) break;
      const start = addMinutes(want.start, direction * offset);
      if (start.getTime() < now.getTime()) continue;
      const candidate = { start, end: addMinutes(start, length) };
      if (found.some((f) => overlaps(f, candidate))) continue;
      if (conflictsFor(roomId, candidate, bookings, now).length === 0) found.push(candidate);
    }
  }
  return found;
}
