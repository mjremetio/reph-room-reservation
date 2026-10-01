/**
 * The app's own data: things the Room Reservation Tool doesn't keep (docs/spec/03-data-model.md, App-owned data).
 * Sign-in accounts (seeded from src/config/accounts.ts), the audit log, and the message threads between Admin and the
 * person who made a booking. Reservations are never stored here: they go through ReservationGateway.
 * Today: MemoryStore (resets with the server, like the demo bookings). P3-06 moves it to PostgreSQL.
 */
import type { Account } from '../config/accounts';

export interface StoredAccount extends Account {
  disabled: boolean;
  /** Set by an Admin reset: the person must choose a new password before using the app. */
  mustChangePassword: boolean;
  /**
   * Wall-clock ms (like the session cookie's expiry): sessions and AI-app tokens issued at or before this are refused.
   * Set by a reset and by "Sign out everywhere"; 0 = never.
   */
  sessionsValidAfter: number;
  createdAt: Date;
  lastSignInAt?: Date;
}

export type AccountPatch = Partial<
  Pick<StoredAccount, 'name' | 'division' | 'role' | 'disabled' | 'mustChangePassword' | 'passwordHash' | 'sessionsValidAfter' | 'lastSignInAt'>
>;

/** Every write the app makes, and sign-ins (docs/spec/09-quality.md, Audit). Never message text or passwords. */
export type AuditAction =
  | 'session.signin'
  | 'session.signin_failed'
  | 'session.signout'
  | 'session.password'
  | 'booking.create'
  | 'booking.cancel'
  | 'booking.checkin'
  | 'booking.release'
  | 'booking.approve'
  | 'booking.reject'
  | 'booking.update'
  | 'booking.swap'
  | 'booking.block'
  | 'booking.unblock'
  | 'user.create'
  | 'user.update'
  | 'user.reset'
  | 'user.signout'
  | 'room.update'
  | 'message.send';

export interface AuditEntry {
  id: number;
  at: Date;
  /** Tool login of whoever acted (the username tried, for a failed sign-in). */
  actor: string;
  actorName: string;
  action: AuditAction;
  /** A ticket number, login or room id. */
  target?: string;
  /** Short, readable summary, e.g. "Tokyo → Paris" or "role: user → admin". */
  detail?: string;
}

export interface Message {
  id: number;
  ticketNo: string;
  at: Date;
  login: string;
  name: string;
  /** Written by an Admin (or, with `system`, by the app on an Admin action). */
  admin: boolean;
  /** An automatic note, e.g. "Admin approved this booking." */
  system?: boolean;
  text: string;
}

/** One conversation per booking, between its owner and Admin. */
export interface Thread {
  ticketNo: string;
  ownerEmail: string;
  ownerName: string;
  messages: Message[];
}

export interface AppStore {
  accounts: {
    list(): StoredAccount[];
    /** By login or e-mail, any case. */
    find(username: string): StoredAccount | undefined;
    /** Throws when the login or e-mail is taken. */
    create(account: Account, at: Date): StoredAccount;
    /** Throws when the login is unknown. */
    update(login: string, patch: AccountPatch): StoredAccount;
  };
  audit: {
    record(entry: Omit<AuditEntry, 'id'>): AuditEntry;
    /** Newest first. */
    list(): AuditEntry[];
  };
  messages: {
    thread(ticketNo: string): Thread | undefined;
    threads(): Thread[];
    post(owner: { ticketNo: string; ownerEmail: string; ownerName: string }, message: Omit<Message, 'id' | 'ticketNo'>): Message;
    lastRead(ticketNo: string, login: string): Date | undefined;
    markRead(ticketNo: string, login: string, at: Date): void;
  };
}
