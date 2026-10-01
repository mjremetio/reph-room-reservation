/**
 * POST /api/assistant – streams the room assistant's reply as Server-Sent Events (spec: docs/spec/04-api.md;
 * the events are in ../_agentStream.ts).
 */
import type { AgentInputItem } from '@openai/agents';
import { roomAssistant } from '../../../agent/agent';
import { OFF_TOPIC_REPLY } from '../../../agent/guardrails';
import { sameEmail } from '../../../domain/people';
import { formatRange } from '../../../domain/time';
import { getGateway } from '../../../gateway';
import { requireRequestor } from '../../../lib/requestor';
import { streamAgent } from '../_agentStream';
import { crossOrigin, fail, parseBody, rateLimited } from '../_http';
import { AssistantBody } from '../_schemas';
import { shared } from '../_shared';

export const runtime = 'nodejs';

const UNAVAILABLE = 'The assistant is not available right now. You can still browse and book from the map.';

export const POST = shared(async function post(request: Request): Promise<Response> {
  const blocked = crossOrigin(request);
  if (blocked) return blocked;
  const user = await requireRequestor(request);
  if (user instanceof Response) return user;
  const limited = rateLimited(user.email, 'assistant');
  if (limited) return limited;
  const parsed = await parseBody(request, AssistantBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (!process.env.OPENAI_API_KEY) return fail(503, 'UNAVAILABLE', UNAVAILABLE);

  // Notes about confirmed actions come from the gateway, not from client text, and only for the user's own bookings.
  const gw = getGateway();
  const notes: AgentInputItem[] = [];
  for (const ticketNo of body.confirmedTickets) {
    const b = await gw.getBooking(ticketNo);
    if (b && sameEmail(b.owner.email, user.email)) {
      notes.push({ role: 'system', content: `App note: ${b.ticketNo} is now ${b.status} (${b.agenda}, ${formatRange(b.start, b.end)}).` });
    }
  }
  return streamAgent({ route: 'assistant', request, agent: roomAssistant, user, message: body.message, history: body.history, notes, unavailable: UNAVAILABLE, offTopicReply: OFF_TOPIC_REPLY });
}, { lock: false });
