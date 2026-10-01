/**
 * POST /api/admin/blocks { roomIds, start, end, reason, cancel?, dryRun? } – Admin blocks rooms for a time
 * (maintenance, an event): nobody else can book them then (status "Blocked"). `dryRun` lists the bookings in the way;
 * those in `cancel` (Admin saw them) are cancelled and each owner gets a note, any other stops the block (409 names it).
 * Admin lifts a block by cancelling it (POST /api/admin/bookings/{ticketNo} { action: "cancel" }).
 */
import { sameEmail } from '../../../../domain/people';
import { getGateway } from '../../../../gateway';
import { audit } from '../../../../lib/audit';
import { now } from '../../../../lib/clock';
import { prepareRoomBlock } from '../../../../services/adminBlocks';
import { bookingLabel } from '../../../../services/adminBookings';
import { adminNote } from '../../../../services/messages';
import { adminBooking } from '../../../../services/views';
import { getStore } from '../../../../store';
import { parseBody, preparedFailure } from '../../_http';
import { BlockBody } from '../../_schemas';
import { shared } from '../../_shared';
import { adminFailure, adminGuard } from '../_admin';

export const runtime = 'nodejs';

export const POST = shared(async function post(request: Request): Promise<Response> {
  const admin = await adminGuard(request, true);
  if (admin instanceof Response) return admin;
  const body = await parseBody(request, BlockBody);
  if (!body.ok) return body.response;
  const gw = getGateway();
  const t = now();
  try {
    const prepared = await prepareRoomBlock(gw, body.data, t);
    if (!prepared.ok) return preparedFailure(prepared);
    const { rooms, start, end, reason, affected } = prepared.value;
    if (body.data.dryRun) return Response.json({ ok: true, affected: affected.map((b) => adminBooking(b, admin.email)) });
    const { blocks, cancelled } = await gw.blockRooms({ roomIds: rooms.map((r) => r.id), start, end, reason }, admin, body.data.cancel);
    const all = await gw.listRooms();
    for (const b of blocks) audit(admin, 'booking.block', b.ticketNo, `${bookingLabel(b, all)} · ${reason}`);
    for (const b of cancelled) {
      audit(admin, 'booking.cancel', b.ticketNo, `For a room block: ${reason}`);
      if (!sameEmail(b.owner.email, admin.email)) {
        adminNote(getStore(), b, admin, `Admin blocked ${bookingLabel(b, all)} (${reason}), so this booking is cancelled. Please book another room or time.`, t);
      }
    }
    return Response.json({ ok: true, blocks: blocks.map((b) => adminBooking(b, admin.email)), cancelled: cancelled.map((b) => adminBooking(b, admin.email)) });
  } catch (error) {
    return adminFailure(error, 'Admin block');
  }
});
