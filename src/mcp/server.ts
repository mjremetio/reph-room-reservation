/**
 * The MCP server (Model Context Protocol, Streamable HTTP, stateless; docs/spec/05-agent.md, MCP): JSON-RPC 2.0 over
 * POST /api/mcp for Claude, ChatGPT or any MCP client, acting for the person its access token belongs to.
 * The tools are the assistant's own (src/agent/tools.ts), run with the same code, rules and privacy filter; the cards
 * they would show become fields of the result. Bookings and cancellations are only prepared: the result carries a
 * confirm_url, and nothing happens until the person presses Confirm in REPH Rooms. Left out: draft_owner_message (its
 * link carries the owner's e-mail address, which the privacy rule keeps from the model).
 */
import { RunContext } from '@openai/agents';
import type { AssistantContext, UiEvent } from '../agent/context';
import { roomTools } from '../agent/tools';
import { RULES } from '../domain/rules';
import type { Requestor } from '../gateway/ReservationGateway';
import { now } from '../lib/clock';

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export const INSTRUCTIONS = [
  'REPH Room Assistant: meeting and training rooms at Reed Elsevier Philippines, Bldg. H, Manila (2F and 3F), for the signed-in person.',
  'Times are Asia/Manila (UTC+8); pass ISO 8601 with the +08:00 offset.',
  'Call find_rooms before saying a room is free, and room_schedule for who booked a room and when.',
  `propose_booking and request_cancellation only prepare: give the person the confirm_url; nothing is booked or cancelled until they press Confirm there (within ${RULES.linkProposalHoldMinutes} minutes).`,
  `Agenda titles must be specific ("Q4 pipeline review"), not just "Meeting" or "Training". One room per person at a time, except ${RULES.severalRoomsAtOnce.join(' and ')} bookings (several at once are fine).`,
  "Share only the owner's name, division, time, group size and status of other people's bookings.",
].join(' ');

const EXPOSED = roomTools.filter((t) => t.name !== 'draft_owner_message');

const TITLES: Record<string, string> = {
  find_rooms: 'Find rooms',
  room_schedule: 'Who has a room',
  list_rooms: 'Room directory',
  propose_booking: 'Prepare a booking',
  my_bookings: 'My bookings',
  check_in: 'Check in',
  request_cancellation: 'Prepare a cancellation',
  find_swap_options: 'Rooms to offer for a swap',
  get_handoff: 'Who handles it',
};
const READ_ONLY = new Set(['find_rooms', 'room_schedule', 'list_rooms', 'my_bookings', 'find_swap_options', 'get_handoff']);

/** Where the in-app descriptions talk about cards, MCP clients get links instead. */
const DESCRIPTIONS: Record<string, string> = {
  propose_booking: `Prepare a booking for the signed-in person. Returns confirm_url: they must open it and press Confirm in REPH Rooms within ${RULES.linkProposalHoldMinutes} minutes; nothing is booked before that. Needs a specific agenda title.`,
  request_cancellation: `Prepare the cancellation of one of the person's own bookings. Returns confirm_url: they must open it and press Cancel booking in REPH Rooms within ${RULES.linkProposalHoldMinutes} minutes.`,
  get_handoff:
    "For requests this assistant must not book or fix: BU visitor offices (Admin by email), extra equipment (ServiceNow), room setup such as chairs, sound or food (Non-Solus), and trouble with a room's video conference or screen (IT). Returns who handles it and the link.",
};

export const TOOL_LIST = EXPOSED.map((t) => ({
  name: t.name,
  title: TITLES[t.name] ?? t.name,
  description: DESCRIPTIONS[t.name] ?? t.description,
  inputSchema: t.parameters,
  annotations: { title: TITLES[t.name] ?? t.name, readOnlyHint: READ_ONLY.has(t.name), destructiveHint: false, idempotentHint: READ_ONLY.has(t.name), openWorldHint: false },
}));

type Schema = { type?: string | string[]; anyOf?: Schema[]; properties?: Record<string, Schema> };
const allowsNull = (s: Schema | undefined): boolean =>
  !!s && (s.type === 'null' || (Array.isArray(s.type) && s.type.includes('null')) || (s.anyOf ?? []).some(allowsNull));

/** The tools use strict schemas (every field present, optional ones null): fill in the optional fields a client left out. */
function withNulls(schema: Schema, args: Record<string, unknown>): Record<string, unknown> {
  const out = { ...args };
  for (const [key, prop] of Object.entries(schema.properties ?? {})) if (!(key in out) && allowsNull(prop)) out[key] = null;
  return out;
}

/** The tool's JSON for an MCP client: in-app notes dropped, prepared cards turned into confirm links and contacts. */
function forClient(raw: unknown, events: UiEvent[], origin: string): unknown {
  let out: unknown = raw;
  if (typeof raw === 'string') {
    try {
      out = JSON.parse(raw);
    } catch {
      return { ok: false, problem: raw };
    }
  }
  if (!out || typeof out !== 'object' || Array.isArray(out)) return out;
  const { shown_to_user: _shown, note: _note, ...rest } = out as Record<string, unknown>;
  const result: Record<string, unknown> = rest;
  const wait = `Not done yet: the person opens confirm_url and confirms in REPH Rooms within ${RULES.linkProposalHoldMinutes} minutes.`;
  for (const e of events) {
    if (e.type === 'proposal') Object.assign(result, { confirm_url: `${origin}/?confirm=${e.proposal.id}`, expires_at: e.proposal.expiresAt, note: wait });
    if (e.type === 'cancel_request') Object.assign(result, { confirm_url: `${origin}/?confirm=${e.proposalId}`, expires_at: e.expiresAt, note: wait });
    if (e.type === 'handoff') Object.assign(result, { contact: { label: e.label, link: e.link } });
  }
  return result;
}

async function callTool(name: string, args: Record<string, unknown>, user: Requestor, origin: string) {
  const tool = EXPOSED.find((t) => t.name === name);
  if (!tool) return null;
  const events: UiEvent[] = [];
  const context: AssistantContext = { user, now: now(), defaultSite: 'Manila', emit: (e) => events.push(e), proposalHoldMinutes: RULES.linkProposalHoldMinutes };
  try {
    const raw = await tool.invoke(new RunContext(context), JSON.stringify(withNulls(tool.parameters as Schema, args)));
    const out = forClient(raw, events, origin);
    const failed = !!out && typeof out === 'object' && (out as { ok?: unknown }).ok === false;
    return { content: [{ type: 'text', text: JSON.stringify(out) }], isError: failed };
  } catch (error) {
    return { content: [{ type: 'text', text: `That did not work: ${error instanceof Error ? error.message : 'unknown error'}. Check the arguments against the tool's schema.` }], isError: true };
  }
}

type Message = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
type Id = string | number | null;
const reply = (id: Id, result: unknown) => ({ jsonrpc: '2.0', id, result });
const failure = (id: Id, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

/** One JSON-RPC message; null for a notification (no reply). */
export async function handleMessage(msg: Message, user: Requestor, origin: string, log: (tool: string, ok: boolean) => void): Promise<object | null> {
  const notification = msg?.id === undefined;
  const id = (typeof msg?.id === 'string' || typeof msg?.id === 'number' ? msg.id : null) as Id;
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return notification ? null : failure(id, -32600, 'Invalid request.');
  if (notification) return null; // notifications/initialized, notifications/cancelled, …: nothing to answer
  const params = (msg.params && typeof msg.params === 'object' ? msg.params : {}) as Record<string, unknown>;
  switch (msg.method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      return reply(id, {
        protocolVersion: typeof asked === 'string' && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'reph-rooms', title: 'REPH Room Assistant', version: '0.10.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, { tools: TOOL_LIST });
    case 'tools/call': {
      const name = params.name;
      const args = params.arguments ?? {};
      if (typeof name !== 'string' || typeof args !== 'object' || Array.isArray(args)) return failure(id, -32602, 'tools/call needs a tool name and an arguments object.');
      const result = await callTool(name, args as Record<string, unknown>, user, origin);
      if (!result) return failure(id, -32602, `Unknown tool "${name}".`);
      log(name, !result.isError);
      return reply(id, result);
    }
    default:
      return failure(id, -32601, `Method "${msg.method}" is not supported.`);
  }
}
