/**
 * GET /api/messages – the signed-in person's threads with Admin (every thread for an Admin), newest first, with the
 * unread total for the top bar (docs/spec/04-api.md, Messages).
 */
import { getGateway } from '../../../gateway';
import { signedInAccount } from '../../../lib/requestor';
import { listThreads } from '../../../services/messages';
import { getStore } from '../../../store';
import { fail, gatewayFailure, rateLimited } from '../_http';
import { shared } from '../_shared';

export const runtime = 'nodejs';

export const GET = shared(async function get(request: Request): Promise<Response> {
  const account = signedInAccount(request);
  if (!account) return fail(401, 'UNAUTHORIZED', 'Sign in to continue.');
  const limited = rateLimited(account.email, 'default');
  if (limited) return limited;
  try {
    const reader = { login: account.login, name: account.name, email: account.email, admin: account.role === 'admin' };
    return Response.json({ ok: true, ...(await listThreads(getGateway(), getStore(), reader)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return gatewayFailure(error, 'Messages');
  }
});
