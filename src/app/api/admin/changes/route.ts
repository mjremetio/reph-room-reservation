/**
 * GET /api/admin/changes?after=<id> – what happened since the Admin pages last looked (docs/spec/04-api.md, Admin):
 * `last` (the newest audit id) and the audit entries after `after`, oldest first (at most 20). Admin pages ask every
 * 3 seconds and refresh when something changed, so a booking shows up in Admin at once. Without `after`: no entries.
 */
import { auditView } from '../../../../lib/audit';
import { getStore } from '../../../../store';
import { parseQuery } from '../../_http';
import { ChangesQuery } from '../../_schemas';
import { adminGuard } from '../_admin';
import { shared } from '../../_shared';

export const runtime = 'nodejs';

export const GET = shared(async function get(request: Request): Promise<Response> {
  const admin = await adminGuard(request, false, 'live');
  if (admin instanceof Response) return admin;
  const q = parseQuery(request, ChangesQuery);
  if (!q.ok) return q.response;
  const entries = getStore().audit.list(); // newest first
  const after = q.data.after;
  const newer = after === undefined ? [] : entries.filter((e) => e.id > after).reverse(); // oldest first
  const fresh = newer.slice(0, 20);
  // More than 20 new: `last` is the last one sent, so the next look gets the rest.
  const last = newer.length > fresh.length ? (fresh.at(-1)?.id ?? 0) : (entries[0]?.id ?? 0);
  return Response.json({ ok: true, last, entries: fresh.map(auditView) }, { headers: { 'Cache-Control': 'no-store' } });
});
