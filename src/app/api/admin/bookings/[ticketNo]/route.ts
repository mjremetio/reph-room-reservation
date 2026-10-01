/**
 * Admin acts on one booking (docs/spec/04-api.md, Admin; flows F30):
 *   POST  { action: approve | reject | cancel | checkin, comment? } – reject needs a reason
 *   PATCH { roomId?, start?, end?, participants?, agenda?, agendaType?, priority? } – checked by prepareAdminChange
 * Every change is audited and leaves an automatic note in the booking's thread for its owner.
 */
import { getGateway } from '../../../../../gateway';
import { audit } from '../../../../../lib/audit';
import { now } from '../../../../../lib/clock';
import { bookingLabel, describeChange, prepareAdminChange } from '../../../../../services/adminBookings';
import { adminNote } from '../../../../../services/messages';
import { adminBooking } from '../../../../../services/views';
import { getStore } from '../../../../../store';
import { parseBody, preparedFailure } from '../../../_http';
import { AdminActionBody, AdminChangeBody } from '../../../_schemas';
import { adminFailure, adminGuard } from '../../_admin';
import { shared } from '../../../_shared';

export const runtime = 'nodejs';

type Params = { params: Promise<{ ticketNo: string }> };
const withNote = (text: string, comment?: string) => (comment ? `${text} Note: ${comment}` : text);

export const POST = shared(async function post(request: Request, { params }: Params): Promise<Response> {
  const admin = await adminGuard(request, true);
  if (admin instanceof Response) return admin;
  const { ticketNo } = await params;
  const body = await parseBody(request, AdminActionBody);
  if (!body.ok) return body.response;
  const gw = getGateway();
  const t = now();
  try {
    const a = body.data;
    if (a.action === 'checkin') {
      const booking = await gw.checkIn(ticketNo, admin);
      audit(admin, 'booking.checkin', ticketNo, 'by Admin');
      adminNote(getStore(), booking, admin, 'Admin checked you in.', t);
      return Response.json({ ok: true, booking: adminBooking(booking, admin.email) });
    }
    if (a.action === 'cancel') {
      await gw.cancelBooking(ticketNo, admin, a.comment);
      const booking = await gw.getBooking(ticketNo);
      audit(admin, 'booking.cancel', ticketNo, withNote('by Admin.', a.comment));
      if (booking) adminNote(getStore(), booking, admin, withNote('Admin cancelled this booking.', a.comment), t);
      return Response.json({ ok: true, booking: booking && adminBooking(booking, admin.email) });
    }
    const booking = a.action === 'approve' ? await gw.approveBooking(ticketNo, admin, a.comment) : await gw.rejectBooking(ticketNo, admin, a.comment);
    audit(admin, a.action === 'approve' ? 'booking.approve' : 'booking.reject', ticketNo, a.comment);
    adminNote(getStore(), booking, admin, withNote(a.action === 'approve' ? 'Admin approved this booking.' : 'Admin turned down this request.', a.comment), t);
    return Response.json({ ok: true, booking: adminBooking(booking, admin.email) });
  } catch (error) {
    return adminFailure(error, `Admin ${body.data.action}`);
  }
});

export const PATCH = shared(async function patch(request: Request, { params }: Params): Promise<Response> {
  const admin = await adminGuard(request, true);
  if (admin instanceof Response) return admin;
  const { ticketNo } = await params;
  const body = await parseBody(request, AdminChangeBody);
  if (!body.ok) return body.response;
  const gw = getGateway();
  const t = now();
  try {
    const prepared = await prepareAdminChange(gw, ticketNo, body.data, t);
    if (!prepared.ok) return preparedFailure(prepared);
    const booking = await gw.updateBooking(ticketNo, body.data, admin);
    const change = describeChange(prepared.value.before, booking, prepared.value.rooms);
    audit(admin, 'booking.update', ticketNo, change);
    adminNote(getStore(), booking, admin, `Admin changed this booking: ${change}. Now: ${bookingLabel(booking, prepared.value.rooms)}.`, t);
    return Response.json({ ok: true, booking: adminBooking(booking, admin.email) });
  } catch (error) {
    return adminFailure(error, 'Admin change');
  }
});
