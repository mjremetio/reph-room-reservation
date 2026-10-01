/**
 * Request schemas for every API route (docs/spec/04-api.md, Conventions). Times in requests are
 * ISO 8601 with an offset, e.g. 2026-09-28T15:00:00+08:00.
 */
import { z } from 'zod';
import { HARDWARE_OPTIONS } from '../../config/hardware';
import { WEEK_OF_MONTH, WEEKDAYS } from '../../domain/recurrence';

const AGENDA_TYPES = ['Meeting', 'Training', 'Pantry', 'Lactation Room', 'Multi-purpose'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export const isoTime = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const site = z.enum(['Manila', 'Iloilo']);
const participants = z.coerce.number().int().min(1).max(500);

/**
 * "to" after "from" and at most `days` long. Zod still runs object refinements when a field failed, so this only
 * compares real dates; a bad time already has its own message ("from: Invalid ISO datetime").
 */
const inRange =
  (days: number) =>
  <T extends z.ZodType<{ from: unknown; to: unknown }>>(schema: T) =>
    schema
      .refine((q) => !(q.from instanceof Date && q.to instanceof Date) || q.to > q.from, { message: '"to" must be after "from".' })
      .refine((q) => !(q.from instanceof Date && q.to instanceof Date) || q.to.getTime() - q.from.getTime() <= days * DAY_MS, {
        message: `The range can be at most ${days} days.`,
      });

/** POST /api/oauth/authorize: the consent screen's decision on an MCP client's authorization request. */
export const ConsentBody = z.object({
  // A client id carries its redirect URIs (up to 5 × 500 characters), so values may be long.
  params: z.record(z.string().max(40), z.string().max(8000)).refine((p) => Object.keys(p).length <= 20, { message: 'Too many parameters.' }),
  allow: z.boolean(),
});

/** POST /api/session: the demo sign-in. */
export const SignInBody = z.object({
  username: z.string().trim().min(1, 'Enter your e-mail.').max(120),
  password: z.string().min(1, 'Enter your password.').max(200),
});

/** POST /api/session/password: change your own password (at least MIN_PASSWORD_LENGTH characters, checked by the route). */
export const PasswordBody = z.object({
  current: z.string().min(1, 'Enter your current password.').max(200),
  next: z.string().min(1, 'Enter a new password.').max(200),
});

export const RoomsQuery = z.object({
  site: site.optional(),
  floor: z.string().max(10).optional(),
});

export const AvailabilityQuery = inRange(7)(
  z.object({
    site: site.default('Manila'),
    floor: z.string().max(10).optional(),
    from: isoTime,
    to: isoTime,
  }),
);

export const SearchBody = z.object({
  site: site.default('Manila'),
  agendaType: z.enum(AGENDA_TYPES),
  start: isoTime,
  end: isoTime,
  participants,
  needsVC: z.boolean().optional(),
});

const every = z.number().int().min(1).max(99);
/** Form "Recurrence" (Guidelines 3.6): `until` is the series end date, sent as an ISO time on that day. */
const RecurrenceBody = z.discriminatedUnion('freq', [
  z.object({ freq: z.literal('Daily'), every, until: isoTime }),
  z.object({ freq: z.literal('Weekly'), every, days: z.array(z.enum(WEEKDAYS)).min(1).max(7), until: isoTime }),
  z.object({
    freq: z.literal('Monthly'),
    every,
    on: z.union([z.object({ day: z.number().int().min(1).max(31) }), z.object({ week: z.enum(WEEK_OF_MONTH), weekday: z.enum(WEEKDAYS) })]),
    until: isoTime,
  }),
  z.object({ freq: z.literal('Yearly'), every, until: isoTime }),
]);

const BookProposal = z.object({
  action: z.literal('book'),
  roomId: z.string().min(1).max(64),
  agendaType: z.enum(AGENDA_TYPES),
  agenda: z.string().trim().max(200),
  start: isoTime,
  end: isoTime,
  participants,
  priority: z.enum(['Normal', 'Urgent']).default('Normal'),
  trainingType: z.enum(['On-Site', 'Virtual']).optional(),
  specialInstructions: z.string().trim().max(500).optional(),
  hardwareRequirements: z.array(z.enum(HARDWARE_OPTIONS)).max(HARDWARE_OPTIONS.length).optional(),
  recurrence: RecurrenceBody.optional(),
});

const CancelProposal = z.object({
  action: z.literal('cancel'),
  ticketNo: z.string().min(1).max(32),
});

/**
 * POST /api/proposals: a booking from the map (`action` "book", the default), or a cancellation from My bookings.
 * Keyed on `action`, so a bad field gets its own message (e.g. "hardwareRequirements.0: Invalid option").
 */
export const ProposalBody = z.preprocess(
  (v) => (v && typeof v === 'object' && !('action' in v) ? { ...v, action: 'book' } : v),
  z.discriminatedUnion('action', [BookProposal, CancelProposal]),
);

/** GET /api/bookings: the tool's reservation list and its search panel (date range, type of agenda, site, building, room, employee name). */
/** GET /api/bookings: without dates, every booking, past and future (the owner's request, 1 Oct 2026); either date narrows it. */
export const BookingsQuery = z
  .object({
    from: isoTime.optional(),
    to: isoTime.optional(),
    site: site.optional(),
    building: z.string().max(40).optional(),
    roomId: z.string().max(64).optional(),
    agendaType: z.enum(AGENDA_TYPES).optional(),
    employee: z.string().trim().max(80).optional(),
    status: z.enum(['Held', 'In Progress', 'Approved', 'Checked-In', 'Completed', 'Cancelled', 'Blocked']).optional(),
  })
  .refine((q) => !(q.from && q.to) || q.to > q.from, { message: '"to" must be after "from".' });

export const MyBookingsQuery = z.object({
  from: isoTime.optional(),
  to: isoTime.optional(),
});

export const AssistantBody = z.object({
  message: z.string().trim().min(1, 'Type a message.').max(2000, 'Messages can be up to 2000 characters.'),
  history: z.array(z.record(z.string(), z.unknown())).max(1000).default([]),
  confirmedTickets: z.array(z.string().max(32)).max(5).default([]),
});

// ---- Admin (/api/admin/*, docs/spec/04-api.md, Admin) and messages ----

const STATUSES = ['Held', 'In Progress', 'Approved', 'Checked-In', 'Completed', 'Cancelled', 'Blocked'] as const;
const comment = z.string().trim().max(500);
const notEmpty = (v: object) => Object.values(v).some((x) => x !== undefined);

/** GET /api/admin/bookings: every booking in the range (up to 92 days), all fields. */
export const AdminBookingsQuery = inRange(92)(z.object({ from: isoTime, to: isoTime, status: z.enum(STATUSES).optional() }));

/** POST /api/admin/bookings/{ticketNo}: approve, turn down (with a reason), cancel for someone, or check them in. */
export const AdminActionBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), comment: comment.optional() }),
  z.object({ action: z.literal('reject'), comment: comment.min(1, 'Say why the request is turned down.') }),
  z.object({ action: z.literal('cancel'), comment: comment.optional() }),
  z.object({ action: z.literal('checkin') }),
]);

/** PATCH /api/admin/bookings/{ticketNo}: what to change (at least one field). */
export const AdminChangeBody = z
  .object({
    roomId: z.string().max(64).optional(),
    start: isoTime.optional(),
    end: isoTime.optional(),
    participants: participants.optional(),
    agenda: z.string().trim().min(1, 'Add the agenda.').max(200).optional(),
    agendaType: z.enum(AGENDA_TYPES).optional(),
    priority: z.enum(['Normal', 'Urgent']).optional(),
  })
  .refine(notEmpty, { message: 'Nothing to change.' });

/** POST /api/admin/bookings/approve: approve several requests at once. */
export const BulkApproveBody = z.object({ ticketNos: z.array(z.string().max(32)).min(1, 'Pick at least one request.').max(100), comment: comment.optional() });

/** POST /api/admin/bookings/swap: two bookings exchange rooms. */
export const SwapBody = z.object({ a: z.string().min(1).max(32), b: z.string().min(1).max(32) });

const roomIds = z.array(z.string().min(1).max(64)).min(1, 'Pick at least one room.').max(30);
/** `dryRun`: only list the bookings it would cancel. `cancel`: the tickets Admin saw and agreed to cancel; any other stops it. */
const confirm = { cancel: z.array(z.string().min(1).max(32)).max(1000).default([]), dryRun: z.boolean().default(false) };

/** POST /api/admin/blocks: Admin blocks rooms for a time (maintenance, an event). */
export const BlockBody = z.object({ roomIds, start: isoTime, end: isoTime, reason: z.string().trim().min(1, 'Add the reason.').max(200), ...confirm });

/** POST /api/admin/bookings/bulk: Admin books several rooms (and the dates of a repeat) at once, for themself or `ownerEmail`. */
export const BulkBookingBody = z.object({
  roomIds,
  agendaType: z.enum(AGENDA_TYPES),
  agenda: z.string().trim().max(200),
  start: isoTime,
  end: isoTime,
  participants,
  priority: z.enum(['Normal', 'Urgent']).default('Normal'),
  trainingType: z.enum(['On-Site', 'Virtual']).optional(),
  specialInstructions: z.string().trim().max(500).optional(),
  recurrence: RecurrenceBody.optional(),
  ownerEmail: z.string().trim().max(200).optional(),
  ...confirm,
});

/** GET /api/admin/reports: figures over the range (up to 92 days). */
export const ReportQuery = inRange(92)(z.object({ from: isoTime, to: isoTime }));

/** GET /api/admin/audit: newest first, optionally a range, an actor (login) and an action. */
export const AuditQuery = z.object({ from: isoTime.optional(), to: isoTime.optional(), actor: z.string().trim().max(80).optional(), action: z.string().max(40).optional() });

const personName = z.string().trim().min(3, 'Add the name.').max(80).regex(/^[^,]+, [^,]+$/, 'Write the name as "Last, First", like the tool.');
const role = z.enum(['admin', 'user']);

/** POST /api/admin/users: add someone who can sign in. */
export const NewUserBody = z.object({
  name: personName,
  email: z.email('Enter a valid e-mail address.').max(120),
  division: z.string().trim().max(60).optional(),
  role: role.default('user'),
});

/** PATCH /api/admin/users/{login}: change the name, division (null clears it), role, or whether they can sign in. */
export const UserPatchBody = z
  .object({ name: personName.optional(), division: z.string().trim().max(60).nullable().optional(), role: role.optional(), disabled: z.boolean().optional() })
  .refine(notEmpty, { message: 'Nothing to change.' });

/** PATCH /api/admin/rooms/{roomId}: room details (capacity null = not known; notes null clears them). */
export const RoomPatchBody = z
  .object({
    name: z.string().trim().min(1, 'Add the room name.').max(60).optional(),
    capacity: z.number().int().min(1).max(500).nullable().optional(),
    av: z.enum(['VC', 'BYOD']).nullable().optional(),
    selfBookable: z.boolean().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine(notEmpty, { message: 'Nothing to change.' });

/** POST /api/messages/{ticketNo}: a message in the booking's thread. */
export const MessageBody = z.object({ text: z.string().trim().min(1, 'Write a message.').max(2000, 'Messages can be up to 2000 characters.') });

/** GET /api/admin/changes: audit entries after this id (none when absent). */
export const ChangesQuery = z.object({ after: z.coerce.number().int().min(0).optional() });
