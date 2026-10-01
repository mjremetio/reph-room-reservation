/**
 * One booking's thread between its owner and Admin (docs/spec/04-api.md, Messages); nobody else may read or write it.
 *   GET  → { ok, thread } and marks it read
 *   POST { text } → { ok, message }
 * The audit log records that a message was sent, never its text.
 */
import { getGateway } from '../../../../gateway';
import { audit } from '../../../../lib/audit';
import { now } from '../../../../lib/clock';
import { signedInAccount } from '../../../../lib/requestor';
import { openThread, postMessage } from '../../../../services/messages';
import type { StoredAccount } from '../../../../store/AppStore';
import { getStore } from '../../../../store';
import { crossOrigin, fail, gatewayFailure, parseBody, preparedFailure, rateLimited } from '../../_http';
import { MessageBody } from '../../_schemas';
import { shared } from '../../_shared';

export const runtime = 'nodejs';

type Params = { params: Promise<{ ticketNo: string }> };
const readerOf = (a: StoredAccount) => ({ login: a.login, name: a.name, email: a.email, admin: a.role === 'admin' });

export const GET = shared(async function get(request: Request, { params }: Params): Promise<Response> {
  const account = signedInAccount(request);
  if (!account) return fail(401, 'UNAUTHORIZED', 'Sign in to continue.');
  const limited = rateLimited(account.email, 'default');
  if (limited) return limited;
  const { ticketNo } = await params;
  try {
    const result = await openThread(getGateway(), getStore(), readerOf(account), ticketNo, now());
    return result.ok ? Response.json({ ok: true, thread: result.value }, { headers: { 'Cache-Control': 'no-store' } }) : preparedFailure(result);
  } catch (error) {
    return gatewayFailure(error, 'Thread');
  }
});

export const POST = shared(async function post(request: Request, { params }: Params): Promise<Response> {
  const blocked = crossOrigin(request);
  if (blocked) return blocked;
  const account = signedInAccount(request);
  if (!account) return fail(401, 'UNAUTHORIZED', 'Sign in to continue.');
  const limited = rateLimited(account.email, 'default');
  if (limited) return limited;
  const { ticketNo } = await params;
  const body = await parseBody(request, MessageBody);
  if (!body.ok) return body.response;
  try {
    const result = await postMessage(getGateway(), getStore(), readerOf(account), ticketNo, body.data.text, now());
    if (!result.ok) return preparedFailure(result);
    audit(account, 'message.send', ticketNo);
    return Response.json({ ok: true, message: result.value });
  } catch (error) {
    return gatewayFailure(error, 'Send message');
  }
});
