/**
 * GET /api/availability?site&floor&from&to – busy times per room for the map and timeline (docs/spec/04-api.md).
 * Only blocking bookings; other people's bookings are privacy-filtered.
 */
import { isBlocking } from '../../../domain/availability';
import { getGateway } from '../../../gateway';
import { now } from '../../../lib/clock';
import { requireRequestor } from '../../../lib/requestor';
import { publicBooking } from '../../../services/views';
import { gatewayFailure, parseQuery, rateLimited } from '../_http';
import { AvailabilityQuery } from '../_schemas';
import { shared } from '../_shared';

export const runtime = 'nodejs';

export const GET = shared(async function get(request: Request): Promise<Response> {
  const user = await requireRequestor(request);
  if (user instanceof Response) return user;
  const limited = rateLimited(user.email, 'default');
  if (limited) return limited;
  const q = parseQuery(request, AvailabilityQuery);
  if (!q.ok) return q.response;
  const { site, floor, from, to } = q.data;
  try {
    const gw = getGateway();
    const rooms = (await gw.listRooms(site)).filter((r) => !floor || r.floor === floor);
    const bookings = await gw.getBookings({ roomIds: rooms.map((r) => r.id), from, to });
    const t = now();
    return Response.json({
      ok: true,
      rooms: rooms.map((r) => ({
        roomId: r.id,
        busy: bookings
          .filter((b) => b.roomId === r.id && isBlocking(b, t))
          .sort((a, b) => a.start.getTime() - b.start.getTime())
          .map((b) => publicBooking(b, user.email)),
      })),
    });
  } catch (error) {
    return gatewayFailure(error, 'Availability');
  }
});
