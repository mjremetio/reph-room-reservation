/** POST /api/admin/users/{login}/signout – ends every session and AI-app connection of the account (Admin). */
import { accountView, signOutEverywhere } from '../../../../../../lib/accounts';
import { audit } from '../../../../../../lib/audit';
import { fail } from '../../../../_http';
import { adminGuard } from '../../../_admin';
import { shared } from '../../../../_shared';

export const runtime = 'nodejs';

export const POST = shared(async function post(request: Request, { params }: { params: Promise<{ login: string }> }): Promise<Response> {
  const admin = await adminGuard(request, true);
  if (admin instanceof Response) return admin;
  const { login } = await params;
  const result = signOutEverywhere(login);
  if (!result.ok) return fail(result.status, result.code, result.message);
  audit(admin, 'user.signout', result.value.login, 'signed out everywhere');
  return Response.json({ ok: true, user: accountView(result.value) });
});
