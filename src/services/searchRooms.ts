import { availabilityFor, nearestFreeSlots, type Availability } from '../domain/availability';
import { rankRooms, type Fit } from '../domain/ranking';
import { roomIssues, validateRequest } from '../domain/rules';
import { addMinutes } from '../domain/time';
import type { Room, RoomRequest } from '../domain/types';
import type { ReservationGateway } from '../gateway/ReservationGateway';
import { ownBookingClashes } from './prepareBooking';
import { matchRooms } from './roomSchedule';

export interface RoomMatch {
  room: Room;
  score: number;
  fit: Fit;
  reasons: string[];
  availability: Availability;
}

export interface Alternative {
  room: Room;
  start: Date;
  end: Date;
}

/** Which branch of the target process applies: A rooms found, B partly free, C nothing free, none = no suitable rooms at all. */
export type Flow = 'A' | 'B' | 'C' | 'none';

export interface SearchResult {
  ok: boolean;
  /** Blocking rule problems (ok = false). */
  problems: string[];
  /** Non-blocking warnings, e.g. a hall for a small group. */
  warnings: string[];
  request: RoomRequest;
  flow: Flow;
  fullyFree: RoomMatch[];
  partlyFree: RoomMatch[];
  taken: RoomMatch[];
  /** Same rooms at nearby times, only when nothing is fully free. */
  alternatives: Alternative[];
  /**
   * The room the person named ("Is Mactan free…?"), always with its real availability, so a room missing from the
   * ranked lists is never taken for "not available". `canHost` false: `note` says why it can't host this request.
   */
  requested?: { query: string; match: RoomMatch | null; canHost: boolean; note?: string };
}

export const SEARCH_LIMITS = { fullyFree: 5, partlyFree: 3, taken: 3, alternativeRooms: 3, alternativesPerRoom: 2 };

/** Why a room can't host a request (the checks of scoreRoom), in words. */
function cannotHost(room: Room, req: RoomRequest): string | undefined {
  if (room.site !== req.site) return `${room.name} is in ${room.site}, not ${req.site}.`;
  if (!room.selfBookable) return `${room.name} is booked through Admin, not self-service.`;
  return roomIssues(room, req.agendaType, req.participants)[0]?.message;
}

/**
 * The one room search used everywhere (agent tool, /api/search, map filters).
 * Code decides availability and ranking; callers only present the result.
 * With the requester's email it also warns when they already hold a room then (RULES.oneRoomPerPersonAtATime),
 * unless no room of the type is listed at the site.
 * `opts.room`: the room the person named. It is looked up by name (`matchRooms`), reported in `requested` with its
 * real availability, and listed first in its group when it can host the request.
 */
export async function searchRooms(gw: ReservationGateway, req: RoomRequest, now: Date, requesterEmail?: string, opts: { room?: string | null } = {}): Promise<SearchResult> {
  const issues = validateRequest(req, now);
  const problems = issues.filter((i) => i.blocking).map((i) => i.message);
  const warnings = issues.filter((i) => !i.blocking).map((i) => i.message);
  const empty = { request: req, fullyFree: [], partlyFree: [], taken: [], alternatives: [] };
  if (problems.length > 0) return { ok: false, problems, warnings, flow: 'none', ...empty };

  const rooms = await gw.listRooms(req.site);
  // The owner's room booking list has no room for this type yet (Pantry): say so, rather than "nothing is free".
  if (rooms.length > 0 && !rooms.some((r) => r.selfBookable && r.agendas.includes(req.agendaType))) {
    return { ok: false, problems: [`No room is set up for ${req.agendaType} bookings yet. Contact Admin.`], warnings, flow: 'none', ...empty };
  }
  const bookings = await gw.getBookings({
    roomIds: rooms.map((r) => r.id),
    from: addMinutes(req.start, -12 * 60),
    to: addMinutes(req.end, 12 * 60),
  });
  const matches: RoomMatch[] = rankRooms(rooms, req).map((s) => ({
    ...s,
    availability: availabilityFor(s.room.id, req, bookings, now),
  }));

  let requested: SearchResult['requested'];
  if (opts.room?.trim()) {
    const query = opts.room.trim();
    const found = matchRooms(await gw.listRooms(), query);
    const room = found.length === 1 ? found[0] : undefined;
    if (!room) {
      const note = found.length ? `"${query}" matches ${found.map((r) => r.name).join(', ')}. Which one?` : `No room called "${query}".`;
      requested = { query, match: null, canHost: false, note };
    } else {
      const scored = matches.find((m) => m.room.id === room.id);
      const roomBookings = scored ? bookings : await gw.getBookings({ roomIds: [room.id], from: addMinutes(req.start, -12 * 60), to: addMinutes(req.end, 12 * 60) });
      const match = scored ?? { room, score: 0, fit: 'unknown size' as Fit, reasons: [], availability: availabilityFor(room.id, req, roomBookings, now) };
      const note = scored ? undefined : cannotHost(room, req);
      requested = { query, match, canHost: !!scored, ...(note ? { note } : {}) };
    }
  }
  // The named room leads its group (when it can host the request), whatever its rank.
  const pinned = requested?.canHost ? requested.match : null;
  const group = (kind: Availability['kind'], limit: number) => {
    const lead = pinned?.availability.kind === kind ? [pinned] : [];
    return [...lead, ...matches.filter((m) => m.availability.kind === kind && m.room.id !== pinned?.room.id).slice(0, limit - lead.length)];
  };
  const fullyFree = group('available', SEARCH_LIMITS.fullyFree);
  const partlyFree = group('partial', SEARCH_LIMITS.partlyFree);
  const taken = group('unavailable', SEARCH_LIMITS.taken);
  const alternatives: Alternative[] =
    fullyFree.length > 0
      ? []
      : matches.slice(0, SEARCH_LIMITS.alternativeRooms).flatMap((m) =>
          nearestFreeSlots(m.room.id, req, bookings, now, { limit: SEARCH_LIMITS.alternativesPerRoom }).map((iv) => ({
            room: m.room,
            start: iv.start,
            end: iv.end,
          })),
        );

  const flow: Flow = fullyFree.length > 0 ? 'A' : partlyFree.length > 0 ? 'B' : taken.length > 0 ? 'C' : 'none';
  // Only worth saying when there is a room to book at all.
  if (requesterEmail && flow !== 'none') {
    const own = await ownBookingClashes(gw, requesterEmail, [req], now);
    warnings.push(...own.map((o) => `${o} One room per person at a time: cancel it first, or pick another time.`));
  }
  return { ok: true, problems, warnings, request: req, flow, fullyFree, partlyFree, taken, alternatives, ...(requested ? { requested } : {}) };
}
