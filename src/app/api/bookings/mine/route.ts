/**
 * GET /api/bookings/mine?from&to – the user's own bookings with their check-in window (docs/spec/04-api.md).
 * Without `to`, every upcoming one, however far ahead and whatever its status (requests waiting for Admin too).
 */
import { checkInWindow } from '../../../../domain/rules';
import { addMinutes } from '../../../../domain/time';
import { getGateway } from '../../../../gateway';
import { now } from '../../../../lib/clock';
import { requireRequestor } from '../../../../lib/requestor';
import { publicBooking } from '../../../../services/views';
import { gatewayFailure, parseQuery, rateLimited } from '../../_http';
import { MyBookingsQuery } from '../../_schemas';
import { shared } from '../../_shared';

export const runtime = 'nodejs';

export const GET = shared(async function get(request: Request): Promise<Response> {
  const user = await requireRequestor(request);
  if (user instanceof Response) return user;
  const limited = rateLimited(user.email, 'default');
  if (limited) return limited;
  const q = parseQuery(request, MyBookingsQuery);
  if (!q.ok) return q.response;
  const t = now();
  const from = q.data.from ?? addMinutes(t, -60);
  try {
    const list = await getGateway().listMyBookings(user.email, from, q.data.to);
    return Response.json({
      ok: true,
      bookings: list
        .filter((b) => b.status !== 'Cancelled') // AC-6.1
        .map((b) => {
          const w = checkInWindow(b);
          const canCheckIn = b.status === 'Approved' || b.status === 'In Progress';
          return {
            ...publicBooking(b, user.email),
            checkIn: { start: w.start.toISOString(), end: w.end.toISOString(), open: canCheckIn && t >= w.start && t < w.end },
          };
        }),
    });
  } catch (error) {
    return gatewayFailure(error, 'My bookings');
  }
});
