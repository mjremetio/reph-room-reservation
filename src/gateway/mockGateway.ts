import { conflictsFor, ownConflicts } from '../domain/availability';
import { sameEmail } from '../domain/people';
import { expandRecurrence } from '../domain/recurrence';
import { bookable } from '../domain/ranking';
import { checkInWindow, initialStatus, placementChanged, roomIssues, RULES, shouldAutoRelease } from '../domain/rules';
import { addMinutes, formatManila, manilaStartOfDay } from '../domain/time';
import type { AgendaType, Booking, Person, Room, Site } from '../domain/types';
import { ROOMS } from '../data/rooms';
import type { Scenario } from '../data/scenarios';
import {
  ConflictError,
  NotAllowedError,
  NotFoundError,
  type Actor,
  type BookingChanges,
  type NewBooking,
  type ReservationGateway,
  type Requestor,
  type RoomChanges,
} from './ReservationGateway';

/** Placeholder people for random demo data. Never put real employee names here. */
const OWNERS: Person[] = [
  { name: 'Tester, Alpha', email: 'alpha.tester@example.com', division: 'Operations' },
  { name: 'Tester, Bravo', email: 'bravo.tester@example.com', division: 'HR' },
  { name: 'Tester, Charlie', email: 'charlie.tester@example.com', division: 'Learning' },
  { name: 'Tester, Delta', email: 'delta.tester@example.com', division: 'Sales' },
  { name: 'Tester, Echo', email: 'echo.tester@example.com', division: 'Technology' },
];

const AGENDAS = ['Team sync', 'Weekly touchpoint meeting', 'Client call prep', '1:1 coaching', 'Q4 planning', 'New Doc Process – Content Analysis'];

export interface MockOptions {
  /** Clock used for conflict and check-in rules. Defaults to the real time. */
  now?: () => Date;
  /** Fixed data set (e.g. DEMO_SCENARIO). Replaces random bookings and fills unknown capacities with demo values. */
  scenario?: Scenario;
  /** Without a scenario: add random sample bookings (default true). Tests usually turn this off. */
  withSamples?: boolean;
  seed?: number;
  sampleDays?: number;
}

/** In-memory stand-in for the Room Reservation Tool. Follows the real rules: no overlaps, owner-only changes (or Admin). */
/** What changes in the mock (rooms Admin edited, bookings, the next ticket number), as plain data for the shared state. */
export interface MockSnapshot {
  rooms: Room[];
  bookings: Booking[];
  nextTicket: number;
}

export class MockGateway implements ReservationGateway {
  private rooms: Room[];
  private readonly people: Person[];
  private bookings: Booking[] = [];
  private nextTicket = 130001;
  private readonly now: () => Date;

  constructor(opts: MockOptions = {}) {
    this.now = opts.now ?? (() => new Date());
    const overrides = opts.scenario?.capacityOverrides ?? {};
    this.rooms = ROOMS.map((r) => ({ ...r, agendas: [...r.agendas], capacity: r.capacity ?? overrides[r.id] ?? null }));
    // The scenario's demo user first, so it is the default requestor.
    const listed = opts.scenario ? [opts.scenario.demoUser, ...opts.scenario.people] : OWNERS;
    this.people = listed.filter((p, i) => listed.findIndex((q) => sameEmail(q.email, p.email)) === i);
    if (opts.scenario) {
      // The tool fills Priority and Created By on every reservation; the demo file leaves them out.
      this.bookings = opts.scenario.bookings.map((b) => ({ ...clone(b), priority: b.priority ?? 'Normal', createdBy: b.createdBy ?? toolLogin(b.owner) }));
    } else if (opts.withSamples !== false) {
      this.bookings = makeSampleBookings(this.rooms, this.now(), opts.seed ?? 7, opts.sampleDays ?? 7);
    }
  }

  /** A copy of everything that changes, for the shared state (src/app/api/_shared.ts). */
  snapshot(): MockSnapshot {
    return { rooms: this.rooms.map((r) => ({ ...r })), bookings: this.bookings.map(clone), nextTicket: this.nextTicket };
  }

  /** Replaces everything that changes with a snapshot taken by another server instance. */
  restore(s: MockSnapshot): void {
    this.rooms = s.rooms.map((r) => ({ ...r }));
    this.bookings = s.bookings.map(clone);
    this.nextTicket = s.nextTicket;
  }

  async listRooms(site?: Site): Promise<Room[]> {
    return this.rooms.filter((r) => !site || r.site === site).map((r) => ({ ...r }));
  }

  async listPeople(): Promise<Requestor[]> {
    return this.people.filter((p) => p.email).map((p) => ({ ...p, email: p.email as string, login: toolLogin(p) as string }));
  }

  async getBookings(query: { roomIds?: string[]; from: Date; to: Date }): Promise<Booking[]> {
    return this.bookings
      .filter((b) => (!query.roomIds || query.roomIds.includes(b.roomId)) && b.start < query.to && query.from < b.end)
      .map(clone);
  }

  async getBooking(ticketNo: string): Promise<Booking | null> {
    const b = this.bookings.find((x) => x.ticketNo === ticketNo);
    return b ? clone(b) : null;
  }

  async listMyBookings(email: string, from: Date, to?: Date): Promise<Booking[]> {
    return this.bookings
      .filter((b) => sameEmail(b.owner.email, email) && (!to || b.start < to) && from < b.end)
      .sort((x, y) => x.start.getTime() - y.start.getTime())
      .map(clone);
  }

  async createBooking(req: NewBooking): Promise<Booking> {
    const room = this.rooms.find((r) => r.id === req.roomId);
    if (!room) throw new NotFoundError(`Unknown room "${req.roomId}".`);
    if (!room.selfBookable) throw new NotAllowedError(`${room.name} is booked through Admin.`);
    const [wrong] = roomIssues(room, req.agendaType, req.participants);
    if (wrong) throw new NotAllowedError(wrong.message);
    // A series is booked for every date or not at all, like one form submit in the tool.
    const dates = req.recurrence ? expandRecurrence(req, req.recurrence) : [{ start: req.start, end: req.end }];
    const conflicts = dates.flatMap((d) => conflictsFor(req.roomId, d, this.bookings, this.now()));
    if (conflicts.length > 0) throw new ConflictError(conflicts.map(clone));
    if (RULES.oneRoomPerPersonAtATime && req.requester.email) {
      const own = dates.flatMap((d) => ownConflicts(req.requester.email as string, d, this.bookings, this.now()));
      if (own.length > 0) throw new ConflictError(own.map(clone), 'requester');
    }
    const created: Booking[] = dates.map((d) => ({
      ticketNo: `RM-0${this.nextTicket++}`,
      roomId: req.roomId,
      start: new Date(d.start.getTime()),
      end: new Date(d.end.getTime()),
      // Guidelines 3.5 and the owner's room booking list: "In Progress" until Admin approves (Training, Pantry,
      // Multi-purpose); Meeting and Lactation Room are Approved at once.
      status: initialStatus(req.agendaType),
      agenda: req.agenda,
      agendaType: req.agendaType,
      participants: req.participants,
      owner: { ...req.requester },
      priority: req.priority ?? 'Normal',
      ...(req.trainingType ? { trainingType: req.trainingType } : {}),
      ...(req.specialInstructions ? { specialInstructions: req.specialInstructions } : {}),
      ...(req.hardwareRequirements?.length ? { hardwareRequirements: [...req.hardwareRequirements] } : {}),
      ...(req.recurrence ? { recurrence: { ...req.recurrence } } : {}),
      createdBy: toolLogin(req.requester),
      createdAt: this.now(),
    }));
    this.bookings.push(...created);
    return clone(created[0] as Booking);
  }

  async cancelBooking(ticketNo: string, by: Actor, comment?: string): Promise<void> {
    const b = this.mustFind(ticketNo);
    assertOwner(b, by);
    b.status = 'Cancelled';
    if (by.role === 'admin') this.markAdmin(b, by, comment);
  }

  async checkIn(ticketNo: string, by: Actor): Promise<Booking> {
    const b = this.mustFind(ticketNo);
    assertOwner(b, by);
    if (b.status !== 'Approved' && b.status !== 'In Progress') throw new NotAllowedError(`This booking is ${b.status}.`);
    const window = checkInWindow(b);
    const now = this.now();
    if (now < window.start || now >= window.end) {
      throw new NotAllowedError(`Check-in is open from ${formatManila(window.start)} until ${formatManila(window.end)}.`);
    }
    b.status = 'Checked-In';
    return clone(b);
  }

  async releaseNoShows(): Promise<Booking[]> {
    const now = this.now();
    const due = this.bookings.filter((b) => shouldAutoRelease(b, now));
    for (const b of due) {
      b.status = 'Cancelled';
      b.releasedAt = now;
      b.modifiedBy = 'SYSTEM';
      b.adminComments = `Released: nobody checked in within ${RULES.checkInGraceMinutes} minutes of the start.`;
    }
    return due.map(clone);
  }

  async moveBooking(ticketNo: string, toRoomId: string, _by: Actor): Promise<Booking> {
    // In the real tool the owner must agree (or make the change). The mock trusts the caller.
    const b = this.mustFind(ticketNo);
    if (!this.rooms.some((r) => r.id === toRoomId)) throw new NotFoundError(`Unknown room "${toRoomId}".`);
    const others = this.bookings.filter((x) => x !== b);
    const conflicts = conflictsFor(toRoomId, b, others, this.now());
    if (conflicts.length > 0) throw new ConflictError(conflicts.map(clone));
    b.roomId = toRoomId;
    return clone(b);
  }

  async approveBooking(ticketNo: string, by: Actor, comment?: string): Promise<Booking> {
    assertAdmin(by);
    const b = this.mustFind(ticketNo);
    assertWaiting(b, 'approved');
    b.status = 'Approved';
    this.markAdmin(b, by, comment);
    return clone(b);
  }

  async rejectBooking(ticketNo: string, by: Actor, comment: string): Promise<Booking> {
    assertAdmin(by);
    const b = this.mustFind(ticketNo);
    assertWaiting(b, 'turned down');
    b.status = 'Cancelled';
    this.markAdmin(b, by, comment);
    return clone(b);
  }

  async updateBooking(ticketNo: string, changes: BookingChanges, by: Actor): Promise<Booking> {
    assertAdmin(by);
    const b = this.mustFind(ticketNo);
    assertOpen(b);
    const set = defined(changes);
    const next: Booking = { ...b, ...set };
    const room = this.rooms.find((r) => r.id === next.roomId);
    if (!room) throw new NotFoundError(`Unknown room "${next.roomId}".`);
    if (placementChanged(b, next)) {
      const [wrong] = roomIssues(room, next.agendaType, next.participants);
      if (wrong) throw new NotAllowedError(wrong.message);
    }
    const others = this.bookings.filter((x) => x !== b);
    this.assertFits(next, others, next.start.getTime() !== b.start.getTime() || next.end.getTime() !== b.end.getTime());
    Object.assign(b, set);
    // Type of Training belongs to training bookings only (RULES: Type of Training); On-Site unless Virtual.
    if (b.agendaType === 'Training') b.trainingType ??= 'On-Site';
    else delete b.trainingType;
    this.markAdmin(b, by);
    return clone(b);
  }

  async swapRooms(ticketA: string, ticketB: string, by: Actor): Promise<[Booking, Booking]> {
    assertAdmin(by);
    const a = this.mustFind(ticketA);
    const b = this.mustFind(ticketB);
    if (a === b) throw new NotAllowedError('Pick two different bookings.');
    assertOpen(a);
    assertOpen(b);
    if (a.roomId === b.roomId) throw new NotAllowedError('Both bookings are in the same room.');
    // Each must suit the other's room: its Types of agenda and capacity (the owner's room booking list).
    for (const [x, roomId] of [[a, b.roomId], [b, a.roomId]] as const) {
      const room = this.rooms.find((r) => r.id === roomId);
      const [wrong] = room ? roomIssues(room, x.agendaType, x.participants) : [];
      if (wrong) throw new NotAllowedError(`${x.ticketNo}: ${wrong.message}`);
    }
    // Each must fit the other's room against everyone else; the pair themselves no longer block each other.
    const others = this.bookings.filter((x) => x !== a && x !== b);
    const conflicts = [...conflictsFor(b.roomId, a, others, this.now()), ...conflictsFor(a.roomId, b, others, this.now())];
    if (conflicts.length > 0) throw new ConflictError(conflicts.map(clone));
    [a.roomId, b.roomId] = [b.roomId, a.roomId];
    this.markAdmin(a, by);
    this.markAdmin(b, by);
    return [clone(a), clone(b)];
  }

  async updateRoom(roomId: string, changes: RoomChanges, by: Actor): Promise<Room> {
    assertAdmin(by);
    const r = this.rooms.find((x) => x.id === roomId);
    if (!r) throw new NotFoundError(`Unknown room "${roomId}".`);
    const { notes, ...rest } = changes;
    Object.assign(r, defined(rest));
    if (notes !== undefined) {
      if (notes) r.notes = notes;
      else delete r.notes;
    }
    return { ...r };
  }

  /** The room is free for `next` and, when its time moved, its owner holds no other room then (one room per person). */
  private assertFits(next: Booking, others: Booking[], timeMoved: boolean): void {
    const conflicts = conflictsFor(next.roomId, next, others, this.now());
    if (conflicts.length > 0) throw new ConflictError(conflicts.map(clone));
    if (timeMoved && RULES.oneRoomPerPersonAtATime && next.owner.email) {
      const own = ownConflicts(next.owner.email, next, others, this.now());
      if (own.length > 0) throw new ConflictError(own.map(clone), 'requester');
    }
  }

  /** The tool records who changed a booking (Modified By) and Admin's note (Admin Comments). */
  private markAdmin(b: Booking, by: Actor, comment?: string): void {
    b.modifiedBy = by.login ?? toolLogin(by);
    if (comment) b.adminComments = comment;
  }

  private mustFind(ticketNo: string): Booking {
    const b = this.bookings.find((x) => x.ticketNo === ticketNo);
    if (!b) throw new NotFoundError(`Booking ${ticketNo} not found.`);
    return b;
  }
}

function assertOwner(b: Booking, by: Actor): void {
  if (by.role === 'admin') return;
  if (!sameEmail(b.owner.email, by.email)) throw new NotAllowedError('Only the person who made the booking can do this.');
}

function assertAdmin(by: Actor): void {
  if (by.role !== 'admin') throw new NotAllowedError('Admin only.');
}

/** Only a request still waiting for Admin (In Progress) can be approved or turned down. */
function assertWaiting(b: Booking, what: string): void {
  if (b.status !== 'In Progress') throw new NotAllowedError(`Only requests waiting for Admin can be ${what}. ${b.ticketNo} is ${b.status}.`);
}

/** Only the fields that are set: an undefined field in a change leaves the value as it is. */
function defined<T extends object>(changes: T): Partial<T> {
  return Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** A cancelled or completed booking can't be changed any more. */
function assertOpen(b: Booking): void {
  if (b.status === 'Cancelled' || b.status === 'Completed') throw new NotAllowedError(`${b.ticketNo} is ${b.status}.`);
}

function clone(b: Booking): Booking {
  return {
    ...b,
    start: new Date(b.start.getTime()),
    end: new Date(b.end.getTime()),
    owner: { ...b.owner },
    ...(b.hardwareRequirements ? { hardwareRequirements: [...b.hardwareRequirements] } : {}),
    ...(b.recurrence ? { recurrence: structuredClone(b.recurrence) } : {}),
    createdAt: b.createdAt ? new Date(b.createdAt.getTime()) : undefined,
    holdExpiresAt: b.holdExpiresAt ? new Date(b.holdExpiresAt.getTime()) : undefined,
    ...(b.releasedAt ? { releasedAt: new Date(b.releasedAt.getTime()) } : {}),
  };
}

/** Mock stand-in for the tool's "Created By" login (upper-case e-mail name). The real value comes from the tool. */
function toolLogin(p: Person): string | undefined {
  return p.email?.split('@')[0]?.toUpperCase();
}

/** Small deterministic random generator, so random demo data is the same on every start. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)] as T;
}

function makeSampleBookings(rooms: Room[], now: Date, seed: number, days: number): Booking[] {
  const rand = mulberry32(seed);
  const out: Booking[] = [];
  let ticket = 120001;
  const firstDay = manilaStartOfDay(now);
  for (let d = 0; d < days; d++) {
    const dayStart = addMinutes(firstDay, d * 24 * 60);
    for (const room of rooms) {
      if (!bookable(room)) continue;
      const count = Math.floor(rand() * 4); // 0-3 bookings per room per day
      for (let i = 0; i < count; i++) {
        const start = addMinutes(dayStart, 7 * 60 + Math.floor(rand() * 26) * 30); // 7:00 AM to 7:30 PM
        const end = addMinutes(start, pick([30, 60, 60, 90, 120], rand));
        if (out.some((b) => b.roomId === room.id && b.start < end && start < b.end)) continue;
        const capacity = room.capacity ?? 8;
        out.push({
          ticketNo: `RM-0${ticket++}`,
          roomId: room.id,
          start,
          end,
          status: 'Approved',
          agenda: pick(AGENDAS, rand),
          agendaType: room.agendas[0] as AgendaType,
          participants: Math.max(1, Math.min(capacity, 2 + Math.floor(rand() * 7))),
          owner: { ...pick(OWNERS, rand) },
        });
      }
    }
  }
  return out;
}
