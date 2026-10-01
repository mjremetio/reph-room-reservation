/** Browser-side API calls and TanStack Query hooks (docs/spec/04-api.md). */
'use client';

import { useQuery } from '@tanstack/react-query';
import type { AdminBlockJson, AdminBulkJson, AdminChangeJson, AlternativeView, ProposalView, RoomResultView } from '../agent/context';
import type { Report } from '../domain/reports';
import type { AccountView } from '../lib/accounts';
import type { AuditView } from '../lib/audit';
import type { MessageView, ThreadSummary, ThreadView } from '../services/messages';
import type { CancelView } from '../services/prepareBooking';
import type { AdminBooking, AdminRoomView, PublicBooking, RoomView } from '../services/views';
import type { RecurrenceJson } from '../domain/recurrence';
import type { FormField } from '../domain/rules';
import type { AgendaType, Priority, Role, TrainingType } from '../domain/types';
import { toManilaIso } from './format';

export type { AccountView, AdminBooking, AdminRoomView, AuditView, MessageView, PublicBooking, RoomView, ThreadSummary, ThreadView };

/** The signed-in person (GET /api/session): the tool's login, name, division and role (no e-mail). */
export interface Person {
  login: string;
  name: string;
  division: string | null;
  role: Role;
  /** After an Admin reset: the app asks for a new password first. */
  mustChangePassword: boolean;
}

/** GET /api/admin/reports: the report with ISO dates. */
export type ReportJson = Omit<Report, 'from' | 'to'> & { from: string; to: string };

/** GET /api/admin/overview (the dashboard). */
export interface Overview {
  ok: true;
  now: string;
  kpis: {
    waiting: number;
    today: number;
    todayHours: number;
    inUseNow: number;
    checkedInToday: number;
    noShowsToday: number;
    utilisationToday: number;
    utilisationWeek: number;
    unread: number;
    activeUsers: number;
  };
  waiting: AdminBooking[];
  today: AdminBooking[];
  week: { from: string; byDay: ReportJson['byDay']; byStatus: ReportJson['byStatus'] };
  threads: ThreadSummary[];
  recent: AuditView[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Every rule problem or clashing date, when the server lists them. */
    readonly problems?: string[],
    /** The form fields to mark as wrong (red border), when the server knows them. */
    readonly fields?: FormField[],
  ) {
    super(message);
  }
}

/** Called when the server answers 401 (the session ended): the app goes back to the sign-in screen. */
let onSignedOut: () => void = () => {};
export const whenSignedOut = (fn: () => void) => {
  onSignedOut = fn;
};

/** Every call sends the session cookie (same origin); identity never travels in a header or body. */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  } catch {
    throw new ApiError(0, 'UNAVAILABLE', "Can't reach the app server. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; message?: string; problems?: string[]; fields?: FormField[] };
  if (res.status === 401 && !path.startsWith('/api/session')) onSignedOut();
  if (!res.ok || body.ok === false) throw new ApiError(res.status, body.code ?? 'INTERNAL', body.message ?? 'Something went wrong. Please try again.', body.problems, body.fields);
  return body as T;
}

export interface Health {
  ok: true;
  gateway: string;
  scenario: string;
  openai: 'configured' | 'missing';
  model: string;
  clock: 'demo' | 'real';
  now: string;
}

/** The reservation form's fields (requester and division come from the signed-in person). */
export interface BookingRequest {
  roomId: string;
  agendaType: AgendaType;
  agenda: string;
  start: Date;
  end: Date;
  participants: number;
  priority: Priority;
  trainingType?: TrainingType;
  specialInstructions?: string;
  hardwareRequirements?: string[];
  recurrence?: RecurrenceJson;
}

/** Filters of GET /api/bookings: the tool's search panel plus status. No dates = every booking, past and future. */
export interface BookingsFilter {
  from?: Date;
  to?: Date;
  agendaType?: AgendaType;
  site?: 'Manila' | 'Iloilo';
  building?: string;
  roomId?: string;
  employee?: string;
  status?: string;
}

export type MyBooking = PublicBooking & { checkIn: { start: string; end: string; open: boolean } };

/** Same shape as the assistant's room_results event (src/agent/context.ts). */
export interface SearchResponse {
  ok: true;
  flow: 'A' | 'B' | 'C' | 'none';
  agendaType: AgendaType;
  participants: number;
  warnings: string[];
  results: RoomResultView[];
  alternatives: AlternativeView[];
}

export interface Availability {
  ok: true;
  rooms: Array<{ roomId: string; busy: PublicBooking[] }>;
}

export const api = {
  health: () => call<Health>('/api/health'),
  session: () => call<{ ok: true; user: Person | null }>('/api/session').then((r) => r.user),
  signIn: (username: string, password: string) =>
    call<{ ok: true; user: Person }>('/api/session', { method: 'POST', body: JSON.stringify({ username, password }) }).then((r) => r.user),
  signOut: () => call<{ ok: true }>('/api/session', { method: 'DELETE' }),
  rooms: () => call<{ ok: true; rooms: RoomView[] }>('/api/rooms?site=Manila').then((r) => r.rooms),
  availability: (from: Date, to: Date) =>
    call<Availability>(`/api/availability?site=Manila&from=${encodeURIComponent(toManilaIso(from))}&to=${encodeURIComponent(toManilaIso(to))}`),
  search: (req: { agendaType: AgendaType; start: Date; end: Date; participants: number }) =>
    call<SearchResponse>('/api/search', {
      method: 'POST',
      body: JSON.stringify({ site: 'Manila', agendaType: req.agendaType, start: toManilaIso(req.start), end: toManilaIso(req.end), participants: req.participants }),
    }),
  proposeBooking: (req: BookingRequest) =>
    call<{ ok: true; proposal: ProposalView }>('/api/proposals', {
      method: 'POST',
      body: JSON.stringify({ ...req, start: toManilaIso(req.start), end: toManilaIso(req.end) }),
    }).then((r) => r.proposal),
  proposeCancel: (ticketNo: string) =>
    call<{ ok: true; cancel: CancelView }>('/api/proposals', { method: 'POST', body: JSON.stringify({ action: 'cancel', ticketNo }) }).then((r) => r.cancel),
  /** The card behind a confirm link from an MCP client. */
  proposal: (proposalId: string) =>
    call<({ kind: 'book'; proposal: ProposalView } | { kind: 'cancel'; cancel: CancelView }) & { ok: true }>(`/api/proposals/${encodeURIComponent(proposalId)}`),
  confirm: (proposalId: string) =>
    call<{ ok: true; booking?: PublicBooking; dates?: number; ticketNo?: string }>(`/api/proposals/${encodeURIComponent(proposalId)}`, { method: 'POST' }),
  bookings: (f: BookingsFilter) => {
    const q = new URLSearchParams();
    if (f.from) q.set('from', toManilaIso(f.from));
    if (f.to) q.set('to', toManilaIso(f.to));
    for (const k of ['agendaType', 'site', 'building', 'roomId', 'employee', 'status'] as const) if (f[k]) q.set(k, String(f[k]));
    return call<{ ok: true; bookings: PublicBooking[] }>(`/api/bookings?${q}`).then((r) => r.bookings);
  },
  myBookings: () => call<{ ok: true; bookings: MyBooking[] }>('/api/bookings/mine').then((r) => r.bookings),
  checkIn: (ticketNo: string) => call<{ ok: true; booking: PublicBooking }>(`/api/bookings/${encodeURIComponent(ticketNo)}/check-in`, { method: 'POST' }),
  changePassword: (current: string, next: string) => call<{ ok: true }>('/api/session/password', { method: 'POST', body: JSON.stringify({ current, next }) }),
  threads: () => call<{ ok: true; threads: ThreadSummary[]; unread: number }>('/api/messages'),
  thread: (ticketNo: string) => call<{ ok: true; thread: ThreadView }>(`/api/messages/${encodeURIComponent(ticketNo)}`).then((r) => r.thread),
  sendMessage: (ticketNo: string, text: string) =>
    call<{ ok: true; message: MessageView }>(`/api/messages/${encodeURIComponent(ticketNo)}`, { method: 'POST', body: JSON.stringify({ text }) }).then((r) => r.message),
};

const range = (from: Date, to: Date) => `from=${encodeURIComponent(toManilaIso(from))}&to=${encodeURIComponent(toManilaIso(to))}`;
const enc = encodeURIComponent;
type WithAccount = { ok: true; user: AccountView; password?: string };

/** The Admin pages' calls (/api/admin/*). The server checks the Admin role on every one. */
export const adminApi = {
  overview: () => call<Overview>('/api/admin/overview'),
  /** What changed since audit id `after` (the live Admin pages ask every 3 s). */
  changes: (after?: number) => call<{ ok: true; last: number; entries: AuditView[] }>(`/api/admin/changes${after === undefined ? '' : `?after=${after}`}`),
  bookings: (from: Date, to: Date, status?: string) =>
    call<{ ok: true; bookings: AdminBooking[] }>(`/api/admin/bookings?${range(from, to)}${status ? `&status=${enc(status)}` : ''}`).then((r) => r.bookings),
  act: (ticketNo: string, action: 'approve' | 'reject' | 'cancel' | 'checkin', comment?: string) =>
    call<{ ok: true; booking: AdminBooking }>(`/api/admin/bookings/${enc(ticketNo)}`, { method: 'POST', body: JSON.stringify({ action, ...(comment ? { comment } : {}) }) }),
  change: (ticketNo: string, body: AdminChangeJson) =>
    call<{ ok: true; booking: AdminBooking }>(`/api/admin/bookings/${enc(ticketNo)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  approveMany: (ticketNos: string[]) =>
    call<{ ok: true; approved: string[]; failed: Array<{ ticketNo: string; message: string }> }>('/api/admin/bookings/approve', { method: 'POST', body: JSON.stringify({ ticketNos }) }),
  swap: (a: string, b: string) => call<{ ok: true; bookings: AdminBooking[] }>('/api/admin/bookings/swap', { method: 'POST', body: JSON.stringify({ a, b }) }),
  /** The bookings a block would cancel (nothing changes). */
  blockPreview: (body: AdminBlockJson) => call<{ ok: true; affected: AdminBooking[] }>('/api/admin/blocks', { method: 'POST', body: JSON.stringify({ ...body, dryRun: true }) }),
  /** Blocks the rooms, cancelling `cancel` (the tickets Admin saw); any other booking in the way stops it. */
  block: (body: AdminBlockJson, cancel: string[]) =>
    call<{ ok: true; blocks: AdminBooking[]; cancelled: AdminBooking[] }>('/api/admin/blocks', { method: 'POST', body: JSON.stringify({ ...body, cancel }) }),
  /** How many bookings a bulk booking makes, for whom, and the bookings it would cancel (nothing changes). */
  bulkPreview: (body: AdminBulkJson) =>
    call<{ ok: true; count: number; owner: string; affected: AdminBooking[] }>('/api/admin/bookings/bulk', { method: 'POST', body: JSON.stringify({ ...body, dryRun: true }) }),
  bulk: (body: AdminBulkJson, cancel: string[]) =>
    call<{ ok: true; created: AdminBooking[]; cancelled: AdminBooking[] }>('/api/admin/bookings/bulk', { method: 'POST', body: JSON.stringify({ ...body, cancel }) }),
  reports: (from: Date, to: Date) => call<{ ok: true; report: ReportJson }>(`/api/admin/reports?${range(from, to)}`).then((r) => r.report),
  audit: () => call<{ ok: true; entries: AuditView[] }>('/api/admin/audit').then((r) => r.entries),
  users: () => call<{ ok: true; users: AccountView[] }>('/api/admin/users').then((r) => r.users),
  addUser: (u: { name: string; email: string; division?: string; role: Role }) => call<WithAccount>('/api/admin/users', { method: 'POST', body: JSON.stringify(u) }),
  editUser: (login: string, patch: { name?: string; division?: string | null; role?: Role; disabled?: boolean }) =>
    call<WithAccount>(`/api/admin/users/${enc(login)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  resetUser: (login: string) => call<WithAccount>(`/api/admin/users/${enc(login)}/reset`, { method: 'POST' }),
  signOutUser: (login: string) => call<WithAccount>(`/api/admin/users/${enc(login)}/signout`, { method: 'POST' }),
  rooms: () => call<{ ok: true; rooms: AdminRoomView[] }>('/api/admin/rooms').then((r) => r.rooms),
  editRoom: (roomId: string, patch: { name?: string; capacity?: number | null; av?: 'VC' | 'BYOD' | null; selfBookable?: boolean; notes?: string | null }) =>
    call<{ ok: true; room: AdminRoomView }>(`/api/admin/rooms/${enc(roomId)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
};

/** How often threads and the unread badge refresh (no push yet). */
export const MESSAGES_POLL_MS = 15_000;
export const useThreads = () => useQuery({ queryKey: ['messages'], queryFn: api.threads, refetchInterval: MESSAGES_POLL_MS });
export const useThread = (ticketNo: string | null) =>
  useQuery({ queryKey: ['messages', ticketNo], queryFn: () => api.thread(ticketNo as string), enabled: !!ticketNo, refetchInterval: MESSAGES_POLL_MS });

export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 });
/** The signed-in person, or null (the sign-in screen). Set directly on sign-in and sign-out. */
/** Checked again every minute and on return to the tab, so a role Admin changed (the Admin link) or a sign-out everywhere shows up. */
export const useSession = () => useQuery({ queryKey: ['session'], queryFn: api.session, staleTime: 30_000, refetchInterval: 60_000, refetchOnWindowFocus: true, retry: 2 });
export const useRooms = () => useQuery({ queryKey: ['rooms'], queryFn: api.rooms, staleTime: 5 * 60_000 });
/** The tool's reservation list for the table (every status). Refreshes with availability. */
export const useBookingsList = (f: BookingsFilter) =>
  useQuery({ queryKey: ['bookings', 'list', f], queryFn: () => api.bookings(f), placeholderData: (prev) => prev, refetchInterval: 60_000 });
export const useMyBookings = () => useQuery({ queryKey: ['bookings', 'mine'], queryFn: api.myBookings });

/** Busy times for all Manila rooms over [from, to). Refreshes every minute so the map stays current. */
export const useAvailability = (from: Date, to: Date, enabled = true) =>
  useQuery({
    queryKey: ['availability', from.toISOString(), to.toISOString()],
    queryFn: () => api.availability(from, to),
    enabled,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
