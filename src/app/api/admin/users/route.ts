/**
 * Admin manages sign-in accounts (docs/spec/04-api.md, Admin; flows F31):
 *   GET  /api/admin/users → every account (no password hashes)
 *   POST /api/admin/users { name, email, division?, role } → the account and a temporary password, shown once
 */
import { accountView, createAccount } from '../../../../lib/accounts';
import { audit } from '../../../../lib/audit';
import { getStore } from '../../../../store';
import { fail, parseBody } from '../../_http';
import { NewUserBody } from '../../_schemas';
import { adminGuard } from '../_admin';
import { shared } from '../../_shared';

export const runtime = 'nodejs';
const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET = shared(async function get(request: Request): Promise<Response> {
  const admin = await adminGuard(request);
  if (admin instanceof Response) return admin;
  return Response.json({ ok: true, users: getStore().accounts.list().map(accountView) }, { headers: NO_STORE });
});

export const POST = shared(async function post(request: Request): Promise<Response> {
  const admin = await adminGuard(request, true);
  if (admin instanceof Response) return admin;
  const body = await parseBody(request, NewUserBody);
  if (!body.ok) return body.response;
  const result = await createAccount(body.data);
  if (!result.ok) return fail(result.status, result.code, result.message);
  const { account, password } = result.value;
  audit(admin, 'user.create', account.login, `${account.name}, ${account.role}`);
  return Response.json({ ok: true, user: accountView(account), password }, { headers: NO_STORE });
});
