/** POST /api/bookings/{ticketNo}/check-in – 403 with the exact window when it is not open (docs/spec/04-api.md). */
import { getGateway } from '../../../../../gateway';
import { audit } from '../../../../../lib/audit';
import { requireRequestor } from '../../../../../lib/requestor';
import { publicBooking } from '../../../../../services/views';
import { crossOrigin, gatewayFailure, rateLimited } from '../../../_http';
import { shared } from '../../../_shared';

export const runtime = 'nodejs';

export const POST = shared(async function post(request: Request, { params }: { params: Promise<{ ticketNo: string }> }): Promise<Response> {
  const blocked = crossOrigin(request);
  if (blocked) return blocked;
  const { ticketNo } = await params;
  const user = await requireRequestor(request);
  if (user instanceof Response) return user;
  const limited = rateLimited(user.email, 'default');
  if (limited) return limited;
  try {
    const booking = await getGateway().checkIn(ticketNo, user);
    audit(user, 'booking.checkin', ticketNo);
    return Response.json({ ok: true, booking: publicBooking(booking, user.email) });
  } catch (error) {
    return gatewayFailure(error, 'Check-in');
  }
});
