/**
 * Admin's room blocks and bulk bookings (docs/spec/02-flows.md F35, F36): check them before the gateway writes, and
 * list the bookings they would cancel, so Admin sees who is affected before pressing the button (the owner's request,
 * 1 Oct 2026). The gateway checks the rooms and the clashes again when Admin confirms.
 */
import { conflictsFor } from '../domain/availability';
import { sameEmail } from '../domain/people';
import { expandRecurrence, type Recurrence } from '../domain/recurrence';
import { ISSUE_FIELD, RULES, validateRequest, type Issue } from '../domain/rules';
import type { AgendaType, Booking, Interval, Priority, Room, TrainingType } from '../domain/types';
import type { ReservationGateway, Requestor } from '../gateway/ReservationGateway';
import { bookingLabel } from './adminBookings';
import type { Prepared } from './prepareBooking';

type Failed = Extract<Prepared<never>, { ok: false }>;

/** Our own limits for one block or bulk booking: rooms in it, bookings it makes, days a block lasts. */
export const BULK_LIMITS = { rooms: 30, bookings: 100, blockDays: 92 };

const DAY_MS = 24 * 3_600_000;

export interface BlockPlan {
  rooms: Room[];
  start: Date;
  end: Date;
  reason: string;
  /** The bookings the block would cancel, soonest first. */
  affected: Booking[];
}

export async function prepareRoomBlock(gw: ReservationGateway, input: { roomIds: string[]; start: Date; end: Date; reason: string }, now: Date): Promise<Prepared<BlockPlan>> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, code: 'INVALID', problems: ['Add the reason, for example "Aircon maintenance".'] };
  const rooms = await pickRooms(gw, input.roomIds);
  if (!rooms.ok) return rooms;
  const { start, end } = input;
  if (end.getTime() <= start.getTime()) return { ok: false, code: 'INVALID', problems: ['The end must be after the start.'], fields: ['time'] };
  if (start.getTime() < now.getTime() - RULES.startGraceMinutes * 60_000) return { ok: false, code: 'INVALID', problems: ['That time has already started: block from now on.'], fields: ['time'] };
  if (end.getTime() - start.getTime() > BULK_LIMITS.blockDays * DAY_MS) return { ok: false, code: 'INVALID', problems: [`A block can last up to ${BULK_LIMITS.blockDays} days.`], fields: ['time'] };
  const held = await holdersOf(gw, rooms.value.map((r) => ({ roomId: r.id, start, end })), now, rooms.value);
  if (!held.ok) return held;
  return { ok: true, value: { rooms: rooms.value, start, end, reason, affected: held.value } };
}

export interface BulkInput {
  roomIds: string[];
  start: Date;
  end: Date;
  recurrence?: Recurrence;
  agenda: string;
  agendaType: AgendaType;
  participants: number;
  /** Who it is for: someone with an account or in the tool's employee list (bookablePeople); none = the signed-in Admin. */
  ownerEmail?: string;
  priority?: Priority;
  trainingType?: TrainingType;
  specialInstructions?: string;
}

export interface BulkPlan {
  rooms: Room[];
  /** Every date (one interval each); one booking per room per date. */
  dates: Interval[];
  owner: Requestor;
  /** The bookings the bulk booking would cancel, soonest first. */
  affected: Booking[];
}

/** `people`: the app's active accounts, who may be booked for besides the tool's employee list. */
export async function prepareBulkBooking(gw: ReservationGateway, input: BulkInput, admin: Requestor, now: Date, people: readonly Requestor[] = []): Promise<Prepared<BulkPlan>> {
  const rooms = await pickRooms(gw, input.roomIds);
  if (!rooms.ok) return rooms;
  let owner = admin;
  if (input.ownerEmail && !sameEmail(input.ownerEmail, admin.email)) {
    const found = (await bookablePeople(gw, people)).find((p) => sameEmail(p.email, input.ownerEmail));
    if (!found) return { ok: false, code: 'NOT_FOUND', problems: [`${input.ownerEmail} has no account and is not in the employee list.`] };
    owner = found;
  }
  // Each room's rules as for an Admin change: the booking window, Admin-only rooms and the Urgent hint may be set aside.
  const req = { start: input.start, end: input.end, agendaType: input.agendaType, participants: input.participants, agenda: input.agenda };
  const issues = rooms.value.flatMap((room) =>
    validateRequest({ ...req, site: room.site }, now, { forBooking: true, room, priority: input.priority }).filter((i) => i.blocking && !RULES.adminMayOverride.includes(i.code)),
  );
  if (issues.length > 0) return invalid(issues);
  const dates = input.recurrence ? expandRecurrence(req, input.recurrence, RULES.maxSeriesDates + 1) : [{ start: input.start, end: input.end }];
  if (dates.length === 0) return { ok: false, code: 'INVALID', problems: ['The repeat pattern gives no dates before the end date.'], fields: ['recurrence'] };
  if (dates.length > RULES.maxSeriesDates) return { ok: false, code: 'INVALID', problems: [`A repeating booking can have at most ${RULES.maxSeriesDates} dates.`], fields: ['recurrence'] };
  const count = rooms.value.length * dates.length;
  if (count > BULK_LIMITS.bookings) {
    return { ok: false, code: 'INVALID', problems: [`That is ${count} bookings (${rooms.value.length} rooms × ${dates.length} dates); one bulk booking makes up to ${BULK_LIMITS.bookings}.`], fields: ['room', 'recurrence'] };
  }
  const held = await holdersOf(gw, rooms.value.flatMap((r) => dates.map((d) => ({ roomId: r.id, ...d }))), now, rooms.value);
  if (!held.ok) return held;
  return { ok: true, value: { rooms: rooms.value, dates, owner, affected: held.value } };
}

/** Who Admin may book for: the app's accounts (`accounts`) and the tool's employee list, each person once. */
export async function bookablePeople(gw: ReservationGateway, accounts: readonly Requestor[]): Promise<Requestor[]> {
  const all = [...accounts, ...(await gw.listPeople())];
  return all.filter((p, i) => all.findIndex((q) => sameEmail(q.email, p.email)) === i);
}

/** The rooms by id, each once: INVALID for none or too many, NOT_FOUND for an unknown one. */
async function pickRooms(gw: ReservationGateway, ids: string[]): Promise<Prepared<Room[]>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { ok: false, code: 'INVALID', problems: ['Pick at least one room.'], fields: ['room'] };
  if (unique.length > BULK_LIMITS.rooms) return { ok: false, code: 'INVALID', problems: [`Pick up to ${BULK_LIMITS.rooms} rooms at a time.`], fields: ['room'] };
  const all = await gw.listRooms();
  const rooms: Room[] = [];
  for (const id of unique) {
    const room = all.find((r) => r.id === id);
    if (!room) return { ok: false, code: 'NOT_FOUND', problems: [`Unknown room "${id}".`], fields: ['room'] };
    rooms.push(room);
  }
  return { ok: true, value: rooms };
}

/**
 * The bookings holding any of these slots now (what a block or bulk booking would cancel), soonest first. A room block
 * in the way stops it instead (NOT_ALLOWED): overriding cancels people's bookings, never another block.
 */
async function holdersOf(gw: ReservationGateway, slots: Array<{ roomId: string } & Interval>, now: Date, rooms: Room[]): Promise<Prepared<Booking[]>> {
  if (slots.length === 0) return { ok: true, value: [] };
  const from = new Date(Math.min(...slots.map((s) => s.start.getTime())));
  const to = new Date(Math.max(...slots.map((s) => s.end.getTime())));
  const bookings = await gw.getBookings({ roomIds: [...new Set(slots.map((s) => s.roomId))], from, to });
  const hit = new Map<string, Booking>();
  for (const s of slots) for (const b of conflictsFor(s.roomId, s, bookings, now)) hit.set(b.ticketNo, b);
  const sorted = [...hit.values()].sort((a, b) => a.start.getTime() - b.start.getTime() || a.roomId.localeCompare(b.roomId));
  const blocks = sorted.filter((b) => b.status === 'Blocked');
  if (blocks.length > 0) {
    const lines = blocks.slice(0, 5).map((b) => `Admin already blocked ${bookingLabel(b, rooms)}: ${b.agenda} (${b.ticketNo}).`);
    return { ok: false, code: 'NOT_ALLOWED', problems: [...lines, 'Lift that block first (Admin › Bookings, status Blocked), then try again.'], fields: ['room', 'time'] };
  }
  return { ok: true, value: sorted };
}

function invalid(issues: Issue[]): Failed {
  return { ok: false, code: 'INVALID', problems: [...new Set(issues.map((i) => i.message))], fields: [...new Set(issues.map((i) => ISSUE_FIELD[i.code]))] };
}
