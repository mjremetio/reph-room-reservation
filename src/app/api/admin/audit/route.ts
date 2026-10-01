/** GET /api/admin/audit?from&to&actor&action – the audit log, newest first (Admin; docs/spec/09-quality.md, Audit). */
import { auditView } from '../../../../lib/audit';
import { getStore } from '../../../../store';
import { parseQuery } from '../../_http';
import { AuditQuery } from '../../_schemas';
import { adminGuard } from '../_admin';
import { shared } from '../../_shared';

export const runtime = 'nodejs';

export const GET = shared(async function get(request: Request): Promise<Response> {
  const admin = await adminGuard(request);
  if (admin instanceof Response) return admin;
  const q = parseQuery(request, AuditQuery);
  if (!q.ok) return q.response;
  const { from, to, actor, action } = q.data;
  const entries = getStore()
    .audit.list()
    .filter((e) => (!from || e.at >= from) && (!to || e.at < to) && (!actor || e.actor.toLowerCase() === actor.toLowerCase()) && (!action || e.action === action));
  return Response.json({ ok: true, entries: entries.map(auditView) }, { headers: { 'Cache-Control': 'no-store' } });
});
