/**
 * The demo sign-in (docs/spec/04-api.md, Session):
 *   GET    /api/session  → { ok, user: { login, name, division, role, mustChangePassword } | null }
 *   POST   /api/session  { username: the e-mail, password } → 200 { ok, user } + the session cookie; 401 wrong e-mail or password
 *   DELETE /api/session  → signs out (clears the cookie)
 */
import { audit } from '../../../lib/audit';
import { now } from '../../../lib/clock';
import { signedInAccount } from '../../../lib/requestor';
import { authenticate, createSession, sessionCookie, sessionSecret } from '../../../lib/session';
import type { StoredAccount } from '../../../store/AppStore';
import { getStore } from '../../../store';
import { clientAddress, crossOrigin, fail, parseBody, rateLimited } from '../_http';
import { SignInBody } from '../_schemas';
import { shared } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What the browser may know about the signed-in person: no e-mail. */
const who = (a: StoredAccount) => ({ login: a.login, name: a.name, division: a.division ?? null, role: a.role, mustChangePassword: a.mustChangePassword });
const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET = shared(async function get(request: Request): Promise<Response> {
  const account = signedInAccount(request);
  return Response.json({ ok: true, user: account ? who(account) : null }, { headers: NO_STORE });
});

export const POST = shared(async function post(request: Request): Promise<Response> {
  const blocked = crossOrigin(request);
  if (blocked) return blocked;
  const limited = rateLimited(clientAddress(request), 'signin');
  if (limited) return limited;
  const body = await parseBody(request, SignInBody);
  if (!body.ok) return body.response;
  if (!sessionSecret()) {
    console.error(JSON.stringify({ level: 'error', msg: 'SESSION_SECRET is missing: sign-in is off' }));
    return fail(503, 'UNAVAILABLE', "Sign-in isn't set up on this server yet.");
  }
  const account = await authenticate(body.data.username, body.data.password);
  if (!account) {
    audit({ login: body.data.username.slice(0, 80), name: '' }, 'session.signin_failed');
    return fail(401, 'UNAUTHORIZED', 'Wrong e-mail or password.');
  }
  const signedIn = getStore().accounts.update(account.login, { lastSignInAt: now() });
  audit(account, 'session.signin');
  return Response.json({ ok: true, user: who(signedIn) }, { headers: { ...NO_STORE, 'Set-Cookie': sessionCookie(createSession(account.login), request) } });
});

export const DELETE = shared(async function remove(request: Request): Promise<Response> {
  const blocked = crossOrigin(request);
  if (blocked) return blocked;
  const account = signedInAccount(request);
  if (account) audit(account, 'session.signout');
  return Response.json({ ok: true }, { headers: { ...NO_STORE, 'Set-Cookie': sessionCookie(null, request) } });
});
