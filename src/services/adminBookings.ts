/**
 * Admin changes to bookings (docs/spec/02-flows.md F30): check the rules before the gateway writes, and say what
 * changed in plain words for the audit log and the automatic note in the booking's thread.
 */
import { conflictsFor, ownConflicts } from '../domain/availability';
import { adminChangeIssues, checkInWindow, ISSUE_FIELD, roomIssues, RULES } from '../domain/rules';
import { formatManila, formatRange } from '../domain/time';
import type { Booking, Room } from '../domain/types';
import type { BookingChanges, ReservationGateway } from '../gateway/ReservationGateway';
import type { Prepared } from './prepareBooking';

type Failed = Extract<Prepared<never>, { ok: false }>;

/** "Tokyo, 2F · Mon, Sep 28, 3:00 PM – 4:00 PM" (the room id when the room is unknown). */
export function bookingLabel(b: Pick<Booking, 'roomId' | 'start' | 'end'>, rooms: Room[]): string {
  const room = rooms.find((r) => r.id === b.roomId);
  return `${room ? `${room.name}, ${room.floor}` : b.roomId} · ${formatRange(b.start, b.end)}`;
}

/** What changed, e.g. "room Tokyo, 2F → Paris, 2F; people 5 → 8". Empty when nothing did. */
export function describeChange(before: Booking, after: Booking, rooms: Room[]): string {
  const name = (id: string) => {
    const r = rooms.find((x) => x.id === id);
    return r ? `${r.name}, ${r.floor}` : id;
  };
  const parts: string[] = [];
  if (before.roomId !== after.roomId) parts.push(`room ${name(before.roomId)} → ${name(after.roomId)}`);
  if (before.start.getTime() !== after.start.getTime() || before.end.getTime() !== after.end.getTime()) {
    parts.push(`time ${formatRange(before.start, before.end)} → ${formatRange(after.start, after.end)}`);
  }
  if (before.participants !== after.participants) parts.push(`people ${before.participants} → ${after.participants}`);
  if (before.agendaType !== after.agendaType) parts.push(`type ${before.agendaType} → ${after.agendaType}`);
  if (before.agenda !== after.agenda) parts.push(`agenda "${before.agenda}" → "${after.agenda}"`);
  if ((before.priority ?? 'Normal') !== (after.priority ?? 'Normal')) parts.push(`priority ${before.priority ?? 'Normal'} → ${after.priority ?? 'Normal'}`);
  return parts.join('; ');
}

/**
 * A clash in words for Admin: "The room is taken then. Tester, Alpha has Tokyo, 2F · … (RM-…)." or, for the owner's
 * other booking, "The owner already has another room then (one room per person at a time). …".
 */
export function clash(kind: 'room' | 'requester', conflicts: Booking[], rooms: Room[]): Failed {
  const head = kind === 'requester' ? 'The owner already has another room then (one room per person at a time).' : 'The room is taken then.';
  const lines = conflicts.slice(0, 5).map((c) => `${c.owner.name} has ${bookingLabel(c, rooms)} (${c.ticketNo}).`);
  return { ok: false, code: 'CONFLICT', problems: [[head, lines[0]].filter(Boolean).join(' '), ...lines.slice(1)], fields: kind === 'requester' ? ['time'] : ['room', 'time'] };
}

/**
 * Whether `next` fits: its room free then (apart from `except`) and, when its time moved, its owner holding no other
 * room then (one room per person). A booking that keeps its time can't create a new overlap for its owner.
 */
async function fits(gw: ReservationGateway, next: Booking, except: Booking[], rooms: Room[], now: Date, timeMoved: boolean): Promise<Failed | null> {
  const skip = (b: Booking) => except.some((x) => x.ticketNo === b.ticketNo);
  const around = (await gw.getBookings({ roomIds: [next.roomId], from: next.start, to: next.end })).filter((b) => !skip(b));
  const taken = conflictsFor(next.roomId, next, around, now);
  if (taken.length > 0) return clash('room', taken, rooms);
  if (timeMoved && RULES.oneRoomPerPersonAtATime && next.owner.email) {
    const mine = (await gw.listMyBookings(next.owner.email, next.start, next.end)).filter((b) => !skip(b));
    const own = ownConflicts(next.owner.email, next, mine, now);
    if (own.length > 0) return clash('requester', own, rooms);
  }
  return null;
}

/**
 * Checks an Admin change against the rules (adminChangeIssues) and for clashes before the gateway (which checks the
 * clashes again) writes it. Fails INVALID (with the form fields to mark), NOT_FOUND, CONFLICT, or NOT_ALLOWED for a
 * cancelled or completed booking.
 */
export async function prepareAdminChange(
  gw: ReservationGateway,
  ticketNo: string,
  changes: BookingChanges,
  now: Date,
): Promise<Prepared<{ before: Booking; after: Booking; rooms: Room[] }>> {
  const before = await gw.getBooking(ticketNo);
  if (!before) return { ok: false, code: 'NOT_FOUND', problems: [`Booking ${ticketNo} not found.`] };
  if (before.status === 'Cancelled' || before.status === 'Completed') return { ok: false, code: 'NOT_ALLOWED', problems: [`${ticketNo} is ${before.status}.`] };
  const set = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)) as BookingChanges;
  const after: Booking = { ...before, ...set };
  const rooms = await gw.listRooms();
  const room = rooms.find((r) => r.id === after.roomId);
  if (!room) return { ok: false, code: 'NOT_FOUND', problems: [`Unknown room "${after.roomId}".`], fields: ['room'] };
  if (!describeChange(before, after, rooms)) return { ok: false, code: 'INVALID', problems: ['Nothing to change.'] };
  const blocking = adminChangeIssues(before, after, room, now).filter((i) => i.blocking);
  if (blocking.length > 0) {
    return { ok: false, code: 'INVALID', problems: blocking.map((i) => i.message), fields: [...new Set(blocking.map((i) => ISSUE_FIELD[i.code]))] };
  }
  const timeMoved = after.start.getTime() !== before.start.getTime() || after.end.getTime() !== before.end.getTime();
  const clashes = await fits(gw, after, [before], rooms, now, timeMoved);
  return clashes ?? { ok: true, value: { before, after, rooms } };
}

/** Checks that two bookings can exchange rooms (the gateway checks again when Admin confirms). */
export async function prepareAdminSwap(gw: ReservationGateway, ticketA: string, ticketB: string, now: Date): Promise<Prepared<{ a: Booking; b: Booking; rooms: Room[] }>> {
  const [a, b] = await Promise.all([gw.getBooking(ticketA), gw.getBooking(ticketB)]);
  if (!a || !b) return { ok: false, code: 'NOT_FOUND', problems: [`Booking ${!a ? ticketA : ticketB} not found.`] };
  if (a.ticketNo === b.ticketNo) return { ok: false, code: 'INVALID', problems: ['Pick two different bookings.'] };
  for (const x of [a, b]) if (x.status === 'Cancelled' || x.status === 'Completed') return { ok: false, code: 'NOT_ALLOWED', problems: [`${x.ticketNo} is ${x.status}.`] };
  if (a.roomId === b.roomId) return { ok: false, code: 'INVALID', problems: ['Both bookings are in the same room.'] };
  const rooms = await gw.listRooms();
  // Each must suit the other's room: its Types of agenda and capacity (the owner's room booking list).
  const wrong = ([[a, b.roomId], [b, a.roomId]] as const).flatMap(([x, roomId]) => {
    const room = rooms.find((r) => r.id === roomId);
    return room ? roomIssues(room, x.agendaType, x.participants).map((i) => `${x.ticketNo}: ${i.message}`) : [];
  });
  if (wrong.length > 0) return { ok: false, code: 'INVALID', problems: wrong };
  const clashes = (await fits(gw, { ...a, roomId: b.roomId }, [a, b], rooms, now, false)) ?? (await fits(gw, { ...b, roomId: a.roomId }, [a, b], rooms, now, false));
  return clashes ?? { ok: true, value: { a, b, rooms } };
}

export type AdminAction = 'approve' | 'reject' | 'cancel' | 'checkin';

/** Whether Admin can approve, turn down, cancel or check in this booking now (the gateway checks again on the button). */
export async function prepareAdminAction(gw: ReservationGateway, ticketNo: string, action: AdminAction, comment: string | null, now: Date): Promise<Prepared<{ booking: Booking; rooms: Room[] }>> {
  const booking = await gw.getBooking(ticketNo);
  if (!booking) return { ok: false, code: 'NOT_FOUND', problems: [`Booking ${ticketNo} not found.`] };
  const no = (problem: string): Failed => ({ ok: false, code: 'NOT_ALLOWED', problems: [problem] });
  if ((action === 'approve' || action === 'reject') && booking.status !== 'In Progress') return no(`${ticketNo} is ${booking.status}, not waiting for Admin.`);
  if (action === 'reject' && !comment?.trim()) return { ok: false, code: 'INVALID', problems: ['A request is turned down with a reason. Ask the Admin for one.'] };
  if (action === 'cancel' && (booking.status === 'Cancelled' || booking.status === 'Completed')) return no(`${ticketNo} is already ${booking.status}.`);
  if (action === 'checkin') {
    if (booking.status !== 'Approved' && booking.status !== 'In Progress') return no(`${ticketNo} is ${booking.status}.`);
    const w = checkInWindow(booking);
    if (now < w.start || now >= w.end) return no(`Check-in is open from ${formatManila(w.start)} until ${formatManila(w.end)}.`);
  }
  return { ok: true, value: { booking, rooms: await gw.listRooms() } };
}
