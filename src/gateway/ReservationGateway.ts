import type { Recurrence } from '../domain/recurrence';
import type { AgendaType, AV, Booking, Person, Priority, Role, Room, Site, TrainingType } from '../domain/types';

export interface NewBooking {
  roomId: string;
  start: Date;
  end: Date;
  agenda: string;
  agendaType: AgendaType;
  participants: number;
  requester: Person;
  priority?: Priority;
  trainingType?: TrainingType;
  specialInstructions?: string;
  hardwareRequirements?: string[];
  /** Book every date of the series, or none (ConflictError lists the clashes). */
  recurrence?: Recurrence;
}

/** Admin blocks rooms for a time (maintenance, an event): see blockRooms. */
export interface RoomBlock {
  roomIds: string[];
  start: Date;
  end: Date;
  reason: string;
}

/** Admin books several rooms at once, each for every date of the recurrence, for `requester`: see bulkBook. */
export interface BulkBooking extends Omit<NewBooking, 'roomId'> {
  roomIds: string[];
}

export class ConflictError extends Error {
  readonly conflicts: Booking[];
  /** 'room': someone holds the room; 'requester': the requester already has another room then (RULES.oneRoomPerPersonAtATime). */
  readonly kind: 'room' | 'requester';
  constructor(conflicts: Booking[], kind: 'room' | 'requester' = 'room') {
    super(kind === 'room' ? 'The room is no longer free for that time.' : 'You already have a room booked at that time.');
    this.name = 'ConflictError';
    this.conflicts = conflicts;
    this.kind = kind;
  }
}

export class NotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotAllowedError';
  }
}

/** Why a room block can't be changed, moved or swapped: Admin lifts it (cancelBooking) and blocks again. */
export function blockIsFixed(b: Pick<Booking, 'ticketNo'>): string {
  return `${b.ticketNo} is a room block: lift it, then block the room again for the new time.`;
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * The only way this app reads or writes reservations.
 * Today: MockGateway. Later: an implementation over the Room Reservation Tool's API or database (docs/spec/08-integration.md).
 * Every write must go through the tool's own rules so approvals, .ics emails, reminders and auto-cancel still happen.
 */
/** Someone who can be chosen as "Name of Requestor": the tool's employee list. `login` is the tool's user name. */
export type Requestor = Person & { email: string; login: string };

/**
 * Whoever changes a booking: its owner, or an Admin. `role: 'admin'` is set only by requireAdmin (src/lib/requestor.ts)
 * for /api/admin/* routes; the assistant, MCP and the user's own routes never pass it, so they stay owner-only.
 */
export type Actor = Person & { login?: string; role?: Role };

/** What Admin may change on a booking (docs/spec/02-flows.md F30). Rules are checked first by prepareAdminChange. */
export interface BookingChanges {
  roomId?: string;
  start?: Date;
  end?: Date;
  participants?: number;
  agenda?: string;
  agendaType?: AgendaType;
  priority?: Priority;
}

/** What Admin may change on a room. The id, site and floor stay: the floor plans are keyed on them. */
export interface RoomChanges {
  name?: string;
  capacity?: number | null;
  av?: AV;
  selfBookable?: boolean;
  notes?: string | null;
}

export interface ReservationGateway {
  listRooms(site?: Site): Promise<Room[]>;
  /** Everyone who can be chosen as requestor, the default first. */
  listPeople(): Promise<Requestor[]>;
  /** Bookings overlapping [from, to), any status. Callers filter with isBlocking(). */
  getBookings(query: { roomIds?: string[]; from: Date; to: Date }): Promise<Booking[]>;
  getBooking(ticketNo: string): Promise<Booking | null>;
  /** The person's bookings overlapping [from, to), any status, sorted by start; without `to`, every one from `from` on. */
  listMyBookings(email: string, from: Date, to?: Date): Promise<Booking[]>;
  /**
   * Throws ConflictError if the room was taken in the meantime, or (kind 'requester') if the requester already holds
   * another room at that time (RULES.oneRoomPerPersonAtATime). With a recurrence it books every date of the
   * series or none (ConflictError lists every clash) and returns the first date's booking.
   */
  createBooking(req: NewBooking): Promise<Booking>;
  /** The owner, or an Admin (then `comment` goes into Admin comments). */
  cancelBooking(ticketNo: string, by: Actor, comment?: string): Promise<void>;
  /** The owner, or an Admin on their behalf; inside the check-in window either way. */
  checkIn(ticketNo: string, by: Actor): Promise<Booking>;
  /**
   * Cancels every booking nobody checked in to by the end of its check-in window (`shouldAutoRelease`), so its room is
   * free for others, and returns the ones it cancelled now (`releasedAt` set). The real tool may do this itself
   * (RULES question 3); its adapter then returns the bookings the tool released since the last call, or none.
   */
  releaseNoShows(): Promise<Booking[]>;
  /** Moves a booking to another room at the same time (used for swaps the owner agreed to). */
  moveBooking(ticketNo: string, toRoomId: string, by: Actor): Promise<Booking>;
  /** Admin: a request waiting for Admin (In Progress) becomes Approved. */
  approveBooking(ticketNo: string, by: Actor, comment?: string): Promise<Booking>;
  /** Admin: a request waiting for Admin is turned down: Cancelled, with the reason in Admin comments. */
  rejectBooking(ticketNo: string, by: Actor, comment: string): Promise<Booking>;
  /**
   * Admin: changes a booking that is still ahead or running. Throws ConflictError when the room is taken then
   * (kind 'room') or the owner already holds another room then (kind 'requester').
   */
  updateBooking(ticketNo: string, changes: BookingChanges, by: Actor): Promise<Booking>;
  /** Admin: two bookings exchange rooms in one step (each keeps its time). Throws ConflictError if either no longer fits. */
  swapRooms(ticketA: string, ticketB: string, by: Actor): Promise<[Booking, Booking]>;
  /** Admin: changes a room's details. */
  updateRoom(roomId: string, changes: RoomChanges, by: Actor): Promise<Room>;
  /**
   * Admin: blocks each room for the time ("Blocked": it holds the room, so nobody else can book it then). The bookings
   * already there are cancelled first if they are in `cancel` (the tickets Admin saw and agreed to cancel); any other
   * stops it (ConflictError lists them), and so does another block (NotAllowedError: lift it first). All or none.
   */
  blockRooms(block: RoomBlock, by: Actor, cancel: readonly string[]): Promise<{ blocks: Booking[]; cancelled: Booking[] }>;
  /**
   * Admin: books every room, for every date of the recurrence, Approved at once; each room must take the type of agenda
   * and the group, and one person may hold all of them. The bookings already there are cancelled first if they are in
   * `cancel`, as for blockRooms. All or none.
   */
  bulkBook(req: BulkBooking, by: Actor, cancel: readonly string[]): Promise<{ created: Booking[]; cancelled: Booking[] }>;
}
