/**
 * POST /api/admin/assistant { message, history } – the Admin assistant's reply as Server-Sent Events (Admin only; the
 * events are in ../../_agentStream.ts). Its cards change nothing: the Admin's button calls the other /api/admin routes.
 */
import type { AgentInputItem } from '@openai/agents';
import { adminAssistant } from '../../../../agent/adminAgent';
import { ADMIN_OFF_TOPIC_REPLY } from '../../../../agent/guardrails';
import { getGateway } from '../../../../gateway';
import { bookingLabel } from '../../../../services/adminBookings';
import { streamAgent } from '../../_agentStream';
import { fail, parseBody, rateLimited } from '../../_http';
import { AssistantBody } from '../../_schemas';
import { accountPeople, adminGuard } from '../_admin';
import { shared } from '../../_shared';

export const runtime = 'nodejs';

const UNAVAILABLE = 'The assistant is not available right now. You can still do everything from the Admin pages.';

export const POST = shared(async function post(request: Request): Promise<Response> {
  const admin = await adminGuard(request, true);
  if (admin instanceof Response) return admin;
  const limited = rateLimited(admin.email, 'assistant');
  if (limited) return limited;
  const parsed = await parseBody(request, AssistantBody);
  if (!parsed.ok) return parsed.response;
  if (!process.env.OPENAI_API_KEY) return fail(503, 'UNAVAILABLE', UNAVAILABLE);
  // What the Admin just did with a card's button, from the gateway (never from client text).
  const gw = getGateway();
  const rooms = await gw.listRooms();
  const notes: AgentInputItem[] = [];
  for (const ticketNo of parsed.data.confirmedTickets) {
    const b = await gw.getBooking(ticketNo);
    if (b) notes.push({ role: 'system', content: `App note: the Admin pressed a card's button; ${b.ticketNo} is now ${b.status} (${b.status === 'Blocked' ? `room block: ${b.agenda}` : b.owner.name}, ${bookingLabel(b, rooms)}).` });
  }
  // The run's user has no role: the tools only prepare cards, so nothing here acts as Admin.
  const { role: _role, ...user } = admin;
  return streamAgent({ route: 'admin-assistant', request, agent: adminAssistant, user, message: parsed.data.message, history: parsed.data.history, notes, people: accountPeople(), unavailable: UNAVAILABLE, offTopicReply: ADMIN_OFF_TOPIC_REPLY });
}, { lock: false });
