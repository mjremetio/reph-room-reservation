import type { AgendaType, Booking, BookingStatus, Interval, Priority, Room, RoomRequest } from './types';
import { addMinutes, manilaMinuteOfDay, minutesBetween } from './time';

/**
 * Business rules for REPH room reservations.
 * Sources: "Room Reservation Guidelines" v3.0 (Corporate Services - Admin, Jan 2025) and the current reservation form.
 * Anything marked OPEN must be confirmed with Admin before go-live (see docs/RULES.md).
 */
export const RULES = {
  /**
   * Maximum days ahead a booking can start. null = no limit known.
   * Guidelines p.11: meeting rooms max 10 days. Form note: Meeting, Training and MPH up to 90 days.
   * OPEN: the sources conflict for meetings. Using the stricter 10 days until Admin confirms.
   */
  maxDaysAhead: {
    Meeting: 10,
    Training: 90,
    'Multi-purpose': 90,
    Pantry: null,
    'Lactation Room': null,
  } as Record<AgendaType, number | null>,
  /** Guidelines p.6 and p.11: a room not used 15 minutes after the start is released for others. */
  checkInGraceMinutes: 15,
  /**
   * Guidelines p.6 and p.11, and the owner's request (1 Oct 2026): a booking nobody checked in to by the end of the
   * grace period is cancelled and its room freed (`shouldAutoRelease`). OPEN: question 3, does the tool do it itself?
   */
  autoReleaseNoShows: true,
  /** Guidelines p.6: reminder email 1 hour before. OPEN: we assume check-in opens at the reminder. */
  checkInOpensMinutesBefore: 60,
  /**
   * The owner's room booking list (1 Oct 2026): these Types of agenda need Admin's approval, so they stay "In Progress"
   * (Guidelines 3.5) until Admin approves them; the others (Meeting, Lactation Room) are Approved on Confirm. Which rooms
   * each type can book, and their capacities, are in src/data/rooms.ts (`agendas`, `capacity`).
   */
  needsApproval: ['Training', 'Pantry', 'Multi-purpose'] as AgendaType[],
  /** Guidelines p.11: training room requests must fit one shift. Minutes from midnight; the night shift runs past 24:00. */
  trainingShifts: [
    { label: '6 AM–2 PM', startMin: 6 * 60, endMin: 14 * 60 },
    { label: '2 PM–10 PM', startMin: 14 * 60, endMin: 22 * 60 },
    { label: '10 PM–6 AM', startMin: 22 * 60, endMin: 30 * 60 },
  ],
  /** Our own rule, not the tool's: a request may start up to this many minutes ago (typing takes a moment). */
  startGraceMinutes: 5,
  /** Our own rule, not the tool's: how long an assistant proposal waits for the user to press Confirm. */
  proposalHoldMinutes: 3,
  /**
   * Our own rule: a proposal an AI app prepared over MCP waits this long, because the person opens its confirm link
   * from that app. It holds no room (only Confirm books, after checking again), so a longer wait blocks nobody.
   */
  linkProposalHoldMinutes: 15,
  /** Our own limit for one recurring request (Guidelines 3.6 has none). */
  maxSeriesDates: 100,
  /** OPEN: does the booking window (maxDaysAhead) apply to every date of a series, or only the first? Strict until Admin says. */
  windowAppliesToEveryDate: true,
  /**
   * Our own rule, not the tool's (the owner asked for it on 28 Sep 2026): one person holds one room at a time, so a
   * requestor can't book a second room that overlaps a booking they already have. OPEN: may Admin book for several teams?
   */
  oneRoomPerPersonAtATime: true,
  /**
   * Our own rule (Admin pages, 30 Sep 2026): the checks Admin may set aside when changing a booking. The self-service
   * booking window, Admin-only rooms (Admin books the visitor offices, Guidelines p.11) and the Urgent hint.
   * OPEN: which rules bind Admin in the tool? The rest (times, participants, agenda, training shift, clashes, and the
   * room's Types of agenda and capacity from the owner's room booking list) still apply.
   */
  adminMayOverride: ['TOO_FAR_AHEAD', 'NOT_SELF_BOOKABLE', 'URGENT_NOT_ALLOWED'] as IssueCode[],
};

/** The status a new booking gets from the tool: "In Progress" while it waits for Admin (RULES.needsApproval), else Approved. */
export function initialStatus(agendaType: AgendaType): BookingStatus {
  return RULES.needsApproval.includes(agendaType) ? 'In Progress' : 'Approved';
}

export type IssueCode =
  | 'END_BEFORE_START'
  | 'IN_PAST'
  | 'TOO_FAR_AHEAD'
  | 'NO_PARTICIPANTS'
  | 'AGENDA_MISSING'
  | 'AGENDA_TOO_GENERIC'
  | 'TRAINING_SHIFT'
  | 'NOT_SELF_BOOKABLE'
  | 'ROOM_NOT_FOR_AGENDA'
  | 'OVER_CAPACITY'
  | 'WRONG_SITE'
  | 'URGENT_NOT_ALLOWED';

/** The part of the reservation form a problem is about, so the form can mark that field (red border). */
export type FormField = 'agenda' | 'participants' | 'time' | 'priority' | 'room' | 'hardware' | 'recurrence';

export const ISSUE_FIELD: Record<IssueCode, FormField> = {
  END_BEFORE_START: 'time',
  IN_PAST: 'time',
  TOO_FAR_AHEAD: 'time',
  TRAINING_SHIFT: 'time',
  NO_PARTICIPANTS: 'participants',
  OVER_CAPACITY: 'participants',
  AGENDA_MISSING: 'agenda',
  AGENDA_TOO_GENERIC: 'agenda',
  URGENT_NOT_ALLOWED: 'priority',
  NOT_SELF_BOOKABLE: 'room',
  ROOM_NOT_FOR_AGENDA: 'room',
  WRONG_SITE: 'room',
};

export interface Issue {
  code: IssueCode;
  message: string;
  /** true = cannot continue; false = warn and continue. */
  blocking: boolean;
}

const GENERIC_TITLES = new Set([
  'meeting', 'meetings', 'mtg', 'training', 'trainings', 'meeting room', 'training room',
  'room', 'reservation', 'booking', 'test', 'n/a', 'na', 'tbd',
]);

/** Guidelines 3.5: the tool rejects "Meeting" or "Training" alone as an agenda. */
export function checkAgendaTitle(title: string | undefined): Issue | null {
  const t = (title ?? '').trim().toLowerCase().replace(/[.!?\s]+$/g, '');
  if (!t) {
    return { code: 'AGENDA_MISSING', blocking: true, message: 'Add the title of the meeting or training, for example "Weekly touchpoint meeting".' };
  }
  if (GENERIC_TITLES.has(t)) {
    return {
      code: 'AGENDA_TOO_GENERIC',
      blocking: true,
      message: '"Meeting" or "Training" on its own is not accepted. Use the actual title, for example "New Doc Process – Content Analysis".',
    };
  }
  return null;
}

/** True if a training booking starts and ends within one shift (6 AM–2 PM, 2 PM–10 PM or 10 PM–6 AM). */
export function fitsOneTrainingShift(start: Date, end: Date): boolean {
  const duration = minutesBetween(start, end);
  if (duration <= 0) return false;
  let s = manilaMinuteOfDay(start);
  if (s < 6 * 60) s += 24 * 60; // 00:00-05:59 belongs to the night shift that started at 10 PM
  const shift = RULES.trainingShifts.find((sh) => s >= sh.startMin && s < sh.endMin);
  return !!shift && s + duration <= shift.endMin;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Checks a request against the rules. Search checks skip the agenda title;
 * pass forBooking to check everything needed to create the booking.
 */
export function validateRequest(req: RoomRequest, now: Date, opts: { forBooking?: boolean; room?: Room; priority?: Priority } = {}): Issue[] {
  const issues: Issue[] = [];
  if (req.end.getTime() <= req.start.getTime()) {
    issues.push({ code: 'END_BEFORE_START', blocking: true, message: 'The end time must be after the start time.' });
  }
  if (req.start.getTime() < now.getTime() - RULES.startGraceMinutes * 60_000) {
    issues.push({ code: 'IN_PAST', blocking: true, message: 'That time has already passed.' });
  }
  const maxDays = RULES.maxDaysAhead[req.agendaType];
  if (maxDays !== null && req.start.getTime() - now.getTime() > maxDays * DAY_MS) {
    issues.push({ code: 'TOO_FAR_AHEAD', blocking: true, message: `${req.agendaType} bookings can be made up to ${maxDays} days ahead.` });
  }
  if (!Number.isInteger(req.participants) || req.participants < 1) {
    issues.push({ code: 'NO_PARTICIPANTS', blocking: true, message: 'Add the number of participants.' });
  }
  if (req.agendaType === 'Training' && !fitsOneTrainingShift(req.start, req.end)) {
    issues.push({
      code: 'TRAINING_SHIFT',
      blocking: true,
      message: 'Training bookings must fit within one shift: 6 AM–2 PM, 2 PM–10 PM or 10 PM–6 AM.',
    });
  }
  if (opts.room) {
    if (!opts.room.selfBookable) {
      issues.push({ code: 'NOT_SELF_BOOKABLE', blocking: true, message: `${opts.room.name} is booked through Admin, not self-service.` });
    }
    issues.push(...roomIssues(opts.room, req.agendaType, req.participants));
    if (opts.room.site !== req.site) {
      issues.push({ code: 'WRONG_SITE', blocking: true, message: `${opts.room.name} is in ${opts.room.site}, not ${req.site}.` });
    }
  }
  if (opts.forBooking) {
    const agendaIssue = checkAgendaTitle(req.agenda);
    if (agendaIssue) issues.push(agendaIssue);
  }
  // Form: 'Select "URGENT" only if training starts in less than two weeks, or a meeting is within 12–24 business hours.'
  if (opts.priority === 'Urgent' && !urgentAllowed(req.agendaType, req.start, now)) {
    issues.push({
      code: 'URGENT_NOT_ALLOWED',
      blocking: true,
      message: 'Urgent is only for training that starts in less than two weeks, or a meeting within the next 24 hours. Use Normal.',
    });
  }
  return issues;
}

/**
 * The owner's room booking list (1 Oct 2026): a room takes only its Types of agenda (`room.agendas`; none = it can't be
 * booked) and at most its capacity. Binds everyone, Admin too: the form, the assistant, AI apps, Confirm, Admin
 * changes and swaps, and the gateway itself.
 */
export function roomIssues(room: Room, agendaType: AgendaType, participants: number): Issue[] {
  const issues: Issue[] = [];
  if (!room.agendas.includes(agendaType)) {
    const message = room.agendas.length === 0 ? `${room.name} can't be booked.` : `${room.name} can be booked for ${room.agendas.join(' or ')} only, not ${agendaType}.`;
    issues.push({ code: 'ROOM_NOT_FOR_AGENDA', blocking: true, message });
  }
  if (room.capacity !== null && participants > room.capacity) {
    issues.push({ code: 'OVER_CAPACITY', blocking: true, message: `${room.name} holds up to ${room.capacity} people, not ${participants}.` });
  }
  return issues;
}

/** A change that moves a booking (room, Type of agenda, participants or time), so the room's rules (roomIssues) apply again. */
export function placementChanged(before: Booking, after: Booking): boolean {
  return (
    before.roomId !== after.roomId ||
    before.agendaType !== after.agendaType ||
    before.participants !== after.participants ||
    before.start.getTime() !== after.start.getTime() ||
    before.end.getTime() !== after.end.getTime()
  );
}

const ROOM_RULES: IssueCode[] = ['ROOM_NOT_FOR_AGENDA', 'OVER_CAPACITY'];

/**
 * The rule problems with an Admin change to a booking: validateRequest for the changed booking, without the checks in
 * RULES.adminMayOverride. A start that stays as it was may already have passed (Admin can extend a running booking).
 * The room's rules apply to a change that moves the booking (placementChanged), so Admin can still fix the title of a
 * booking made before them, e.g. in a room that can no longer be booked.
 */
export function adminChangeIssues(before: Booking, next: Booking, room: Room, now: Date): Issue[] {
  const startChanged = next.start.getTime() !== before.start.getTime();
  const moved = placementChanged(before, next);
  const req: RoomRequest = { site: room.site, start: next.start, end: next.end, agendaType: next.agendaType, participants: next.participants, agenda: next.agenda };
  return validateRequest(req, now, { forBooking: true, room, priority: next.priority }).filter(
    (i) => !RULES.adminMayOverride.includes(i.code) && !(i.code === 'IN_PAST' && !startChanged) && (moved || !ROOM_RULES.includes(i.code)),
  );
}

/**
 * Form hint: "Urgent" only if training starts in less than two weeks, or a meeting is within 12-24 business hours.
 * OPEN: how "business hours" are counted in a 24/7 office. This uses plain hours.
 */
export function urgentAllowed(agendaType: AgendaType, start: Date, now: Date): boolean {
  const hours = (start.getTime() - now.getTime()) / 3_600_000;
  if (hours < 0) return false;
  if (agendaType === 'Training') return hours < 14 * 24;
  if (agendaType === 'Meeting') return hours <= 24;
  return false;
}

/**
 * The earliest start a booking can have now: this quarter hour while it is still inside RULES.startGraceMinutes,
 * else the next quarter hour (9:04 → 9:00, 9:06 → 9:15). Free times shown to people start here, never in the past.
 */
export function bookableFrom(now: Date): Date {
  const quarter = 15 * 60_000;
  const floor = Math.floor(now.getTime() / quarter) * quarter;
  return new Date(now.getTime() - floor <= RULES.startGraceMinutes * 60_000 ? floor : floor + quarter);
}

/** When check-in is possible: from the reminder until the release time. */
export function checkInWindow(b: Pick<Booking, 'start'>): Interval {
  return {
    start: addMinutes(b.start, -RULES.checkInOpensMinutesBefore),
    end: addMinutes(b.start, RULES.checkInGraceMinutes),
  };
}

/** Guidelines p.11: a booking nobody checked in to is released 15 minutes after the start. */
export function shouldAutoRelease(b: Booking, now: Date): boolean {
  const waiting = b.status === 'Approved' || b.status === 'In Progress';
  return waiting && now.getTime() >= addMinutes(b.start, RULES.checkInGraceMinutes).getTime();
}
