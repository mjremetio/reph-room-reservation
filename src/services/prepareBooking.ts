/**
 * Prepares (never makes) a booking or cancellation for the user to confirm with a button.
 * Shared by the agent tools (propose_booking, request_cancellation) and POST /api/proposals,
 * so the map's "Book this room" follows exactly the same rules as the assistant.
 */
import type { ProposalView } from '../agent/context';
import { newProposal, saveProposal } from '../agent/proposals';
import { HARDWARE_OPTIONS } from '../config/hardware';
import { availabilityFor, ownConflicts } from '../domain/availability';
import { sameEmail } from '../domain/people';
import { describeRecurrence, expandRecurrence, toRecurrenceJson, type Recurrence } from '../domain/recurrence';
import { ISSUE_FIELD, RULES, validateRequest, type FormField } from '../domain/rules';
import { formatManila, formatRange } from '../domain/time';
import type { AgendaType, Interval, Person, Priority, RoomRequest, TrainingType } from '../domain/types';
import type { ReservationGateway } from '../gateway/ReservationGateway';

/** What the reservation form asks for (the requester and division come from the chosen Name of Requestor). */
export interface BookingDraft {
  roomId: string;
  agendaType: AgendaType;
  agenda: string;
  start: Date;
  end: Date;
  participants: number;
  priority?: Priority;
  trainingType?: TrainingType;
  specialInstructions?: string;
  hardwareRequirements?: string[];
  /** Book the same time on every date of the series (all or nothing). */
  recurrence?: Recurrence;
}

/** A failure lists every problem and, when known, the form fields to mark (`ISSUE_FIELD`). */
export type Prepared<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'INVALID' | 'NOT_FOUND' | 'CONFLICT' | 'NOT_ALLOWED'; problems: string[]; fields?: FormField[] };

const dateLabel = (d: Date) => formatManila(d).replace(/, \d{1,2}:\d{2} [AP]M$/, '');

export async function prepareBooking(
  gw: ReservationGateway,
  user: Person & { email: string },
  draft: BookingDraft,
  now: Date,
  holdMinutes: number = RULES.proposalHoldMinutes,
): Promise<Prepared<{ proposal: ProposalView; summary: string }>> {
  const room = (await gw.listRooms()).find((r) => r.id === draft.roomId);
  if (!room) return { ok: false, code: 'NOT_FOUND', problems: [`Unknown room "${draft.roomId}".`], fields: ['room'] };

  const req: RoomRequest = { site: room.site, ...draft };
  const priority = draft.priority ?? 'Normal';
  const issues = validateRequest(req, now, { forBooking: true, room, priority }).filter((i) => i.blocking);
  if (issues.length > 0) {
    return { ok: false, code: 'INVALID', problems: issues.map((i) => i.message), fields: [...new Set(issues.map((i) => ISSUE_FIELD[i.code]))] };
  }

  const unknownHardware = (draft.hardwareRequirements ?? []).filter((h) => !(HARDWARE_OPTIONS as readonly string[]).includes(h));
  if (unknownHardware.length > 0) return { ok: false, code: 'INVALID', problems: [`Unknown hardware option: ${unknownHardware.join(', ')}.`], fields: ['hardware'] };

  // Every date of a series follows the same rules and must be free; one submit books all or none.
  const dates = draft.recurrence ? expandRecurrence(req, draft.recurrence, RULES.maxSeriesDates + 1) : [{ start: req.start, end: req.end }];
  if (dates.length === 0) return { ok: false, code: 'INVALID', problems: ['The repeat pattern gives no dates before the end date.'], fields: ['recurrence'] };
  if (dates.length > RULES.maxSeriesDates) return { ok: false, code: 'INVALID', problems: [`A repeating booking can have at most ${RULES.maxSeriesDates} dates.`], fields: ['recurrence'] };
  if (draft.recurrence && RULES.windowAppliesToEveryDate) {
    const late = dates.flatMap((d) => validateRequest({ ...req, ...d }, now).filter((i) => i.blocking).map((i) => `${dateLabel(d.start)}: ${i.message}`));
    if (late.length > 0) return { ok: false, code: 'INVALID', problems: late.slice(0, 5), fields: ['recurrence'] };
  }
  const last = dates[dates.length - 1] as Interval;
  const bookings = await gw.getBookings({ roomIds: [room.id], from: (dates[0] as Interval).start, to: last.end });
  const clashes = dates.flatMap((d) => {
    const a = availabilityFor(room.id, d, bookings, now);
    return a.kind === 'available' ? [] : [`${dateLabel(d.start)}: taken by ${a.conflicts.map((b) => b.owner.name).join(', ')}`];
  });
  if (clashes.length > 0) {
    const problems = draft.recurrence ? [`${room.name} is not free on ${clashes.length} of ${dates.length} dates.`, ...clashes.slice(0, 5)] : [`${room.name} is no longer free for that whole time.`];
    return { ok: false, code: 'CONFLICT', problems, fields: draft.recurrence ? ['room', 'recurrence'] : ['room', 'time'] };
  }
  const own = await ownBookingClashes(gw, user.email, dates, now);
  if (own.length > 0) {
    const problems = draft.recurrence
      ? [`One room per person at a time: you already have a room on ${own.length} of ${dates.length} dates.`, ...own.slice(0, 5)]
      : [`${own[0]} One room per person at a time.`];
    return { ok: false, code: 'CONFLICT', problems, fields: draft.recurrence ? ['time', 'recurrence'] : ['time'] };
  }

  // Type of Training belongs to training bookings only (RULES: Type of Training); On-Site unless Virtual.
  const trainingType = draft.agendaType === 'Training' ? (draft.trainingType ?? 'On-Site') : undefined;
  const specialInstructions = draft.specialInstructions?.trim() || undefined;
  const hardwareRequirements = draft.hardwareRequirements?.length ? draft.hardwareRequirements : undefined;
  const booking = { ...draft, priority, trainingType, specialInstructions, hardwareRequirements, requester: user };
  const p = newProposal({ kind: 'book', userEmail: user.email, booking }, now, holdMinutes);
  const series = draft.recurrence ? ` · ${dates.length} dates, ${describeRecurrence(draft.recurrence)}` : '';
  const view: ProposalView = {
    id: p.id,
    requester: user.name,
    roomId: room.id,
    roomName: room.name,
    floor: room.floor,
    start: req.start.toISOString(),
    end: req.end.toISOString(),
    agendaType: draft.agendaType,
    agenda: draft.agenda,
    participants: draft.participants,
    priority,
    ...(trainingType ? { trainingType } : {}),
    ...(specialInstructions ? { specialInstructions } : {}),
    ...(hardwareRequirements ? { hardwareRequirements } : {}),
    ...(draft.recurrence ? { recurrence: toRecurrenceJson(draft.recurrence), dates: dates.map((d) => d.start.toISOString()) } : {}),
    expiresAt: p.expiresAt.toISOString(),
  };
  await saveProposal({ ...p, view: { kind: 'book', proposal: view } });
  return { ok: true, value: { summary: `${room.name}, ${room.floor} · ${formatRange(req.start, req.end)} · ${draft.agenda}${series}`, proposal: view } };
}

/**
 * RULES.oneRoomPerPersonAtATime: for each date, the requester's own booking that already holds a room then, e.g.
 * "You already have Tokyo, 2F on Mon, Sep 28, 10:00–11:00 AM (RM-0129902)." Shared with searchRooms' warning.
 */
export async function ownBookingClashes(gw: ReservationGateway, email: string, dates: Interval[], now: Date): Promise<string[]> {
  if (!RULES.oneRoomPerPersonAtATime || dates.length === 0) return [];
  const mine = await gw.listMyBookings(email, (dates[0] as Interval).start, (dates[dates.length - 1] as Interval).end);
  if (mine.length === 0) return [];
  const rooms = new Map((await gw.listRooms()).map((r) => [r.id, r] as const));
  return dates.flatMap((d) =>
    ownConflicts(email, d, mine, now).map((b) => {
      const room = rooms.get(b.roomId);
      const where = room ? `${room.name}, ${room.floor}` : b.roomId;
      return `You already have ${where} on ${formatRange(b.start, b.end)} (${b.ticketNo}).`;
    }),
  );
}

export interface CancelView {
  proposalId: string;
  ticketNo: string;
  summary: string;
  expiresAt: string;
}

export async function prepareCancellation(
  gw: ReservationGateway,
  user: Person & { email: string },
  ticketNo: string,
  now: Date,
  holdMinutes: number = RULES.proposalHoldMinutes,
): Promise<Prepared<CancelView>> {
  const b = await gw.getBooking(ticketNo);
  if (!b || !sameEmail(b.owner.email, user.email)) {
    return { ok: false, code: 'NOT_ALLOWED', problems: ['I can only cancel your own bookings.'] };
  }
  if (b.status === 'Cancelled' || b.status === 'Completed') {
    return { ok: false, code: 'INVALID', problems: [`This booking is already ${b.status.toLowerCase()}.`] };
  }
  const room = (await gw.listRooms()).find((r) => r.id === b.roomId);
  const where = room ? `${room.name}, ${room.floor}` : b.roomId;
  const p = newProposal({ kind: 'cancel', userEmail: user.email, ticketNo: b.ticketNo }, now, holdMinutes);
  const cancel: CancelView = { proposalId: p.id, ticketNo: b.ticketNo, summary: `${b.agenda} · ${where} · ${formatRange(b.start, b.end)}`, expiresAt: p.expiresAt.toISOString() };
  await saveProposal({ ...p, view: { kind: 'cancel', cancel } });
  return { ok: true, value: cancel };
}
