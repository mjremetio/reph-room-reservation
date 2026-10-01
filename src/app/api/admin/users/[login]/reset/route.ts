/**
 * POST /api/admin/users/{login}/reset – reset an account (Admin): a new temporary password (returned once, never
 * logged), signed out everywhere (browser and AI apps), and a new password to choose at the next sign-in.
 */
import { accountView, resetAccount } from '../../../../../../lib/accounts';
import { audit } from '../../../../../../lib/audit';
import { fail } from '../../../../_http';
import { adminGuard } from '../../../_admin';
import { shared } from '../../../../_shared';

export const runtime = 'nodejs';

export const POST = shared(async function post(request: Request, { params }: { params: Promise<{ login: string }> }): Promise<Response> {
  const admin = await adminGuard(request, true);
  if (admin instanceof Response) return admin;
  const { login } = await params;
  const result = await resetAccount(login);
  if (!result.ok) return fail(result.status, result.code, result.message);
  audit(admin, 'user.reset', result.value.account.login, 'temporary password, signed out everywhere');
  return Response.json({ ok: true, user: accountView(result.value.account), password: result.value.password }, { headers: { 'Cache-Control': 'no-store' } });
});
