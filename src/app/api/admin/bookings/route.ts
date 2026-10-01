/** GET /api/admin/bookings?from&to[&status] – every booking in the range with all fields and the owner's e-mail (Admin). */
import { getGateway } from '../../../../gateway';
import { adminBooking } from '../../../../services/views';
import { parseQuery } from '../../_http';
import { AdminBookingsQuery } from '../../_schemas';
import { adminFailure, adminGuard } from '../_admin';
import { shared } from '../../_shared';

export const runtime = 'nodejs';

export const GET = shared(async function get(request: Request): Promise<Response> {
  const admin = await adminGuard(request);
  if (admin instanceof Response) return admin;
  const q = parseQuery(request, AdminBookingsQuery);
  if (!q.ok) return q.response;
  try {
    const list = (await getGateway().getBookings({ from: q.data.from, to: q.data.to }))
      .filter((b) => !q.data.status || b.status === q.data.status)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    return Response.json({ ok: true, bookings: list.map((b) => adminBooking(b, admin.email)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminFailure(error, 'Admin bookings');
  }
});
