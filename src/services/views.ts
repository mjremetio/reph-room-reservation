/**
 * JSON views shared by the agent tools and the API routes, so the map, the cards and the model
 * always see the same data. Also the privacy filter for other people's bookings (docs/spec/09-quality.md).
 */
import type { AlternativeView, RoomResultView, ScheduleView } from '../agent/context';
import { sameEmail } from '../domain/people';
import { toRecurrenceJson } from '../domain/recurrence';
import type { Booking, Room } from '../domain/types';
import type { ScheduleResult } from './roomSchedule';
import type { RoomMatch, SearchResult } from './searchRooms';

const iso = (d: Date) => d.toISOString();

export function roomView(r: Room) {
  return { id: r.id, name: r.name, toolName: r.toolName, site: r.site, building: r.building, floor: r.floor, kind: r.kind, av: r.av, capacity: r.capacity, agendas: r.agendas, selfBookable: r.selfBookable };
}
export type RoomView = ReturnType<typeof roomView>;

/** A room as Admin sees it (/api/admin/rooms): with the data notes ("Verify capacity"), which people don't see. */
export const adminRoomView = (r: Room) => ({ ...roomView(r), notes: r.notes ?? null });
export type AdminRoomView = ReturnType<typeof adminRoomView>;

/** The rest of the tool's fields: only for the owner, and for Admin. */
function formFields(b: Booking) {
  return {
    agenda: b.agenda,
    agendaType: b.agendaType,
    priority: b.priority,
    trainingType: b.trainingType,
    specialInstructions: b.specialInstructions,
    hardwareRequirements: b.hardwareRequirements,
    recurrence: b.recurrence ? toRecurrenceJson(b.recurrence) : undefined,
    createdBy: b.createdBy,
    createdAt: b.createdAt ? iso(b.createdAt) : undefined,
    modifiedBy: b.modifiedBy,
    adminComments: b.adminComments,
  };
}

/**
 * A booking as another person may see it: owner name, division, time, group size and status.
 * The viewer's own bookings also carry the rest of the tool's fields (agenda, category, priority, training type,
 * special instructions, hardware, recurrence, created by/at, modified by, admin comments) and `mine: true`. Never emails.
 */
export function publicBooking(b: Booking, viewerEmail: string) {
  const mine = sameEmail(b.owner.email, viewerEmail);
  return {
    ticketNo: b.ticketNo,
    roomId: b.roomId,
    start: iso(b.start),
    end: iso(b.end),
    status: b.status,
    owner: b.owner.name,
    division: b.owner.division ?? null,
    participants: b.participants,
    mine,
    ...(mine ? formFields(b) : {}),
  };
}
export type PublicBooking = ReturnType<typeof publicBooking>;

/** A booking as Admin sees it, only in /api/admin/* responses: every field of the tool and the owner's e-mail. */
export function adminBooking(b: Booking, viewerEmail: string) {
  return { ...publicBooking(b, viewerEmail), ...formFields(b), ownerEmail: b.owner.email ?? null };
}
export type AdminBooking = ReturnType<typeof adminBooking>;

function resultView(m: RoomMatch, viewerEmail: string, rank?: number): RoomResultView {
  const a = m.availability;
  return {
    roomId: m.room.id,
    name: m.room.name,
    floor: m.room.floor,
    availability: a.kind,
    rank,
    reasons: m.reasons,
    free: a.kind === 'partial' ? a.free.map((f) => ({ start: iso(f.start), end: iso(f.end) })) : undefined,
    conflicts:
      a.kind === 'available'
        ? undefined
        : a.conflicts.map((b) => ({
            ticketNo: b.ticketNo,
            start: iso(b.start),
            end: iso(b.end),
            owner: b.owner.name,
            division: b.owner.division,
            participants: b.participants,
            status: b.status,
            mine: sameEmail(b.owner.email, viewerEmail),
          })),
  };
}

/** The `room_results` payload: free rooms ranked 1..n, then partly free, then taken. `mine` marks the viewer's own bookings. */
export function searchResultViews(result: SearchResult, viewerEmail: string): { results: RoomResultView[]; alternatives: AlternativeView[] } {
  return {
    results: [
      ...result.fullyFree.map((m, i) => resultView(m, viewerEmail, i + 1)),
      ...result.partlyFree.map((m) => resultView(m, viewerEmail)),
      ...result.taken.map((m) => resultView(m, viewerEmail)),
    ],
    alternatives: result.alternatives.map((a) => ({ roomId: a.room.id, name: a.room.name, floor: a.room.floor, start: iso(a.start), end: iso(a.end) })),
  };
}

/** The `room_schedule` payload for the schedule card (same privacy filter as the map). */
export function scheduleView(result: Extract<ScheduleResult, { ok: true }>): ScheduleView {
  return {
    start: iso(result.window.start),
    end: iso(result.window.end),
    rooms: result.rooms.map((s) => ({
      roomId: s.room.id,
      name: s.room.name,
      floor: s.room.floor,
      bookings: s.bookings,
      free: s.free.map((f) => ({ start: iso(f.start), end: iso(f.end) })),
    })),
    more: result.more,
    freeRooms: result.freeRooms.map((r) => ({ roomId: r.id, name: r.name, floor: r.floor })),
  };
}
