/** GET /api/admin/rooms – every room with Admin's data notes (Admin). */
import { getGateway } from '../../../../gateway';
import { adminRoomView } from '../../../../services/views';
import { adminFailure, adminGuard } from '../_admin';
import { shared } from '../../_shared';

export const runtime = 'nodejs';

export const GET = shared(async function get(request: Request): Promise<Response> {
  const admin = await adminGuard(request);
  if (admin instanceof Response) return admin;
  try {
    return Response.json({ ok: true, rooms: (await getGateway().listRooms()).map(adminRoomView) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminFailure(error, 'Admin rooms');
  }
});
