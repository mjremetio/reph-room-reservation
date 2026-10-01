/**
 * Streams an agent run as Server-Sent Events (docs/spec/04-api.md, POST /api/assistant), shared by the room
 * assistant and the Admin assistant:
 *   event: text   { delta }     words as they are generated
 *   event: ui     UiEvent       map highlights and cards (src/agent/context.ts)
 *   event: done   { history }   send `history` back with the next message
 *   event: error  { code, message }
 */
import { randomUUID } from 'node:crypto';
import { InputGuardrailTripwireTriggered, run, type Agent, type AgentInputItem } from '@openai/agents';
import type { AssistantContext, UiEvent } from '../../agent/context';
import { trimHistory } from '../../agent/history';
import { now } from '../../lib/clock';

/** A reply that takes longer than this ends with the error event, so the browser can offer Try again. */
const RUN_TIMEOUT_MS = 90_000;

export function streamAgent(opts: {
  route: string;
  request: Request;
  agent: Agent<AssistantContext>;
  user: AssistantContext['user'];
  message: string;
  history: Array<Record<string, unknown>>;
  /** Notes from the app (never from client text) placed before the user's message. */
  notes?: AgentInputItem[];
  people?: AssistantContext['people'];
  unavailable: string;
  offTopicReply: string;
}): Response {
  const { route, request, agent, user, message } = opts;
  const log = (fields: Record<string, unknown>) => console.log(JSON.stringify({ route, ...fields }));
  const requestId = randomUUID();
  const encoder = new TextEncoder();
  const started = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          open = false; // the browser went away
        }
      };
      const context: AssistantContext = { user, now: now(), defaultSite: 'Manila', emit: (e: UiEvent) => send('ui', e), ...(opts.people ? { people: opts.people } : {}) };
      const tools: string[] = [];
      try {
        const history = trimHistory(opts.history) as unknown as AgentInputItem[];
        const input: AgentInputItem[] = [...history, ...(opts.notes ?? []), { role: 'user', content: message }];
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(RUN_TIMEOUT_MS)]);
        const result = await run(agent, input, { stream: true, context, maxTurns: 10, signal });
        for await (const event of result) {
          if (event.type === 'raw_model_stream_event' && event.data.type === 'output_text_delta') {
            send('text', { delta: event.data.delta });
          } else if (event.type === 'run_item_stream_event' && event.name === 'tool_called') {
            const raw = event.item.rawItem as { name?: string };
            if (raw.name) tools.push(raw.name);
          }
        }
        await result.completed;
        send('done', { history: result.history });
        log({ requestId, user: user.email, tools, ms: Date.now() - started, status: 'ok' });
      } catch (error) {
        if (error instanceof InputGuardrailTripwireTriggered) {
          // Clearly off-topic: the model never ran. A fixed reply; the conversation history stays as it was.
          send('text', { delta: opts.offTopicReply });
          send('done', { history: opts.history });
          log({ requestId, user: user.email, tools, ms: Date.now() - started, status: 'off_topic' });
          return;
        }
        log({ requestId, user: user.email, tools, ms: Date.now() - started, status: 'error', error: error instanceof Error ? error.message : String(error) });
        send('error', { code: 'UNAVAILABLE', message: opts.unavailable });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Request-Id': requestId,
    },
  });
}
