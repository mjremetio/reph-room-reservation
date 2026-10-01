/**
 * Tools for the OpenAI agent. Reference code written before the SDK was installed:
 * if the installed @openai/agents types differ, follow the installed version.
 *
 * Every tool gets the user and clock from the run context, reads and writes only through
 * the ReservationGateway, and returns JSON text for the model. UI updates go through ctx.emit().
 */
import { tool, type RunContext } from '@openai/agents';
import { z } from 'zod';
import { HANDOFFS, type HandoffTopic } from '../config/handoffs';
import { HARDWARE_OPTIONS } from '../config/hardware';
import { WEEK_OF_MONTH, WEEKDAYS, type Recurrence, type Weekday, type WeekOfMonth } from '../domain/recurrence';
import { swapOptionsFor } from '../domain/alternatives';
import { checkInWindow } from '../domain/rules';
import { addMinutes, formatManila, formatRange } from '../domain/time';
import type { Booking, Room, RoomRequest } from '../domain/types';
import { getGateway } from '../gateway';
import { audit } from '../lib/audit';
import { prepareBooking, prepareCancellation } from '../services/prepareBooking';
import { roomSchedule } from '../services/roomSchedule';
import { searchRooms, type RoomMatch, type SearchResult } from '../services/searchRooms';
import { sharedWrite } from '../services/sharedState';
import { scheduleView, searchResultViews } from '../services/views';
import type { AssistantContext } from './context';
import { mailtoLink, teamsChatLink } from './links';

type Ctx = RunContext<AssistantContext>;

/** The tool's flat recurrence arguments (strict function calling) as the domain's Recurrence. */
export function toRecurrence(r: {
  freq: 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
  every: number;
  days: Weekday[] | null;
  month_day: number | null;
  month_week: WeekOfMonth | null;
  month_weekday: Weekday | null;
  until: string;
}): Recurrence {
  const until = parseTime(r.until);
  if (r.freq === 'Weekly') return { freq: 'Weekly', every: r.every, days: r.days ?? [], until };
  if (r.freq === 'Monthly') {
    const on = r.month_week && r.month_weekday ? { week: r.month_week, weekday: r.month_weekday } : { day: r.month_day ?? 1 };
    return { freq: 'Monthly', every: r.every, on, until };
  }
  return { freq: r.freq, every: r.every, until };
}

const AGENDA_TYPES = ['Meeting', 'Training', 'Pantry', 'Lactation Room', 'Multi-purpose'] as const;
const isoTime = () => z.string().describe('ISO 8601 date and time with the +08:00 offset, e.g. 2026-09-28T15:00:00+08:00');

/** A repeat as the model passes it (toRecurrence reads it). */
export const recurrenceArgs = z.object({
  freq: z.enum(['Daily', 'Weekly', 'Monthly', 'Yearly']),
  every: z.number().int().min(1).describe('Every N days/weeks/months/years; usually 1'),
  days: z.array(z.enum(WEEKDAYS)).nullable().describe('Weekly only: the weekdays'),
  month_day: z.number().int().min(1).max(31).nullable().describe('Monthly on a day number, e.g. 15'),
  month_week: z.enum(WEEK_OF_MONTH).nullable().describe('Monthly on e.g. the Third Thursday: the week'),
  month_weekday: z.enum(WEEKDAYS).nullable().describe('Monthly on e.g. the Third Thursday: the weekday'),
  until: isoTime().describe('Last date of the series (any time on that day)'),
});

function contextOf(rc?: Ctx): AssistantContext {
  if (!rc) throw new Error('The room assistant must run with an AssistantContext.');
  return rc.context;
}

function parseTime(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Could not read "${value}". Use ISO 8601 with +08:00.`);
  return d;
}

const label = (r: Room) => `${r.name}, ${r.floor}`;
/** Admin's room block has nobody to ask for a swap. */
const BLOCKED = 'Admin blocked this room then, so it cannot be swapped and there is nobody to message. Offer another room or time.';
const json = (value: unknown) => JSON.stringify(value);

/** What the model may know about someone else's booking: name, division, time, group size and status only. */
function otherBooking(b: Booking, rooms: Map<string, Room>) {
  const room = rooms.get(b.roomId);
  // Admin's room block (status Blocked): Admin closed the room then; nobody to ask for a swap.
  const block = b.status === 'Blocked';
  return {
    ticket_no: b.ticketNo,
    room: room ? label(room) : b.roomId,
    when: formatRange(b.start, b.end),
    owner: block ? 'Admin (room blocked)' : b.owner.name,
    division: block ? null : (b.owner.division ?? null),
    participants: b.participants,
    status: b.status,
  };
}

/** The room the user named, with its real status: never infer "not available" from a room missing from the lists. */
function requestedView(r: SearchResult['requested'], rooms: Map<string, Room>) {
  if (!r) return undefined;
  if (!r.match) return { asked_for: r.query, problem: r.note };
  const a = r.match.availability;
  return {
    room_id: r.match.room.id,
    room: label(r.match.room),
    capacity: r.match.room.capacity,
    status: a.kind === 'available' ? 'free for the whole time' : a.kind === 'partial' ? 'partly free' : 'taken',
    free: a.kind === 'partial' ? a.free.map((f) => formatRange(f.start, f.end)) : undefined,
    booked_by: a.kind === 'available' ? undefined : a.conflicts.map((b) => otherBooking(b, rooms)),
    can_host_this_request: r.canHost,
    why: r.canHost ? r.match.reasons : undefined,
    problem: r.note,
  };
}

export const findRooms = tool({
  name: 'find_rooms',
  description:
    'Find rooms for a request. Returns rooms that are fully free, partly free, or taken (with who has them), ranked by fit, plus nearby alternative times. Always call this before saying a room is free. When the user names a room, pass it as `room`: `requested_room` then gives that room\'s real status even if it is not among the best fits.',
  parameters: z.object({
    agenda_type: z.enum(AGENDA_TYPES),
    site: z.enum(['Manila', 'Iloilo']).nullable().describe("null means the user's default site"),
    start: isoTime(),
    end: isoTime(),
    participants: z.number().int().min(1),
    needs_video_conferencing: z.boolean().nullable(),
    room: z.string().nullable().describe('The room the user named, e.g. "Coron"; null when they want any room'),
  }),
  async execute(args, rc?: Ctx) {
    const ctx = contextOf(rc);
    const gw = getGateway();
    const req: RoomRequest = {
      site: args.site ?? ctx.defaultSite,
      agendaType: args.agenda_type,
      start: parseTime(args.start),
      end: parseTime(args.end),
      participants: args.participants,
      needsVC: args.needs_video_conferencing ?? false,
    };
    const result = await searchRooms(gw, req, ctx.now, ctx.user.email, { room: args.room });
    if (!result.ok) return json({ ok: false, problems: result.problems });

    const rooms = new Map((await gw.listRooms()).map((r) => [r.id, r] as const));
    const conflictsOf = (m: RoomMatch) => (m.availability.kind === 'available' ? [] : m.availability.conflicts);

    ctx.emit({ type: 'focus_time', start: req.start.toISOString(), end: req.end.toISOString() });
    ctx.emit({ type: 'room_results', flow: result.flow, agendaType: req.agendaType, participants: req.participants, ...searchResultViews(result, ctx.user.email) });

    return json({
      ok: true,
      flow: result.flow,
      request: { when: formatRange(req.start, req.end), participants: req.participants, site: req.site, agenda_type: req.agendaType },
      warnings: result.warnings,
      fully_free: result.fullyFree.map((m) => ({ room_id: m.room.id, room: label(m.room), capacity: m.room.capacity, equipment: m.room.av, why: m.reasons })),
      partly_free: result.partlyFree.map((m) => ({
        room_id: m.room.id,
        room: label(m.room),
        free: m.availability.kind === 'partial' ? m.availability.free.map((f) => formatRange(f.start, f.end)) : [],
        booked_by: conflictsOf(m).map((b) => otherBooking(b, rooms)),
      })),
      taken: result.taken.map((m) => ({ room_id: m.room.id, room: label(m.room), booked_by: conflictsOf(m).map((b) => otherBooking(b, rooms)) })),
      alternatives: result.alternatives.map((a) => ({ room_id: a.room.id, room: label(a.room), when: formatRange(a.start, a.end) })),
      requested_room: requestedView(result.requested, rooms),
      note: result.flow === 'none' ? 'No rooms of this type are listed for this site yet. Do not suggest any.' : undefined,
    });
  },
});

export const roomScheduleTool = tool({
  name: 'room_schedule',
  description:
    "Who has booked a room and when, and when it is free: for \"who booked Batanes today?\", \"is Tokyo free this afternoon?\" or \"what's booked on 3F now?\". Returns each room's bookings (owner, division, time, group size, status) and free times in the window, and shows them on a card. To find a room for a group, use find_rooms.",
  parameters: z.object({
    room: z.string().nullable().describe('The room as the user named it, e.g. "Batanes"; null = every room (narrow with floor)'),
    floor: z.enum(['2F', '3F']).nullable().describe('null = every floor'),
    start: isoTime().describe('Start of the window; "today" starts at 12:00 AM'),
    end: isoTime().describe('End of the window; "today" ends at 12:00 AM the next day. At most 7 days after start.'),
  }),
  async execute(args, rc?: Ctx) {
    const ctx = contextOf(rc);
    const result = await roomSchedule(
      getGateway(),
      { site: ctx.defaultSite, room: args.room, floor: args.floor, start: parseTime(args.start), end: parseTime(args.end), viewerEmail: ctx.user.email },
      ctx.now,
    );
    if (!result.ok) return json({ ok: false, problem: result.problem });
    ctx.emit({ type: 'room_schedule', ...scheduleView(result) });
    return json({
      ok: true,
      shown_to_user: true,
      window: formatRange(result.window.start, result.window.end),
      rooms: result.rooms.map((s) => ({
        room_id: s.room.id,
        room: label(s.room),
        booked: s.bookings.map((b) => ({
          ticket_no: b.ticketNo,
          when: formatRange(new Date(b.start), new Date(b.end)),
          ...(b.mine ? { yours: true, agenda: b.agenda } : { owner: b.owner, division: b.division }),
          participants: b.participants,
          status: b.status,
        })),
        free: s.free.map((f) => formatRange(f.start, f.end)),
      })),
      more_rooms_booked: result.more,
      free_whole_time: args.room ? undefined : result.freeRooms.map(label),
    });
  },
});

export const proposeBooking = tool({
  name: 'propose_booking',
  description:
    'Prepare a booking and show the user a card to confirm it. Nothing is booked until the user presses Confirm. Needs a specific agenda title.',
  parameters: z.object({
    room_id: z.string().describe('room_id from find_rooms'),
    agenda_type: z.enum(AGENDA_TYPES),
    agenda: z.string().describe('Specific title, e.g. "Q4 pipeline review". "Meeting" or "Training" alone is rejected.'),
    start: isoTime(),
    end: isoTime(),
    participants: z.number().int().min(1),
    priority: z.enum(['Normal', 'Urgent']).nullable().describe('null = Normal. Urgent only if the user asks and it is allowed.'),
    training_type: z.enum(['On-Site', 'Virtual']).nullable().describe('Type of training, for Training only; null = On-Site. Ignored for other agenda types.'),
    special_instructions: z.string().nullable().describe('Anything the user asked to note for Admin; null if none'),
    hardware_requirements: z.array(z.enum(HARDWARE_OPTIONS)).nullable().describe('Extra hardware from the form list; null if none. Remind the user to file it in ServiceNow.'),
    recurrence: recurrenceArgs.nullable().describe('Only when the user asks for a repeating booking; null otherwise'),
  }),
  async execute(args, rc?: Ctx) {
    const ctx = contextOf(rc);
    const prepared = await prepareBooking(
      getGateway(),
      ctx.user,
      {
        roomId: args.room_id,
        agendaType: args.agenda_type,
        agenda: args.agenda,
        start: parseTime(args.start),
        end: parseTime(args.end),
        participants: args.participants,
        priority: args.priority ?? 'Normal',
        trainingType: args.training_type ?? undefined,
        specialInstructions: args.special_instructions ?? undefined,
        hardwareRequirements: args.hardware_requirements ?? undefined,
        recurrence: args.recurrence ? toRecurrence(args.recurrence) : undefined,
      },
      ctx.now,
      ctx.proposalHoldMinutes,
    );
    if (!prepared.ok) {
      const hint = prepared.code === 'CONFLICT' ? ' Run find_rooms again.' : prepared.code === 'NOT_FOUND' ? ' Use a room_id from find_rooms.' : '';
      return json({ ok: false, problems: prepared.problems.map((p) => p + hint) });
    }
    ctx.emit({ type: 'proposal', proposal: prepared.value.proposal });
    return json({
      ok: true,
      shown_to_user: true,
      summary: prepared.value.summary,
      note: 'Ask the user to press Confirm on the card. It is not booked yet.',
    });
  },
});

export const myBookings = tool({
  name: 'my_bookings',
  description: "List the user's own upcoming bookings with their status and check-in times.",
  parameters: z.object({ days_ahead: z.number().int().min(1).max(90).nullable() }),
  async execute(args, rc?: Ctx) {
    const ctx = contextOf(rc);
    const gw = getGateway();
    const rooms = new Map((await gw.listRooms()).map((r) => [r.id, r] as const));
    // null = every upcoming booking, however far ahead (Training and MPH go 90 days out, Pantry has no limit).
    const to = args.days_ahead ? addMinutes(ctx.now, args.days_ahead * 24 * 60) : undefined;
    const list = await gw.listMyBookings(ctx.user.email, addMinutes(ctx.now, -60), to);
    return json(
      list
        .filter((b) => b.status !== 'Cancelled')
        .map((b) => {
          const room = rooms.get(b.roomId);
          const w = checkInWindow(b);
          return {
            ticket_no: b.ticketNo,
            room: room ? label(room) : b.roomId,
            when: formatRange(b.start, b.end),
            agenda: b.agenda,
            status: b.status,
            check_in: `${formatManila(w.start)} to ${formatManila(w.end)}`,
          };
        }),
    );
  },
});

export const checkIn = tool({
  name: 'check_in',
  description: 'Check the user in to one of their own bookings. Works from 1 hour before until 15 minutes after the start.',
  parameters: z.object({ ticket_no: z.string() }),
  async execute(args, rc?: Ctx) {
    const { user } = contextOf(rc);
    try {
      // The one tool that writes: under the shared state's lock (the assistant's reply streams outside the route's own).
      const b = await sharedWrite(async () => {
        const done = await getGateway().checkIn(args.ticket_no, user);
        audit(user, 'booking.checkin', done.ticketNo);
        return done;
      });
      return json({ ok: true, status: b.status });
    } catch (err) {
      return json({ ok: false, problem: err instanceof Error ? err.message : 'Check-in failed.' });
    }
  },
});

export const requestCancellation = tool({
  name: 'request_cancellation',
  description: "Show a card so the user can cancel one of their own bookings. Nothing is cancelled until they press the button.",
  parameters: z.object({ ticket_no: z.string() }),
  async execute(args, rc?: Ctx) {
    const ctx = contextOf(rc);
    const prepared = await prepareCancellation(getGateway(), ctx.user, args.ticket_no, ctx.now, ctx.proposalHoldMinutes);
    if (!prepared.ok) return json({ ok: false, problem: prepared.problems[0] });
    ctx.emit({ type: 'cancel_request', ...prepared.value });
    return json({ ok: true, shown_to_user: true, note: 'Ask the user to press Cancel booking on the card.' });
  },
});

export const findSwapOptions = tool({
  name: 'find_swap_options',
  description: "For a booking that blocks the user, find other rooms that fit the owner's meeting at the same time, so the user can offer them a swap.",
  parameters: z.object({ ticket_no: z.string().describe('Ticket number of the booking that blocks the user') }),
  async execute(args, rc?: Ctx) {
    const ctx = contextOf(rc);
    const gw = getGateway();
    const blocking = await gw.getBooking(args.ticket_no);
    if (!blocking) return json({ ok: false, problem: 'Booking not found.' });
    if (blocking.status === 'Blocked') return json({ ok: false, problem: BLOCKED });
    const rooms = await gw.listRooms();
    const byId = new Map(rooms.map((r) => [r.id, r] as const));
    const bookings = await gw.getBookings({ from: blocking.start, to: blocking.end });
    const options = swapOptionsFor(blocking, rooms, bookings, ctx.now);
    return json({
      ok: true,
      owner_booking: otherBooking(blocking, byId),
      options: options.map((o) => ({ room_id: o.room.id, room: label(o.room), capacity: o.room.capacity, why: o.reasons })),
    });
  },
});

export const draftOwnerMessage = tool({
  name: 'draft_owner_message',
  description: 'Show the user a ready-to-send Teams chat or email to the owner of a booking. The user reviews and sends it themselves.',
  parameters: z.object({
    ticket_no: z.string(),
    channel: z.enum(['teams', 'email']),
    message: z.string().describe("Short, friendly message in the user's voice. Include the swap room if find_swap_options found one."),
  }),
  async execute(args, rc?: Ctx) {
    const ctx = contextOf(rc);
    const b = await getGateway().getBooking(args.ticket_no);
    if (b?.status === 'Blocked') return json({ ok: false, problem: BLOCKED });
    if (!b?.owner.email) return json({ ok: false, problem: 'There are no contact details for this booking owner.' });
    const link = args.channel === 'teams' ? teamsChatLink(b.owner.email, args.message) : mailtoLink(b.owner.email, 'About your room booking', args.message);
    ctx.emit({ type: 'draft_message', to: b.owner.name, channel: args.channel, text: args.message, link });
    return json({ ok: true, shown_to_user: true, note: 'The user reviews and sends it themselves.' });
  },
});

export const listRooms = tool({
  name: 'list_rooms',
  description:
    'The room directory, without availability: name, floor, type, AV (VC = room video conference, BYOD = bring your own laptop), capacity (null = not known yet; never guess), the types of agenda it can be booked for (empty = it can\'t be booked) and whether it is self-service. For questions like "which 3F rooms have VC?", "what kind of room is Tokyo?" or "which rooms can I book for a training?". To check free rooms, use find_rooms.',
  parameters: z.object({
    floor: z.enum(['2F', '3F']).nullable().describe('null = every floor'),
    av: z.enum(['VC', 'BYOD']).nullable().describe('null = any'),
  }),
  async execute(args, rc?: Ctx) {
    const rooms = (await getGateway().listRooms(contextOf(rc).defaultSite)).filter((r) => (!args.floor || r.floor === args.floor) && (!args.av || r.av === args.av));
    return json({
      ok: true,
      rooms: rooms.map((r) => ({
        room: label(r),
        tool_name: r.toolName ?? null,
        type: r.kind,
        av: r.av,
        capacity: r.capacity,
        bookable_for: r.agendas,
        self_bookable: r.selfBookable,
      })),
    });
  },
});

const HANDOFF_TOPICS = Object.keys(HANDOFFS) as [HandoffTopic, ...HandoffTopic[]];

export const getHandoff = tool({
  name: 'get_handoff',
  description:
    "For requests this assistant must not book or fix: BU visitor offices (Admin by email), extra equipment (ServiceNow), room setup such as chairs, sound or food (Non-Solus), and trouble with a room's video conference or screen (IT).",
  parameters: z.object({ topic: z.enum(HANDOFF_TOPICS) }),
  async execute(args, rc?: Ctx) {
    const ctx = contextOf(rc);
    const h = HANDOFFS[args.topic];
    ctx.emit({ type: 'handoff', topic: args.topic, label: h.label, link: h.link });
    return json({ ok: true, shown_to_user: true, label: h.label });
  },
});

export const roomTools = [findRooms, roomScheduleTool, listRooms, proposeBooking, myBookings, checkIn, requestCancellation, findSwapOptions, draftOwnerMessage, getHandoff];
