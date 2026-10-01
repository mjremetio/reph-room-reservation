/**
 * Managing sign-in accounts (Admin, /admin/users; docs/spec/02-flows.md F31): add people, change their role or
 * details, disable them, reset them, and let anyone change their own password. Only scrypt hashes are stored;
 * a temporary password is returned once, to the Admin who asked, and never logged.
 */
import { randomInt } from 'node:crypto';
import type { Role } from '../domain/types';
import type { Requestor } from '../gateway/ReservationGateway';
import type { AccountPatch, StoredAccount } from '../store/AppStore';
import { getStore } from '../store';
import { now } from './clock';
import { hashPassword, verifyPassword } from './passwords';

/** New passwords (self-chosen) need at least this many characters, like `npm run hash-password`. */
export const MIN_PASSWORD_LENGTH = 12;

export type AccountResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 403 | 404 | 409; code: 'INVALID' | 'NOT_ALLOWED' | 'NOT_FOUND' | 'CONFLICT'; message: string };

const no = (status: 400 | 403 | 404 | 409, message: string): AccountResult<never> => ({
  ok: false,
  status,
  code: status === 400 ? 'INVALID' : status === 403 ? 'NOT_ALLOWED' : status === 404 ? 'NOT_FOUND' : 'CONFLICT',
  message,
});

/** No 0/O or 1/l/I, so a temporary password can be read out or typed without mistakes. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function temporaryPassword(length = 16): string {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

/** The tool login for an e-mail: the part before "@", upper case (MARKJOSEPH.REMETIO). */
export const loginFor = (email: string) => (email.split('@')[0] ?? '').toUpperCase();

/** The account as Admin sees it: no password hash. */
export function accountView(a: StoredAccount) {
  return {
    login: a.login,
    name: a.name,
    email: a.email,
    division: a.division ?? null,
    role: a.role,
    disabled: a.disabled,
    mustChangePassword: a.mustChangePassword,
    createdAt: a.createdAt.toISOString(),
    lastSignInAt: a.lastSignInAt?.toISOString() ?? null,
  };
}
export type AccountView = ReturnType<typeof accountView>;

/** Admin adds someone. They sign in with the temporary password and must choose their own. */
export async function createAccount(input: { name: string; email: string; division?: string; role: Role }): Promise<AccountResult<{ account: StoredAccount; password: string }>> {
  const store = getStore();
  const login = loginFor(input.email);
  if (!login) return no(400, 'Enter an e-mail address.');
  if (store.accounts.find(login) || store.accounts.find(input.email)) return no(409, `There is already an account for ${input.email}.`);
  const password = temporaryPassword();
  store.accounts.create(
    { login, name: input.name, email: input.email, ...(input.division ? { division: input.division } : {}), role: input.role, passwordHash: await hashPassword(password) },
    now(),
  );
  return { ok: true, value: { account: store.accounts.update(login, { mustChangePassword: true }), password } };
}

/**
 * Admin changes someone's name, division, role or whether they can sign in. An Admin can't demote or disable
 * themselves, so whoever acts stays an active Admin and there is always at least one.
 */
export function updateAccount(login: string, patch: { name?: string; division?: string | null; role?: Role; disabled?: boolean }, by: Requestor): AccountResult<StoredAccount> {
  const store = getStore();
  const a = store.accounts.find(login);
  if (!a || a.login.toLowerCase() !== login.toLowerCase()) return no(404, `No account ${login}.`);
  const self = a.login === by.login;
  if (self && patch.role === 'user') return no(403, "You can't remove your own Admin role.");
  if (self && patch.disabled) return no(403, "You can't disable your own account.");
  const changes: AccountPatch = {};
  if (patch.name !== undefined) changes.name = patch.name;
  if (patch.division !== undefined) changes.division = patch.division ?? undefined;
  if (patch.role !== undefined) changes.role = patch.role;
  if (patch.disabled !== undefined) changes.disabled = patch.disabled;
  return { ok: true, value: store.accounts.update(a.login, changes) };
}

/** Ends every session and AI-app connection of the account (wall-clock ms, like the cookie). */
export function signOutEverywhere(login: string): AccountResult<StoredAccount> {
  const a = getStore().accounts.find(login);
  if (!a) return no(404, `No account ${login}.`);
  return { ok: true, value: getStore().accounts.update(a.login, { sessionsValidAfter: Date.now() }) };
}

/**
 * Admin resets an account: a new temporary password (returned once), signed out everywhere, and a new password
 * to choose at the next sign-in. A disabled account stays disabled.
 */
export async function resetAccount(login: string): Promise<AccountResult<{ account: StoredAccount; password: string }>> {
  const a = getStore().accounts.find(login);
  if (!a) return no(404, `No account ${login}.`);
  const password = temporaryPassword();
  const account = getStore().accounts.update(a.login, { passwordHash: await hashPassword(password), mustChangePassword: true, sessionsValidAfter: Date.now() });
  return { ok: true, value: { account, password } };
}

/** Anyone changes their own password (and so leaves the "must change" state after a reset). */
export async function changePassword(login: string, current: string, next: string): Promise<AccountResult<StoredAccount>> {
  const a = getStore().accounts.find(login);
  if (!a) return no(404, `No account ${login}.`);
  if (!(await verifyPassword(current, a.passwordHash))) return no(403, 'Your current password is not right.');
  if (next.length < MIN_PASSWORD_LENGTH) return no(400, `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (next === current) return no(400, 'Choose a password different from the current one.');
  return { ok: true, value: getStore().accounts.update(a.login, { passwordHash: await hashPassword(next), mustChangePassword: false }) };
}
