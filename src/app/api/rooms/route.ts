/** GET /api/rooms?site=Manila&floor=2F – the room list for the map (docs/spec/04-api.md). */
import { getGateway } from '../../../gateway';
import { roomView } from '../../../services/views';
import { requireRequestor } from '../../../lib/requestor';
import { gatewayFailure, parseQuery, rateLimited } from '../_http';
import { RoomsQuery } from '../_schemas';
import { shared } from '../_shared';

export const runtime = 'nodejs';

export const GET = shared(async function get(request: Request): Promise<Response> {
  const user = await requireRequestor(request);
  if (user instanceof Response) return user;
  const limited = rateLimited(user.email, 'default');
  if (limited) return limited;
  const q = parseQuery(request, RoomsQuery);
  if (!q.ok) return q.response;
  try {
    const rooms = (await getGateway().listRooms(q.data.site)).filter((r) => !q.data.floor || r.floor === q.data.floor);
    return Response.json({ ok: true, rooms: rooms.map(roomView) }, { headers: { 'Cache-Control': 'private, no-cache' } });
  } catch (error) {
    return gatewayFailure(error, 'List rooms');
  }
});
