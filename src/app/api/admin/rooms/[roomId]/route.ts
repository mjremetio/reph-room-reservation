/** PATCH /api/admin/rooms/{roomId} { name?, capacity?, av?, selfBookable?, notes? } – Admin changes a room's details. */
import { getGateway } from '../../../../../gateway';
import { audit } from '../../../../../lib/audit';
import { adminRoomView } from '../../../../../services/views';
import { parseBody } from '../../../_http';
import { RoomPatchBody } from '../../../_schemas';
import { adminFailure, adminGuard } from '../../_admin';
import { shared } from '../../../_shared';

export const runtime = 'nodejs';

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '–' : String(v));

export const PATCH = shared(async function patch(request: Request, { params }: { params: Promise<{ roomId: string }> }): Promise<Response> {
  const admin = await adminGuard(request, true);
  if (admin instanceof Response) return admin;
  const { roomId } = await params;
  const body = await parseBody(request, RoomPatchBody);
  if (!body.ok) return body.response;
  const gw = getGateway();
  try {
    const before = (await gw.listRooms()).find((r) => r.id === roomId);
    const room = await gw.updateRoom(roomId, body.data, admin);
    const keys = ['name', 'capacity', 'av', 'selfBookable', 'notes'] as const;
    const changes = keys.filter((k) => body.data[k] !== undefined && show(before?.[k]) !== show(room[k])).map((k) => `${k} ${show(before?.[k])} → ${show(room[k])}`);
    audit(admin, 'room.update', roomId, changes.join('; ') || 'no change');
    return Response.json({ ok: true, room: adminRoomView(room) });
  } catch (error) {
    return adminFailure(error, 'Admin room');
  }
});
