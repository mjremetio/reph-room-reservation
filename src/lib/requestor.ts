/**
 * Who is acting: the signed-in account (demo sign-in, src/lib/session.ts). It is the "Name of Requestor" of every
 * booking, cancellation and check-in, and whose bookings are "mine". Every API route except /api/health and
 * /api/session needs it. Identity comes only from the signed session cookie, never from a request body or header.
 */
import type { Requestor } from '../gateway/ReservationGateway';
import type { StoredAccount } from '../store/AppStore';
import { accountByLogin, accountPerson, readSession, sessionToken } from './session';

/** The signed-in account, or undefined (no cookie, a bad or expired one, or an account removed, disabled or reset). */
export function signedInAccount(request: Request): StoredAccount | undefined {
  const session = readSession(sessionToken(request));
  return session ? accountByLogin(session.login, session.issuedAt) : undefined;
}

/** The signed-in person, or null. */
export async function requestor(request: Request): Promise<Requestor | null> {
  const account = signedInAccount(request);
  return account ? accountPerson(account) : null;
}

/** 401 UNAUTHORIZED when nobody is signed in; the browser then shows the sign-in screen. */
export async function requireRequestor(request: Request): Promise<Requestor | Response> {
  return (await requestor(request)) ?? Response.json({ ok: false, code: 'UNAUTHORIZED', message: 'Sign in to continue.' }, { status: 401 });
}

/** Someone acting as Admin: the role comes only from the account store, never from the request. */
export type AdminActor = Requestor & { role: 'admin' };

/**
 * For /api/admin/*: 401 when nobody is signed in, 403 NOT_ALLOWED for everyone but an Admin. Checked on every
 * request, so a role change or a disabled account takes effect at once. The /admin pages hold no data themselves.
 */
export async function requireAdmin(request: Request): Promise<AdminActor | Response> {
  const account = signedInAccount(request);
  if (!account) return Response.json({ ok: false, code: 'UNAUTHORIZED', message: 'Sign in to continue.' }, { status: 401 });
  if (account.role !== 'admin') return Response.json({ ok: false, code: 'NOT_ALLOWED', message: 'Admin only.' }, { status: 403 });
  return { ...accountPerson(account), role: 'admin' };
}
