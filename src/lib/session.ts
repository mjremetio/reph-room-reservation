/**
 * The demo sign-in (docs/spec/09-quality.md, Security): username and password against the account store (seeded
 * from src/config/accounts.ts; Admin manages it at /admin/users), then a signed session cookie. The cookie holds only the login and an expiry, signed with SESSION_SECRET
 * (HMAC-SHA256), so any server instance can check it without a session store. HttpOnly, SameSite=Lax,
 * Secure over HTTPS. Company sign-in (Entra ID, P3-02) replaces the accounts, not the rest of the app.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Account } from '../config/accounts';
import type { Requestor } from '../gateway/ReservationGateway';
import type { StoredAccount } from '../store/AppStore';
import { getStore } from '../store';
import { hashPassword, verifyPassword } from './passwords';

export const SESSION_COOKIE = 'reph-session';
/** A sign-in lasts one working shift and a bit. */
export const SESSION_HOURS = 12;

/**
 * Kept on globalThis, so there is one per process: Next.js loads this file once for the API routes and once for the
 * pages, and the /admin layout must read the cookie the sign-in route signed.
 */
const proc = globalThis as typeof globalThis & { rephDevSessionSecret?: string };

/** SESSION_SECRET (32+ characters) signs the cookie. Required in production; dev and tests use a random one per process. */
export function sessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') return null;
  return (proc.rephDevSessionSecret ??= randomBytes(32).toString('base64url'));
}

const signature = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest();

/**
 * A token for the cookie: base64url({ login, exp }) + "." + signature. The expiry is wall-clock time (Date.now), not
 * the demo clock, because the browser's Max-Age is wall-clock too. null when SESSION_SECRET is missing in production.
 */
export function createSession(login: string): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const payload = Buffer.from(JSON.stringify({ login, exp: Date.now() + SESSION_HOURS * 3_600_000 })).toString('base64url');
  return `${payload}.${signature(payload, secret).toString('base64url')}`;
}

/** The login in a valid, unexpired token and when it was issued (wall-clock ms), else null. */
export function readSession(token: string | undefined): { login: string; issuedAt: number } | null {
  const secret = sessionSecret();
  const [payload, sig] = token?.split('.') ?? [];
  if (!secret || !payload || !sig) return null;
  const expected = signature(payload, secret);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { login, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { login?: unknown; exp?: unknown };
    return typeof login === 'string' && typeof exp === 'number' && exp > Date.now() ? { login, issuedAt: exp - SESSION_HOURS * 3_600_000 } : null;
  } catch {
    return null;
  }
}

/** The session token in the request's Cookie header. */
export function sessionToken(request: Request): string | undefined {
  for (const part of request.headers.get('cookie')?.split(';') ?? []) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return value.join('=');
  }
  return undefined;
}

/** The Set-Cookie value that stores a token, or clears the cookie when token is null (sign out). */
export function sessionCookie(token: string | null, request: Request): string {
  const https = new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const life = token ? `Max-Age=${SESSION_HOURS * 3600}` : 'Max-Age=0';
  return [`${SESSION_COOKIE}=${token ?? ''}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', life, ...(https ? ['Secure'] : [])].join('; ');
}

/** The account as the requestor the app acts for (no password hash). */
export function accountPerson(a: Account): Requestor {
  return { login: a.login, name: a.name, email: a.email, ...(a.division ? { division: a.division } : {}) };
}

/**
 * The account behind a session or AI-app token issued at `issuedAt` (wall-clock ms), or undefined when it was removed,
 * is disabled, or was signed out everywhere (a reset) after the token was issued.
 */
export function accountByLogin(login: string, issuedAt: number): StoredAccount | undefined {
  const a = getStore().accounts.find(login);
  return a && a.login.toLowerCase() === login.toLowerCase() && !a.disabled && issuedAt > a.sessionsValidAfter ? a : undefined;
}

let dummyHash: Promise<string> | undefined;

/** Username (the e-mail, or the tool login, e.g. markjoseph.remetio; any case) and password → the account, or null. */
export async function authenticate(username: string, password: string): Promise<StoredAccount | null> {
  const account = getStore().accounts.find(username.trim());
  // An unknown username still costs one scrypt, so the answer time doesn't tell which usernames exist.
  const ok = await verifyPassword(password, account?.passwordHash ?? (await (dummyHash ??= hashPassword(randomBytes(16).toString('hex')))));
  return account && ok && !account.disabled ? account : null;
}
