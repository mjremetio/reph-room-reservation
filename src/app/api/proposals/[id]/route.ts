/**
 * POST /api/proposals/{id} – the user pressed Confirm (or Cancel booking) on a card (spec: docs/spec/04-api.md).
 * This is the only place bookings are created or cancelled; the agent can only prepare proposals.
 * GET /api/proposals/{id} – the card behind a confirm link (an MCP client's propose_booking), for the same person only.
 */
import { peekProposal, takeProposal } from '../../../../agent/proposals';
import { expandRecurrence } from '../../../../domain/recurrence';
import { getGateway } from '../../../../gateway';
import { audit } from '../../../../lib/audit';
import { now } from '../../../../lib/clock';
import { requireRequestor } from '../../../../lib/requestor';
import { bookingLabel } from '../../../../services/adminBookings';
import { publicBooking } from '../../../../services/views';
import { crossOrigin, fail, gatewayFailure, rateLimited } from '../../_http';
import { shared } from '../../_shared';

export const runtime = 'nodejs';

export const GET = shared(async function get(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const user = await requireRequestor(request);
  if (user instanceof Response) return user;
  const limited = rateLimited(user.email, 'default');
  if (limited) return limited;
  const proposal = await peekProposal(id, user.email, now());
  if (!proposal?.view) return fail(410, 'EXPIRED', 'This confirm link has expired or was made for someone else. Ask the AI app to prepare it again.');
  return Response.json({ ok: true, ...proposal.view }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = shared(async function post(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const blocked = crossOrigin(request);
  if (blocked) return blocked;
  const { id } = await params;
  const user = await requireRequestor(request);
  if (user instanceof Response) return user;
  const limited = rateLimited(user.email, 'default');
  if (limited) return limited;
  // Single use: taking the proposal removes it, so a double click books once (AC-5.2).
  const proposal = await takeProposal(id, user.email, now());
  if (!proposal) return fail(410, 'EXPIRED', 'This card has expired. Ask the assistant to check again.');
  const gw = getGateway();
  try {
    if (proposal.kind === 'book' && proposal.booking) {
      const booking = await gw.createBooking(proposal.booking);
      const r = proposal.booking.recurrence;
      const dates = r ? expandRecurrence(proposal.booking, r).length : 1;
      // Readable for Admin's log and live notices: "Cape Town, 2F · Tue, Sep 29, 10:00 AM – 11:00 AM".
      audit(user, 'booking.create', booking.ticketNo, `${bookingLabel(booking, await gw.listRooms())}${dates > 1 ? ` · ${dates} dates` : ''}`);
      return Response.json({ ok: true, booking: publicBooking(booking, user.email), dates });
    }
    if (proposal.kind === 'cancel' && proposal.ticketNo) {
      await gw.cancelBooking(proposal.ticketNo, user);
      audit(user, 'booking.cancel', proposal.ticketNo);
      return Response.json({ ok: true, ticketNo: proposal.ticketNo });
    }
    return fail(400, 'INVALID', 'Unknown action.');
  } catch (error) {
    return gatewayFailure(error, 'Confirm proposal');
  }
});
