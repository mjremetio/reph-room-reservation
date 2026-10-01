/**
 * POST /api/admin/bookings/bulk { roomIds, agendaType, agenda, start, end, participants, recurrence?, ownerEmail?,
 * cancel?, dryRun? } – Admin books several rooms (each for every date of the repeat) in one go, Approved at once, for
 * themself or a person with an account (or in the employee list). `dryRun` counts them and lists the bookings in the way; those in
 * `cancel` (Admin saw them) are cancelled and each owner gets a note, any other stops it (409 names it).
 */
import type { Recurrence } from '../../../../../domain/recurrence';
import { sameEmail } from '../../../../../domain/people';
import { getGateway } from '../../../../../gateway';
import { audit } from '../../../../../lib/audit';
import { now } from '../../../../../lib/clock';
import { prepareBulkBooking } from '../../../../../services/adminBlocks';
import { bookingLabel } from '../../../../../services/adminBookings';
import { adminNote } from '../../../../../services/messages';
import { adminBooking } from '../../../../../services/views';
import { getStore } from '../../../../../store';
import { parseBody, preparedFailure } from '../../../_http';
import { BulkBookingBody } from '../../../_schemas';
import { shared } from '../../../_shared';
import { accountPeople, adminFailure, adminGuard } from '../../_admin';

export const runtime = 'nodejs';

export const POST = shared(async function post(request: Request): Promise<Response> {
  const admin = await adminGuard(request, true);
  if (admin instanceof Response) return admin;
  const body = await parseBody(request, BulkBookingBody);
  if (!body.ok) return body.response;
  const { cancel, dryRun, ownerEmail, ...fields } = body.data;
  const recurrence = fields.recurrence as Recurrence | undefined;
  const gw = getGateway();
  const t = now();
  try {
    const prepared = await prepareBulkBooking(gw, { ...fields, recurrence, ownerEmail }, admin, t, accountPeople());
    if (!prepared.ok) return preparedFailure(prepared);
    const { rooms, dates, owner, affected } = prepared.value;
    if (dryRun) return Response.json({ ok: true, count: rooms.length * dates.length, owner: owner.name, affected: affected.map((b) => adminBooking(b, admin.email)) });
    const { created, cancelled } = await gw.bulkBook({ ...fields, recurrence, roomIds: rooms.map((r) => r.id), requester: owner }, admin, cancel);
    const all = await gw.listRooms();
    const forSomeoneElse = !sameEmail(owner.email, admin.email);
    for (const b of created) {
      audit(admin, 'booking.create', b.ticketNo, `${bookingLabel(b, all)} · bulk booking by Admin${forSomeoneElse ? ` for ${owner.name}` : ''}`);
      if (forSomeoneElse) adminNote(getStore(), b, admin, `Admin booked this for you: ${bookingLabel(b, all)}.`, t);
    }
    for (const b of cancelled) {
      audit(admin, 'booking.cancel', b.ticketNo, `For an Admin bulk booking: ${fields.agenda}`);
      if (!sameEmail(b.owner.email, admin.email)) {
        adminNote(getStore(), b, admin, `Admin needs ${bookingLabel(b, all)} for "${fields.agenda}", so this booking is cancelled. Please book another room or time.`, t);
      }
    }
    return Response.json({ ok: true, created: created.map((b) => adminBooking(b, admin.email)), cancelled: cancelled.map((b) => adminBooking(b, admin.email)) });
  } catch (error) {
    return adminFailure(error, 'Admin bulk booking');
  }
});
