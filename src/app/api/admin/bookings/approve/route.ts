/**
 * POST /api/admin/bookings/approve { ticketNos, comment? } – approve several requests at once (Admin). Each is tried on
 * its own: the answer lists the ones approved and, for the rest, why not (e.g. no longer In Progress).
 */
import { getGateway } from '../../../../../gateway';
import { audit } from '../../../../../lib/audit';
import { now } from '../../../../../lib/clock';
import { adminNote } from '../../../../../services/messages';
import { getStore } from '../../../../../store';
import { parseBody } from '../../../_http';
import { BulkApproveBody } from '../../../_schemas';
import { adminGuard } from '../../_admin';
import { shared } from '../../../_shared';

export const runtime = 'nodejs';

export const POST = shared(async function post(request: Request): Promise<Response> {
  const admin = await adminGuard(request, true);
  if (admin instanceof Response) return admin;
  const body = await parseBody(request, BulkApproveBody);
  if (!body.ok) return body.response;
  const gw = getGateway();
  const t = now();
  const approved: string[] = [];
  const failed: Array<{ ticketNo: string; message: string }> = [];
  for (const ticketNo of new Set(body.data.ticketNos)) {
    try {
      const booking = await gw.approveBooking(ticketNo, admin, body.data.comment);
      approved.push(ticketNo);
      audit(admin, 'booking.approve', ticketNo, body.data.comment);
      adminNote(getStore(), booking, admin, body.data.comment ? `Admin approved this booking. Note: ${body.data.comment}` : 'Admin approved this booking.', t);
    } catch (error) {
      failed.push({ ticketNo, message: error instanceof Error ? error.message : 'That did not go through.' });
    }
  }
  return Response.json({ ok: true, approved, failed });
});
