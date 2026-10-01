/** PATCH /api/admin/users/{login} { name?, division?, role?, disabled? } – Admin changes an account (never their own role or access). */
import { accountView, updateAccount } from '../../../../../lib/accounts';
import { audit } from '../../../../../lib/audit';
import { getStore } from '../../../../../store';
import { fail, parseBody } from '../../../_http';
import { UserPatchBody } from '../../../_schemas';
import { adminGuard } from '../../_admin';
import { shared } from '../../../_shared';

export const runtime = 'nodejs';

export const PATCH = shared(async function patch(request: Request, { params }: { params: Promise<{ login: string }> }): Promise<Response> {
  const admin = await adminGuard(request, true);
  if (admin instanceof Response) return admin;
  const { login } = await params;
  const body = await parseBody(request, UserPatchBody);
  if (!body.ok) return body.response;
  const before = getStore().accounts.find(login);
  const result = updateAccount(login, body.data, admin);
  if (!result.ok) return fail(result.status, result.code, result.message);
  const after = result.value;
  const changes = [
    before?.name !== after.name && `name ${before?.name} → ${after.name}`,
    (before?.division ?? null) !== (after.division ?? null) && `division ${before?.division ?? '–'} → ${after.division ?? '–'}`,
    before?.role !== after.role && `role ${before?.role} → ${after.role}`,
    before?.disabled !== after.disabled && (after.disabled ? 'disabled' : 'enabled'),
  ].filter(Boolean);
  audit(admin, 'user.update', after.login, changes.join('; ') || 'no change');
  return Response.json({ ok: true, user: accountView(after) }, { headers: { 'Cache-Control': 'no-store' } });
});
