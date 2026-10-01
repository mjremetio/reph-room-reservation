export type Site = 'Manila' | 'Iloilo';

/** "Type of Agenda" options in the current Room Reservation Tool. */
export type AgendaType = 'Meeting' | 'Training' | 'Pantry' | 'Lactation Room' | 'Multi-purpose';

export type RoomKind =
  | 'Meeting'
  | 'Collaboration'
  | 'Huddle'
  | 'Training'
  | 'Multi-purpose'
  | 'Pantry'
  | 'Lactation Room'
  | 'Visitor Office';

/** From the guidelines: VC = video conferencing kit, BYOD = dock with USB and HDMI. */
export type AV = 'VC' | 'BYOD' | null;

export interface Room {
  id: string;
  /** Display name, e.g. "Batanes". */
  name: string;
  /** Name as the current tool shows it, when different (e.g. "Batanes 3F"). */
  toolName?: string;
  site: Site;
  building: string;
  floor: string;
  kind: RoomKind;
  av: AV;
  /** Maximum number of people. null = not known yet (take it from the tool's room data). */
  capacity: number | null;
  /** The Types of agenda this room can be booked for (src/data/rooms.ts). Empty: nobody can book it in the app. */
  agendas: AgendaType[];
  /** false = must go through Admin (BU visitor offices). */
  selfBookable: boolean;
  notes?: string;
}

/** What a signed-in account may do: `admin` runs the Admin pages (/admin); everyone books as themselves. */
export type Role = 'admin' | 'user';

/**
 * Statuses used by the current tool, plus "Held" for short-lived assistant proposals and "Blocked" (ours, 1 Oct 2026):
 * Admin blocked the room for that time (maintenance, an event). A block holds its room like a booking; its agenda is the
 * reason and its owner the Admin who blocked it.
 */
export type BookingStatus = 'Held' | 'In Progress' | 'Approved' | 'Checked-In' | 'Completed' | 'Cancelled' | 'Blocked';

export interface Person {
  /** "Last, First", like the current tool. */
  name: string;
  email?: string;
  division?: string;
}

export interface Interval {
  start: Date;
  /** Exclusive: [start, end). */
  end: Date;
}

import type { Recurrence } from './recurrence';

/** Reservation form "Priority". Urgent only per `urgentAllowed` (src/domain/rules.ts). */
export type Priority = 'Normal' | 'Urgent';

/** Reservation form "Type of Training". */
export type TrainingType = 'On-Site' | 'Virtual';

/**
 * A reservation as the Room Reservation Tool keeps it. Field names follow its list view and form
 * (Ticket No, Agenda, Employee = owner, Division, Category = agendaType, Room, Starts At, Ends At,
 * Created By, Created Date, Status, Priority, Type of Training, Special Instructions, Admin Comments, Modified By).
 */
export interface Booking extends Interval {
  ticketNo: string;
  roomId: string;
  status: BookingStatus;
  agenda: string;
  agendaType: AgendaType;
  participants: number;
  owner: Person;
  priority?: Priority;
  trainingType?: TrainingType;
  specialInstructions?: string;
  /** Form "Hardware Requirements" (options in src/config/hardware.ts). */
  hardwareRequirements?: string[];
  /** Form "Recurrence": the series this date belongs to (one booking per date). */
  recurrence?: Recurrence;
  /** The tool's login of whoever filed it, shown in its "Created By" column. */
  createdBy?: string;
  createdAt?: Date;
  modifiedBy?: string;
  /** Set by Admin in the tool, e.g. when approving or rejecting. */
  adminComments?: string;
  holdExpiresAt?: Date;
  /** When the booking was cancelled because nobody checked in (RULES.autoReleaseNoShows): a no-show. */
  releasedAt?: Date;
}

export interface RoomRequest extends Interval {
  site: Site;
  agendaType: AgendaType;
  participants: number;
  agenda?: string;
  needsVC?: boolean;
}
