/**
 * GET /api/bookings – the Room Reservation Tool's reservation list with its search panel
 * (Guidelines step 2: reservation date, type of agenda, site, building, room, employee name) plus status.
 * Every status, including Cancelled and Completed, like the tool. Privacy-filtered: the Type of Agenda
 * filter matches your own bookings by type and other people's by whether their room takes that type, so it
 * never reveals their category (docs/spec/04-api.md).
 */
import { sameEmail } from '../../../domain/people';
import { getGateway } from '../../../gateway';
import { requireRequestor } from '../../../lib/requestor';
import { publicBooking } from '../../../services/views';
import { gatewayFailure, parseQuery, rateLimited } from '../_http';
import { BookingsQuery } from '../_schemas';
import { shared } from '../_shared';

export const runtime = 'nodejs';

export const GET = shared(async function get(request: Request): Promise<Response> {
  const user = await requireRequestor(request);
  if (user instanceof Response) return user;
  const limited = rateLimited(user.email, 'default');
  if (limited) return limited;
  const q = parseQuery(request, BookingsQuery);
  if (!q.ok) return q.response;
  const { from, to, site, building, roomId, agendaType, employee, status } = q.data;
  try {
    const gw = getGateway();
    const rooms = (await gw.listRooms(site)).filter((r) => (!building || r.building === building) && (!roomId || r.id === roomId));
    const byId = new Map(rooms.map((r) => [r.id, r] as const));
    const name = employee?.toLowerCase();
    const bookings = (await gw.getBookings({ roomIds: [...byId.keys()], from, to }))
      .filter((b) => !status || b.status === status)
      .filter((b) => !name || b.owner.name.toLowerCase().includes(name))
      .filter((b) => {
        if (!agendaType) return true;
        if (sameEmail(b.owner.email, user.email)) return b.agendaType === agendaType;
        const room = byId.get(b.roomId);
        return !!room && room.agendas.includes(agendaType);
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    return Response.json({ ok: true, bookings: bookings.map((b) => publicBooking(b, user.email)) });
  } catch (error) {
    return gatewayFailure(error, 'Bookings');
  }
});
