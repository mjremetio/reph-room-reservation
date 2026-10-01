/**
 * POST /api/proposals – prepares a booking from the map's "Book this room" (or a cancellation from
 * My bookings) without the assistant (docs/spec/04-api.md). Same rules as the agent tools; nothing is
 * booked or cancelled until the user confirms with POST /api/proposals/{id}.
 */
import type { Recurrence } from '../../../domain/recurrence';
import { getGateway } from '../../../gateway';
import { now } from '../../../lib/clock';
import { requireRequestor } from '../../../lib/requestor';
import { prepareBooking, prepareCancellation } from '../../../services/prepareBooking';
import { crossOrigin, gatewayFailure, parseBody, preparedFailure, rateLimited } from '../_http';
import { ProposalBody } from '../_schemas';
import { shared } from '../_shared';

export const runtime = 'nodejs';

export const POST = shared(async function post(request: Request): Promise<Response> {
  const blocked = crossOrigin(request);
  if (blocked) return blocked;
  const user = await requireRequestor(request);
  if (user instanceof Response) return user;
  const limited = rateLimited(user.email, 'default');
  if (limited) return limited;
  const body = await parseBody(request, ProposalBody);
  if (!body.ok) return body.response;
  const gw = getGateway();
  try {
    if (body.data.action === 'cancel') {
      const prepared = await prepareCancellation(gw, user, body.data.ticketNo, now());
      return prepared.ok ? Response.json({ ok: true, cancel: prepared.value }) : preparedFailure(prepared);
    }
    const { action: _action, recurrence, ...fields } = body.data;
    const prepared = await prepareBooking(gw, user, { ...fields, recurrence: recurrence as Recurrence | undefined }, now());
    return prepared.ok ? Response.json({ ok: true, proposal: prepared.value.proposal }) : preparedFailure(prepared);
  } catch (error) {
    return gatewayFailure(error, 'Prepare proposal');
  }
}, { lock: false });
