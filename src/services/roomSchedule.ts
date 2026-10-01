/**
 * Who has which room when (the assistant's room_schedule tool, docs/spec/05-agent.md): each room's bookings in a
 * window with their free parts. Code decides; the model only explains. Other people's bookings are privacy-filtered
 * like everywhere else (owner name, division, time, group size and status).
 */
import { freeIntervals, isBlocking } from '../domain/availability';
import { bookable } from '../domain/ranking';
import { bookableFrom } from '../domain/rules';
import type { Interval, Room, Site } from '../domain/types';
import type { ReservationGateway } from '../gateway/ReservationGateway';
import { publicBooking, type PublicBooking } from './views';

export const SCHEDULE_LIMITS = { maxDays: 7, rooms: 12 };

export interface RoomSchedule {
  room: Room;
  /** Bookings that hold the room in the window (In Progress, Approved, Checked-In), by start time. */
  bookings: PublicBooking[];
  /** Free parts of the window from now on (bookableFrom), 15 minutes or longer. */
  free: Interval[];
}

export type ScheduleResult =
  | {
      ok: true;
      window: Interval;
      /** A named room always; for a floor or the whole site only rooms with bookings (at most SCHEDULE_LIMITS.rooms). */
      rooms: RoomSchedule[];
      /** Rooms left out by the limit. */
      more: number;
      /** For a floor or the whole site: self-bookable rooms with no booking in the window. */
      freeRooms: Room[];
    }
  | { ok: false; problem: string };

/** What people call a room: any case, without "room", "the", "2F"/"3F" or punctuation; "Mount" = "Mt.". */
const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/\bmount\b/g, 'mt')
    .replace(/\b(the|room|[23]f)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');

/** Rooms matching a name as a person says it ("batanes", "Batanes 3F", "huddle 7", "mount apo"); exact matches first. */
export function matchRooms(rooms: Room[], query: string): Room[] {
  const q = key(query);
  if (!q) return [];
  const names = (r: Room) => [r.id, r.name, r.toolName ?? ''].map(key).filter(Boolean);
  const exact = rooms.filter((r) => names(r).includes(q));
  return exact.length > 0 ? exact : rooms.filter((r) => names(r).some((n) => n.includes(q)));
}

export async function roomSchedule(
  gw: ReservationGateway,
  query: { site: Site; room?: string | null; floor?: string | null; start: Date; end: Date; viewerEmail: string },
  now: Date,
): Promise<ScheduleResult> {
  const window = { start: query.start, end: query.end };
  if (window.end.getTime() <= window.start.getTime()) return { ok: false, problem: 'The end time must be after the start time.' };
  if (window.end.getTime() - window.start.getTime() > SCHEDULE_LIMITS.maxDays * 24 * 3_600_000) {
    return { ok: false, problem: `Ask for at most ${SCHEDULE_LIMITS.maxDays} days at a time.` };
  }
  const onFloor = (await gw.listRooms(query.site)).filter((r) => !query.floor || r.floor === query.floor);
  const rooms = query.room ? matchRooms(onFloor, query.room) : onFloor;
  if (rooms.length === 0) return { ok: false, problem: `There is no room called "${query.room}"${query.floor ? ` on ${query.floor}` : ''}.` };

  const bookings = (await gw.getBookings({ roomIds: rooms.map((r) => r.id), from: window.start, to: window.end })).filter((b) => isBlocking(b, now));
  // Bookings earlier today still show (who had it); free times only count from now on.
  const ahead = { start: new Date(Math.max(window.start.getTime(), bookableFrom(now).getTime())), end: window.end };
  const all: RoomSchedule[] = rooms.map((room) => ({
    room,
    bookings: bookings
      .filter((b) => b.roomId === room.id)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((b) => publicBooking(b, query.viewerEmail)),
    free: ahead.start < ahead.end ? freeIntervals(room.id, ahead, bookings, now) : [],
  }));
  const listed = query.room ? all : all.filter((s) => s.bookings.length > 0);
  return {
    ok: true,
    window,
    rooms: listed.slice(0, SCHEDULE_LIMITS.rooms),
    more: Math.max(0, listed.length - SCHEDULE_LIMITS.rooms),
    freeRooms: query.room ? [] : all.filter((s) => s.bookings.length === 0 && bookable(s.room)).map((s) => s.room),
  };
}
