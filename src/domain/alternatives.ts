import { availabilityFor } from './availability';
import { rankRooms, type Scored } from './ranking';
import type { Booking, Room, RoomRequest } from './types';

/** Moving the owner on the same floor is less disruptive for them. */
export const SAME_FLOOR_BONUS = 5;

/**
 * Rooms that could host the OWNER's booking instead, so the assistant can offer them a swap
 * in flows B and C ("Amsterdam, 2F is free 3:00–4:30 PM and fits your 4 people").
 */
export function swapOptionsFor(blocking: Booking, rooms: Room[], bookings: Booking[], now: Date, limit = 3): Scored[] {
  const current = rooms.find((r) => r.id === blocking.roomId);
  if (!current) return [];
  const ownerNeeds: RoomRequest = {
    site: current.site,
    agendaType: blocking.agendaType,
    start: blocking.start,
    end: blocking.end,
    participants: blocking.participants,
  };
  const candidates = rooms.filter(
    (r) => r.id !== blocking.roomId && availabilityFor(r.id, blocking, bookings, now).kind === 'available',
  );
  return rankRooms(candidates, ownerNeeds)
    .map((s) => (s.room.floor === current.floor ? { ...s, score: s.score + SAME_FLOOR_BONUS, reasons: [...s.reasons, 'same floor'] } : s))
    .sort((a, b) => b.score - a.score || a.room.name.localeCompare(b.room.name))
    .slice(0, limit);
}
