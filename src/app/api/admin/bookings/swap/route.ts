/** POST /api/admin/bookings/swap { a, b } – two bookings exchange rooms in one step (Admin); both owners get a note. */
import { getGateway } from '../../../../../gateway';
import { audit } from '../../../../../lib/audit';
import { now } from '../../../../../lib/clock';
import { bookingLabel, prepareAdminSwap } from '../../../../../services/adminBookings';
import { adminNote } from '../../../../../services/messages';
import { adminBooking } from '../../../../../services/views';
import { getStore } from '../../../../../store';
import { parseBody, preparedFailure } from '../../../_http';
import { SwapBody } from '../../../_schemas';
import { adminFailure, adminGuard } from '../../_admin';
import { shared } from '../../../_shared';

export const runtime = 'nodejs';

export const POST = shared(async function post(request: Request): Promise<Response> {
  const admin = await adminGuard(request, true);
  if (admin instanceof Response) return admin;
  const body = await parseBody(request, SwapBody);
  if (!body.ok) return body.response;
  const gw = getGateway();
  const t = now();
  try {
    const prepared = await prepareAdminSwap(gw, body.data.a, body.data.b, t);
    if (!prepared.ok) return preparedFailure(prepared);
    const [a, b] = await gw.swapRooms(body.data.a, body.data.b, admin);
    const { rooms } = prepared.value;
    audit(admin, 'booking.swap', `${a.ticketNo} ⇄ ${b.ticketNo}`, `${a.ticketNo} → ${bookingLabel(a, rooms)}; ${b.ticketNo} → ${bookingLabel(b, rooms)}`);
    for (const x of [a, b]) adminNote(getStore(), x, admin, `Admin moved this booking to another room: ${bookingLabel(x, rooms)}.`, t);
    return Response.json({ ok: true, bookings: [adminBooking(a, admin.email), adminBooking(b, admin.email)] });
  } catch (error) {
    return adminFailure(error, 'Admin swap');
  }
});
