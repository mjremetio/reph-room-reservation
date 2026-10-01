/**
 * POST /api/session/password { current, next } – the signed-in person changes their own password (docs/spec/04-api.md,
 * Session). Required after an Admin reset (`mustChangePassword`); the session stays signed in.
 */
import { changePassword } from '../../../../lib/accounts';
import { audit } from '../../../../lib/audit';
import { signedInAccount } from '../../../../lib/requestor';
import { crossOrigin, fail, parseBody, rateLimited } from '../../_http';
import { PasswordBody } from '../../_schemas';
import { shared } from '../../_shared';

export const runtime = 'nodejs';

export const POST = shared(async function post(request: Request): Promise<Response> {
  const blocked = crossOrigin(request);
  if (blocked) return blocked;
  const account = signedInAccount(request);
  if (!account) return fail(401, 'UNAUTHORIZED', 'Sign in to continue.');
  const limited = rateLimited(account.email, 'signin');
  if (limited) return limited;
  const body = await parseBody(request, PasswordBody);
  if (!body.ok) return body.response;
  const result = await changePassword(account.login, body.data.current, body.data.next);
  if (!result.ok) return fail(result.status, result.code, result.message);
  audit(account, 'session.password');
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
});
