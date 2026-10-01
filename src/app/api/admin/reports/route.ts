/** GET /api/admin/reports?from&to – usage figures over the range, up to 92 days (Admin; src/domain/reports.ts). */
import { buildReport } from '../../../../domain/reports';
import { getGateway } from '../../../../gateway';
import { now } from '../../../../lib/clock';
import { parseQuery } from '../../_http';
import { ReportQuery } from '../../_schemas';
import { adminFailure, adminGuard } from '../_admin';
import { shared } from '../../_shared';

export const runtime = 'nodejs';

export const GET = shared(async function get(request: Request): Promise<Response> {
  const admin = await adminGuard(request);
  if (admin instanceof Response) return admin;
  const q = parseQuery(request, ReportQuery);
  if (!q.ok) return q.response;
  try {
    const gw = getGateway();
    const [rooms, bookings] = await Promise.all([gw.listRooms(), gw.getBookings({ from: q.data.from, to: q.data.to })]);
    const report = buildReport({ bookings, rooms, from: q.data.from, to: q.data.to, now: now() });
    return Response.json({ ok: true, report: { ...report, from: report.from.toISOString(), to: report.to.toISOString() } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminFailure(error, 'Admin reports');
  }
});
