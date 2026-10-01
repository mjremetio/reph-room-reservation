import type { RecurrenceJson } from '../domain/recurrence';
import type { AgendaType, BookingStatus, Priority, Site, TrainingType } from '../domain/types';
import type { Requestor } from '../gateway/ReservationGateway';
import type { PublicBooking } from '../services/views';

/**
 * Structured events the UI uses to update the map and show cards. They go straight to the browser;
 * the model never sees them. Tools send them with ctx.emit().
 */
export type UiEvent =
  | { type: 'focus_time'; start: string; end: string }
  | {
      type: 'room_results';
      flow: 'A' | 'B' | 'C' | 'none';
      agendaType: AgendaType;
      participants: number;
      results: RoomResultView[];
      alternatives: AlternativeView[];
    }
  | { type: 'proposal'; proposal: ProposalView }
  | { type: 'cancel_request'; proposalId: string; ticketNo: string; summary: string; expiresAt: string }
  | { type: 'draft_message'; to: string; channel: 'teams' | 'email'; text: string; link: string }
  | { type: 'handoff'; topic: string; label: string; link: string }
  /** Who has a room (or every booked room on a floor) and when, with the free times (room_schedule). */
  | ({ type: 'room_schedule' } & ScheduleView)
  /**
   * Admin assistant cards (src/agent/adminTools.ts). Nothing changes until the Admin presses the card's button, which
   * calls the same /api/admin/* route as the dashboard (the server checks everything again).
   */
  | { type: 'admin_action'; action: 'approve' | 'reject' | 'cancel' | 'checkin'; ticketNo: string; owner: string; summary: string; comment?: string }
  | { type: 'admin_change'; ticketNo: string; owner: string; change: string; summary: string; body: AdminChangeJson }
  | { type: 'admin_swap'; a: string; b: string; summary: string[] }
  | { type: 'admin_message'; ticketNo: string; owner: string; summary: string; text: string };

/** The body of PATCH /api/admin/bookings/{ticketNo} that an admin_change card sends (times as ISO). */
export interface AdminChangeJson {
  roomId?: string;
  start?: string;
  end?: string;
  participants?: number;
  agenda?: string;
  agendaType?: AgendaType;
  priority?: Priority;
}

export interface RoomResultView {
  roomId: string;
  name: string;
  floor: string;
  availability: 'available' | 'partial' | 'unavailable';
  rank?: number;
  reasons: string[];
  free?: Array<{ start: string; end: string }>;
  /** Who holds the room: owner name, division, time, group size and status only; `mine` = the user's own booking. */
  conflicts?: Array<{ ticketNo: string; start: string; end: string; owner: string; division?: string; participants: number; status: BookingStatus; mine: boolean }>;
}

/** A window of the room schedule: each room's bookings (privacy-filtered) and free times. */
export interface ScheduleView {
  start: string;
  end: string;
  rooms: Array<{ roomId: string; name: string; floor: string; bookings: PublicBooking[]; free: Array<{ start: string; end: string }> }>;
  /** Rooms with bookings left out of `rooms` (limit). */
  more: number;
  /** For a floor or the whole site: rooms free for the whole window. */
  freeRooms: Array<{ roomId: string; name: string; floor: string }>;
}

/** The same room at a nearby time, when nothing is fully free. */
export interface AlternativeView {
  roomId: string;
  name: string;
  floor: string;
  start: string;
  end: string;
}

export interface ProposalView {
  id: string;
  /** Name of Requestor: the signed-in person the booking is for. */
  requester: string;
  roomId: string;
  roomName: string;
  floor: string;
  start: string;
  end: string;
  agendaType: AgendaType;
  agenda: string;
  participants: number;
  priority: Priority;
  trainingType?: TrainingType;
  specialInstructions?: string;
  hardwareRequirements?: string[];
  /** A repeating booking: the pattern and every date it books (all or none). */
  recurrence?: RecurrenceJson;
  dates?: string[];
  expiresAt: string;
}

/** Passed to every agent run. Tools read the user and clock from here, never from the model. */
export interface AssistantContext {
  /** The signed-in person: the Name of Requestor of everything the assistant prepares. */
  user: Requestor;
  now: Date;
  defaultSite: Site;
  emit: (event: UiEvent) => void;
  /** How long prepared proposals wait for Confirm: the app's cards by default, longer for MCP confirm links. */
  proposalHoldMinutes?: number;
}
