/**
 * POST /api/search – the same search the agent uses, for the map's search bar, New booking and when OpenAI
 * is down (docs/spec/04-api.md). Rule problems → 400 INVALID with `problems`.
 */
import { getGateway } from '../../../gateway';
import { now } from '../../../lib/clock';
import { requireRequestor } from '../../../lib/requestor';
import { searchRooms } from '../../../services/searchRooms';
import { searchResultViews } from '../../../services/views';
import { gatewayFailure, crossOrigin, fail, parseBody, rateLimited } from '../_http';
import { SearchBody } from '../_schemas';
import { shared } from '../_shared';

export const runtime = 'nodejs';

export const POST = shared(async function post(request: Request): Promise<Response> {
  const blocked = crossOrigin(request);
  if (blocked) return blocked;
  const user = await requireRequestor(request);
  if (user instanceof Response) return user;
  const limited = rateLimited(user.email, 'default');
  if (limited) return limited;
  const body = await parseBody(request, SearchBody);
  if (!body.ok) return body.response;
  try {
    const r = await searchRooms(getGateway(), body.data, now(), user.email);
    if (!r.ok) return fail(400, 'INVALID', r.problems[0] ?? 'The request breaks a booking rule.', { problems: r.problems });
    // Same payload as the assistant's room_results event, so the UI has one result format.
    const { agendaType, participants } = body.data;
    return Response.json({ ok: true, flow: r.flow, agendaType, participants, warnings: r.warnings, ...searchResultViews(r, user.email) });
  } catch (error) {
    return gatewayFailure(error, 'Search');
  }
}, { lock: false });
