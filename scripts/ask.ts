/**
 * Sends one message to the room assistant in-process (mock gateway, demo clock) and prints what happens:
 * tool calls, UI events and the streamed reply. Needs OPENAI_API_KEY in .env.local.
 *
 *   npm run ask -- "Room for 5 on Monday, 3 to 4 PM"
 */
import { existsSync } from 'node:fs';
import { InputGuardrailTripwireTriggered, run } from '@openai/agents';
import type { AssistantContext, UiEvent } from '../src/agent/context';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const message = process.argv.slice(2).join(' ').trim();
if (!message) {
  console.error('Usage: npm run ask -- "Room for 5 on Monday, 3 to 4 PM"');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is missing. Add it to .env.local.');
  process.exit(1);
}

async function main() {
  // Import after the env file is loaded: the agent reads OPENAI_MODEL and the clock reads DEMO_NOW.
  const { roomAssistant } = await import('../src/agent/agent');
  const { OFF_TOPIC_REPLY } = await import('../src/agent/guardrails');
  const { now } = await import('../src/lib/clock');
  const { formatManila } = await import('../src/domain/time');
  const { getGateway } = await import('../src/gateway');
  // The signed-in user: the first person in the directory (the demo user), or ASK_AS=<tool login> for someone else.
  const signedIn = async () => {
    const people = await getGateway().listPeople();
    const who = process.env.ASK_AS ? people.find((p) => p.login === process.env.ASK_AS?.toUpperCase()) : people[0];
    if (!who) throw new Error(`No one with the login "${process.env.ASK_AS}" in the directory.`);
    return who;
  };

  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

  function describe(e: UiEvent): string {
    switch (e.type) {
      case 'room_results':
        return `room_results flow=${e.flow} ` + e.results.map((r) => `${r.rank ? `#${r.rank} ` : ''}${r.name} (${r.availability})`).join(', ');
      case 'proposal':
        return `proposal ${e.proposal.roomName} ${e.proposal.start} → ${e.proposal.end} "${e.proposal.agenda}"`;
      case 'room_schedule':
        return `room_schedule ${e.rooms.map((r) => `${r.name}: ${r.bookings.map((b) => `${b.mine ? 'you' : b.owner} ${b.start}–${b.end}`).join(', ') || 'free'}`).join(' · ')}`;
      default:
        return JSON.stringify(e);
    }
  }

  const context: AssistantContext = {
    user: await signedIn(),
    now: now(),
    defaultSite: 'Manila',
    emit: (e) => console.log(cyan(`\n[ui] ${describe(e)}`)),
  };

  console.log(dim(`model: ${process.env.OPENAI_MODEL || 'SDK default'} · clock: ${formatManila(context.now)} · user: ${context.user.name}`));
  console.log(dim(`> ${message}\n`));

  let lastWasText = false;
  try {
    const result = await run(roomAssistant, message, { stream: true, context, maxTurns: 10 });
    for await (const event of result) {
      if (event.type === 'raw_model_stream_event' && event.data.type === 'output_text_delta') {
        process.stdout.write(event.data.delta);
        lastWasText = true;
      } else if (event.type === 'run_item_stream_event' && event.name === 'tool_called') {
        const raw = event.item.rawItem as { name?: string; arguments?: string };
        console.log(yellow(`${lastWasText ? '\n' : ''}[tool] ${raw.name} ${raw.arguments ?? ''}`));
        lastWasText = false;
      }
    }
    await result.completed;
  } catch (error) {
    // The scope guardrail blocks clearly off-topic messages before the model runs (src/agent/guardrails.ts).
    if (!(error instanceof InputGuardrailTripwireTriggered)) throw error;
    console.log(`${dim('[guardrail] off-topic, the model did not run')}\n${OFF_TOPIC_REPLY}`);
  }
  console.log('\n');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
