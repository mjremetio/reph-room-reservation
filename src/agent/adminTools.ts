/**
 * Tools for the Admin assistant (docs/spec/05-agent.md, Admin assistant). Reads go through the gateway and the shared
 * services; the prepare_* and draft tools only show a card. The Admin's button on the card makes the change through
 * /api/admin/* (or sends the message), so the model never approves, changes, swaps, cancels or sends anything itself.
 * Results for the model carry names, divisions, times, sizes, statuses and agenda titles, never e-mail addresses.
 */
import { tool, type RunContext } from '@openai/agents';
import { z } from 'zod';
import { buildReport, waitingForAdmin } from '../domain/reports';
import { addMinutes, formatManila, formatRange, manilaDateKey } from '../domain/time';
import type { Booking, BookingStatus, Room } from '../domain/types';
import { getGateway } from '../gateway';
import { bookingLabel, describeChange, prepareAdminAction, prepareAdminChange, prepareAdminSwap } from '../services/adminBookings';
import { matchRooms } from '../services/roomSchedule';
import type { AdminChangeJson, AssistantContext } from './context';
import { listRooms, roomScheduleTool } from './tools';

type Ctx = RunContext<AssistantContext>;

const STATUSES = ['In Progress', 'Approved', 'Checked-In', 'Completed', 'Cancelled'] as const satisfies readonly BookingStatus[];
const AGENDA_TYPES = ['Meeting', 'Training', 'Pantry', 'Lactation Room', 'Multi-purpose'] as const;
const isoTime = () => z.string().describe('ISO 8601 date and time with the +08:00 offset, e.g. 2026-09-28T15:00:00+08:00');
const json = (value: unknown) => JSON.stringify(value);
const DAY = 24 * 60;

function contextOf(rc?: Ctx): AssistantContext {
  if (!rc) throw new Error('The Admin assistant must run with an AssistantContext.');
  return rc.context;
}

function parseTime(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Could not read "${value}". Use ISO 8601 with +08:00.`);
  return d;
}

/** A booking as the Admin assistant tells it: no e-mail addresses. */
function forAdmin(b: Booking, rooms: Room[]) {
  const room = rooms.find((r) => r.id === b.roomId);
  return {
    ticket_no: b.ticketNo,
    room: room ? `${room.name}, ${room.floor}` : b.roomId,
    when: formatRange(b.start, b.end),
    owner: b.owner.name,
    division: b.owner.division ?? null,
    participants: b.participants,
    capacity: room?.capacity ?? null,
    status: b.status,
    agenda: b.agenda,
    type: b.agendaType,
    priority: b.priority ?? 'Normal',
    filed: b.createdAt ? formatManila(b.createdAt) : null,
    admin_comments: b.adminComments ?? null,
  };
}

const failed = (p: { problems: string[] }) => json({ ok: false, problems: p.problems });

export const waitingRequests = tool({
  name: 'waiting_requests',
  description: 'Requests waiting for Admin (status In Progress) that have not ended, soonest first. Use for "what needs approval?".',
  parameters: z.object({ days_ahead: z.number().int().min(1).max(92).nullable().describe('null = the next 92 days') }),
  async execute(args, rc?: Ctx) {
    const ctx = contextOf(rc);
    const gw = getGateway();
    const [rooms, ahead] = await Promise.all([gw.listRooms(), gw.getBookings({ from: ctx.now, to: addMinutes(ctx.now, (args.days_ahead ?? 92) * DAY) })]);
    const waiting = waitingForAdmin(ahead, ctx.now);
    return json({ count: waiting.length, requests: waiting.slice(0, 30).map((b) => forAdmin(b, rooms)) });
  },
});

export const findBookings = tool({
  name: 'find_bookings',
  description: 'Search every booking in a time range (up to 92 days), optionally by room, owner name or status. Use to find a ticket before preparing an action.',
  parameters: z.object({
    from: isoTime(),
    to: isoTime(),
    room: z.string().nullable().describe('The room as the Admin named it, e.g. "Batanes"; null = every room'),
    owner: z.string().nullable().describe('Part of the owner name, e.g. "Alpha"; null = anyone'),
    status: z.enum(STATUSES).nullable(),
  }),
  async execute(args, rc?: Ctx) {
    contextOf(rc);
    const gw = getGateway();
    const from = parseTime(args.from);
    const to = parseTime(args.to);
    if (to <= from || to.getTime() - from.getTime() > 92 * DAY * 60_000) return json({ ok: false, problems: ['Use a range of up to 92 days, with "to" after "from".'] });
    const rooms = await gw.listRooms();
    const roomIds = args.room ? matchRooms(rooms, args.room).map((r) => r.id) : undefined;
    if (roomIds && roomIds.length === 0) return json({ ok: false, problems: [`No room called "${args.room}".`] });
    const owner = args.owner?.trim().toLowerCase();
    const list = (await gw.getBookings({ roomIds, from, to }))
      .filter((b) => (!args.status || b.status === args.status) && (!owner || b.owner.name.toLowerCase().includes(owner)))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    return json({ ok: true, count: list.length, bookings: list.slice(0, 40).map((b) => forAdmin(b, rooms)), more: Math.max(0, list.length - 40) });
  },
});

export const usageReport = tool({
  name: 'usage_report',
  description:
    'Usage figures for a range (up to 92 days): bookings, hours, statuses, no-shows, utilisation (booked hours ÷ all 24 hours of the range), the busiest and least used rooms, types, divisions and the busiest day.',
  parameters: z.object({ from: isoTime(), to: isoTime() }),
  async execute(args, rc?: Ctx) {
    const ctx = contextOf(rc);
    const from = parseTime(args.from);
    const to = parseTime(args.to);
    if (to <= from || to.getTime() - from.getTime() > 92 * DAY * 60_000) return json({ ok: false, problems: ['Use a range of up to 92 days, with "to" after "from".'] });
    const gw = getGateway();
    const [rooms, bookings] = await Promise.all([gw.listRooms(), gw.getBookings({ from, to })]);
    const r = buildReport({ bookings, rooms, from, to, now: ctx.now });
    const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
    const bookable = r.byRoom.filter((x) => x.selfBookable);
    const busiest = [...r.byDay].sort((a, b) => b.hours - a.hours)[0];
    return json({
      range: formatRange(from, to),
      totals: { ...r.totals, utilisation: pct(r.totals.utilisation) },
      busiest_rooms: bookable.slice(0, 5).map((x) => ({ room: `${x.name}, ${x.floor}`, bookings: x.count, hours: x.hours, utilisation: pct(x.utilisation), no_shows: x.noShows })),
      least_used_rooms: [...bookable].reverse().slice(0, 5).map((x) => ({ room: `${x.name}, ${x.floor}`, bookings: x.count, hours: x.hours })),
      by_type: r.byAgendaType,
      by_floor: r.byFloor.map((f) => ({ ...f, utilisation: pct(f.utilisation) })),
      top_divisions: r.byDivision.slice(0, 5),
      busiest_day: busiest && busiest.count > 0 ? { day: busiest.day, bookings: busiest.count, hours: busiest.hours } : null,
      top_requesters: r.topRequesters.slice(0, 5),
      days: manilaDateKey(from) === manilaDateKey(addMinutes(to, -1)) ? undefined : r.byDay,
    });
  },
});

const WORDS = { approve: 'Approve', reject: 'Turn down', cancel: 'Cancel', checkin: 'Check in' } as const;

export const prepareAdminActionTool = tool({
  name: 'prepare_admin_action',
  description:
    'Show the Admin a card to approve, turn down (reject, needs a reason), cancel, or check in a booking. Nothing changes until the Admin presses the button on the card.',
  parameters: z.object({
    action: z.enum(['approve', 'reject', 'cancel', 'checkin']),
    ticket_no: z.string(),
    comment: z.string().max(500).nullable().describe('Admin comment for the owner; required to turn a request down'),
  }),
  async execute(args, rc?: Ctx) {
    const ctx = contextOf(rc);
    const prepared = await prepareAdminAction(getGateway(), args.ticket_no, args.action, args.comment, ctx.now);
    if (!prepared.ok) return failed(prepared);
    const { booking, rooms } = prepared.value;
    const summary = `${booking.agenda} · ${bookingLabel(booking, rooms)} · ${booking.participants} people`;
    ctx.emit({ type: 'admin_action', action: args.action, ticketNo: booking.ticketNo, owner: booking.owner.name, summary, ...(args.comment?.trim() ? { comment: args.comment.trim() } : {}) });
    return json({ ok: true, shown_to_user: true, card: `${WORDS[args.action]} ${booking.ticketNo}`, note: 'Ask the Admin to press the button on the card. Nothing has changed yet.' });
  },
});

export const prepareBookingChange = tool({
  name: 'prepare_booking_change',
  description:
    "Show the Admin a card to change a booking's room, time, group size, agenda, type or priority (each field null = keep). Checks the rules and clashes first. Nothing changes until the Admin presses the button.",
  parameters: z.object({
    ticket_no: z.string(),
    room: z.string().nullable().describe('The new room as named, e.g. "Batanes"; null = keep'),
    start: isoTime().nullable(),
    end: isoTime().nullable(),
    participants: z.number().int().min(1).max(500).nullable(),
    agenda: z.string().max(200).nullable(),
    agenda_type: z.enum(AGENDA_TYPES).nullable(),
    priority: z.enum(['Normal', 'Urgent']).nullable(),
  }),
  async execute(args, rc?: Ctx) {
    const ctx = contextOf(rc);
    const gw = getGateway();
    let roomId: string | undefined;
    if (args.room) {
      const found = matchRooms(await gw.listRooms(), args.room);
      if (found.length !== 1) return json({ ok: false, problems: [found.length ? `"${args.room}" matches ${found.map((r) => r.name).join(', ')}. Which one?` : `No room called "${args.room}".`] });
      roomId = (found[0] as Room).id;
    }
    const changes = {
      roomId,
      start: args.start ? parseTime(args.start) : undefined,
      end: args.end ? parseTime(args.end) : undefined,
      participants: args.participants ?? undefined,
      agenda: args.agenda?.trim() || undefined,
      agendaType: args.agenda_type ?? undefined,
      priority: args.priority ?? undefined,
    };
    const prepared = await prepareAdminChange(gw, args.ticket_no, changes, ctx.now);
    if (!prepared.ok) return failed(prepared);
    const { before, after, rooms } = prepared.value;
    const change = describeChange(before, after, rooms);
    const body: AdminChangeJson = Object.fromEntries(
      Object.entries({ ...changes, start: changes.start?.toISOString(), end: changes.end?.toISOString() }).filter(([, v]) => v !== undefined),
    );
    ctx.emit({ type: 'admin_change', ticketNo: before.ticketNo, owner: before.owner.name, change, summary: `${after.agenda} · ${bookingLabel(after, rooms)} · ${after.participants} people`, body });
    return json({ ok: true, shown_to_user: true, change, note: 'Ask the Admin to press the button on the card. Nothing has changed yet.' });
  },
});

export const prepareRoomSwap = tool({
  name: 'prepare_room_swap',
  description: 'Show the Admin a card to swap the rooms of two bookings (each keeps its time). Checks for clashes first. Nothing changes until the Admin presses the button.',
  parameters: z.object({ ticket_a: z.string(), ticket_b: z.string() }),
  async execute(args, rc?: Ctx) {
    const ctx = contextOf(rc);
    const prepared = await prepareAdminSwap(getGateway(), args.ticket_a, args.ticket_b, ctx.now);
    if (!prepared.ok) return failed(prepared);
    const { a, b, rooms } = prepared.value;
    const line = (x: Booking, to: string) => `${x.ticketNo} (${x.owner.name}, ${x.participants} people): ${bookingLabel(x, rooms)} → ${rooms.find((r) => r.id === to)?.name ?? to}`;
    const summary = [line(a, b.roomId), line(b, a.roomId)];
    ctx.emit({ type: 'admin_swap', a: a.ticketNo, b: b.ticketNo, summary });
    return json({ ok: true, shown_to_user: true, swap: summary, note: 'Ask the Admin to press the button on the card. Nothing has changed yet.' });
  },
});

export const draftMessageToOwner = tool({
  name: 'draft_message_to_owner',
  description:
    "Draft a message to a booking's owner in the app's message thread for that booking. The Admin can edit it and presses Send; nothing is sent before that.",
  parameters: z.object({ ticket_no: z.string(), text: z.string().min(1).max(2000).describe('Short and polite, first name, plain words') }),
  async execute(args, rc?: Ctx) {
    const ctx = contextOf(rc);
    const gw = getGateway();
    const booking = await gw.getBooking(args.ticket_no);
    if (!booking) return json({ ok: false, problems: [`Booking ${args.ticket_no} not found.`] });
    ctx.emit({ type: 'admin_message', ticketNo: booking.ticketNo, owner: booking.owner.name, summary: bookingLabel(booking, await gw.listRooms()), text: args.text.trim() });
    return json({ ok: true, shown_to_user: true, note: 'The Admin can edit the draft and press Send. Nothing has been sent.' });
  },
});

export const adminTools = [waitingRequests, findBookings, usageReport, roomScheduleTool, listRooms, prepareAdminActionTool, prepareBookingChange, prepareRoomSwap, draftMessageToOwner];
