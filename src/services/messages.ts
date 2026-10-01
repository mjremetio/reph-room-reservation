/**
 * Messages between Admin and the person who made a booking (docs/spec/02-flows.md F29): one thread per booking. The
 * owner and Admin can read and write it; nobody else can. Admin's actions on a booking post an automatic note.
 * Unread = messages from the other side after the reader last opened the thread.
 */
import { sameEmail } from '../domain/people';
import type { Booking, Room } from '../domain/types';
import type { ReservationGateway } from '../gateway/ReservationGateway';
import type { AppStore, Message, Thread } from '../store/AppStore';
import { bookingLabel } from './adminBookings';
import type { Prepared } from './prepareBooking';

/** Who reads or writes: the signed-in account, with its role from the account store. */
export interface Reader {
  login: string;
  name: string;
  email: string;
  admin: boolean;
}

/** Longest message a person can send. */
export const MESSAGE_MAX = 2000;

const canSee = (b: Booking, reader: Reader) => reader.admin || sameEmail(b.owner.email, reader.email);

/** A message is unread for the reader when it came from the other side after they last opened the thread. */
function unread(thread: Thread, reader: Reader, store: AppStore): number {
  const seen = store.messages.lastRead(thread.ticketNo, reader.login)?.getTime() ?? 0;
  const owner = sameEmail(thread.ownerEmail, reader.email);
  return thread.messages.filter((m) => m.at.getTime() > seen && m.login !== reader.login && (owner ? m.admin : !m.admin)).length;
}

function messageView(m: Message, reader: Reader) {
  return { id: m.id, at: m.at.toISOString(), name: m.name, admin: m.admin, system: m.system ?? false, text: m.text, mine: m.login === reader.login && !m.system };
}
export type MessageView = ReturnType<typeof messageView>;

function summary(thread: Thread, booking: Booking | null, rooms: Room[], reader: Reader, store: AppStore) {
  const last = thread.messages.at(-1);
  return {
    ticketNo: thread.ticketNo,
    owner: thread.ownerName,
    booking: booking ? { label: bookingLabel(booking, rooms), status: booking.status, agenda: booking.agenda, start: booking.start.toISOString() } : null,
    last: last ? { at: last.at.toISOString(), name: last.name, text: last.text.slice(0, 140), admin: last.admin } : null,
    unread: unread(thread, reader, store),
  };
}
export type ThreadSummary = ReturnType<typeof summary>;

/** The reader's threads (every thread for Admin), newest message first, with the unread total. */
export async function listThreads(gw: ReservationGateway, store: AppStore, reader: Reader): Promise<{ threads: ThreadSummary[]; unread: number }> {
  const rooms = await gw.listRooms();
  const mine = store.messages.threads().filter((t) => reader.admin || sameEmail(t.ownerEmail, reader.email));
  const threads = await Promise.all(mine.map(async (t) => summary(t, await gw.getBooking(t.ticketNo), rooms, reader, store)));
  threads.sort((a, b) => (b.last?.at ?? '').localeCompare(a.last?.at ?? ''));
  return { threads, unread: threads.reduce((s, t) => s + t.unread, 0) };
}

/** One booking's thread for its owner or Admin (empty until someone writes). Opening it marks it read. */
export async function openThread(gw: ReservationGateway, store: AppStore, reader: Reader, ticketNo: string, now: Date) {
  const booking = await gw.getBooking(ticketNo);
  if (!booking) return { ok: false as const, code: 'NOT_FOUND' as const, problems: [`Booking ${ticketNo} not found.`] };
  if (!canSee(booking, reader)) return { ok: false as const, code: 'NOT_ALLOWED' as const, problems: ['Only the person who made the booking and Admin can see this conversation.'] };
  const thread = store.messages.thread(ticketNo);
  // Only when something new came in, so the 15-second poll of an open thread doesn't rewrite the state each time.
  if (thread && unread(thread, reader, store) > 0) store.messages.markRead(ticketNo, reader.login, now);
  return {
    ok: true as const,
    value: {
      ticketNo,
      owner: booking.owner.name,
      booking: { label: bookingLabel(booking, await gw.listRooms()), status: booking.status, agenda: booking.agenda },
      messages: (thread?.messages ?? []).map((m) => messageView(m, reader)),
    },
  };
}
export type ThreadView = Extract<Awaited<ReturnType<typeof openThread>>, { ok: true }>['value'];

/** The owner or Admin writes in a booking's thread. */
export async function postMessage(gw: ReservationGateway, store: AppStore, reader: Reader, ticketNo: string, text: string, now: Date): Promise<Prepared<MessageView>> {
  const booking = await gw.getBooking(ticketNo);
  if (!booking) return { ok: false, code: 'NOT_FOUND', problems: [`Booking ${ticketNo} not found.`] };
  if (!canSee(booking, reader)) return { ok: false, code: 'NOT_ALLOWED', problems: ['Only the person who made the booking and Admin can write here.'] };
  const saved = store.messages.post(
    { ticketNo, ownerEmail: booking.owner.email ?? '', ownerName: booking.owner.name },
    { at: now, login: reader.login, name: reader.name, admin: reader.admin && !sameEmail(booking.owner.email, reader.email), text: text.trim() },
  );
  store.messages.markRead(ticketNo, reader.login, now);
  return { ok: true, value: messageView(saved, reader) };
}

/** The automatic note on an Admin action, e.g. "Approved by Admin. Note: …". It shows as unread for the owner. */
export function adminNote(store: AppStore, booking: Booking, admin: { login: string; name: string }, text: string, now: Date): void {
  store.messages.post(
    { ticketNo: booking.ticketNo, ownerEmail: booking.owner.email ?? '', ownerName: booking.owner.name },
    { at: now, login: admin.login, name: admin.name, admin: true, system: true, text },
  );
}
