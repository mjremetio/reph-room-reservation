/**
 * Agent evals (docs/spec/05-agent.md, Evals): runs every conversation in evals/phrases.json through the real
 * agent (OpenAI) against a fresh mock gateway on the demo clock, and checks the last turn's tool calls,
 * find_rooms flow and reply text. Needs OPENAI_API_KEY (.env.local).
 *
 *   npm run evals                        all items
 *   npm run evals -- --tag scope         items with a tag
 *   npm run evals -- --only flow-a,flow-b
 *
 * Exit code 1 when the pass rate is under passBar.overall or a "safety" item fails (passBar.safety = 1).
 * A full run (no --tag / --only) also writes evals/last-run.md.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { InputGuardrailTripwireTriggered, run, type AgentInputItem } from '@openai/agents';
import type { AssistantContext, UiEvent } from '../src/agent/context';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

interface Expect {
  tools?: string[];
  args?: Record<string, Record<string, unknown>>;
  noTools?: string[];
  flow?: string;
  mustSay?: string[];
  mustSayAny?: string[];
  mustNotSay?: string[];
}
interface Item {
  id: string;
  /** "admin" runs the Admin assistant (src/agent/adminAgent.ts); default the room assistant. */
  agent?: 'admin';
  tags: string[];
  turns: string[];
  expect: Expect;
}
interface Spec {
  scenario: string;
  now: string;
  user: string;
  passBar: { overall: number; safety: number };
  items: Item[];
}

const spec = JSON.parse(readFileSync('evals/phrases.json', 'utf8')) as Spec;
// The evals always run on the demo week and clock, whatever .env.local says.
process.env.RESERVATION_GATEWAY = 'mock';
process.env.MOCK_SCENARIO = spec.scenario;
process.env.DEMO_NOW = spec.now;

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const only = flag('only')?.split(',');
const tag = flag('tag');
const items = spec.items.filter((i) => (!only || only.includes(i.id)) && (!tag || i.tags.includes(tag)));

/** Case-insensitive, with curly quotes and dashes made plain, so "Don't" matches "Don’t". */
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-');

/** Expected argument values: times compare as instants, text case-insensitively, the rest exactly. */
function same(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'string' && typeof actual === 'string') {
    const a = Date.parse(actual);
    const e = Date.parse(expected);
    if (/\dT\d/.test(expected) && !Number.isNaN(a) && !Number.isNaN(e)) return a === e;
    return norm(expected) === norm(actual);
  }
  return JSON.stringify(expected) === JSON.stringify(actual);
}

interface Turn {
  text: string;
  calls: Array<{ name: string; args: Record<string, unknown> }>;
  events: UiEvent[];
  blocked: boolean;
}

function check(e: Expect, t: Turn): string[] {
  const problems: string[] = [];
  const names = t.calls.map((c) => c.name);
  if (e.tools) {
    let at = 0;
    for (const name of names) if (name === e.tools[at]) at++;
    if (at < e.tools.length) problems.push(`tools: expected ${e.tools.join(' → ')}, got ${names.join(' → ') || 'none'}`);
  }
  for (const [name, want] of Object.entries(e.args ?? {})) {
    const ok = t.calls.some((c) => c.name === name && Object.entries(want).every(([k, v]) => same(v, c.args[k])));
    if (!ok) problems.push(`args: ${name} ${JSON.stringify(want)} not matched (${JSON.stringify(t.calls.filter((c) => c.name === name).map((c) => c.args))})`);
  }
  for (const name of e.noTools ?? []) if (names.includes(name)) problems.push(`noTools: called ${name}`);
  if (e.flow) {
    const results = t.events.filter((x): x is Extract<UiEvent, { type: 'room_results' }> => x.type === 'room_results').pop();
    if (results?.flow !== e.flow) problems.push(`flow: expected ${e.flow}, got ${results?.flow ?? 'no find_rooms'}`);
  }
  const text = norm(t.text);
  for (const p of e.mustSay ?? []) if (!text.includes(norm(p))) problems.push(`mustSay: "${p}" missing`);
  if (e.mustSayAny && !e.mustSayAny.some((p) => text.includes(norm(p)))) problems.push(`mustSayAny: none of ${JSON.stringify(e.mustSayAny)}`);
  for (const p of e.mustNotSay ?? []) if (text.includes(norm(p))) problems.push(`mustNotSay: "${p}" present`);
  return problems;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing. Add it to .env.local.');
  // Import after the env is set: the agent reads OPENAI_MODEL, the clock DEMO_NOW, the gateway the scenario.
  const { roomAssistant } = await import('../src/agent/agent');
  const { adminAssistant } = await import('../src/agent/adminAgent');
  const { ADMIN_OFF_TOPIC_REPLY, OFF_TOPIC_REPLY } = await import('../src/agent/guardrails');
  const { getGateway, resetGateway } = await import('../src/gateway');
  const { now } = await import('../src/lib/clock');

  console.log(`${items.length} items · model ${process.env.OPENAI_MODEL || 'SDK default'} · ${spec.scenario} scenario · clock ${spec.now}\n`);
  const outcomes: Array<{ item: Item; problems: string[]; turn?: Turn; ms: number }> = [];
  for (const item of items) {
    resetGateway(); // every item starts from the same demo week
    const user = (await getGateway().listPeople()).find((p) => p.email === spec.user);
    if (!user) throw new Error(`evals/phrases.json: user ${spec.user} is not in the directory.`);
    const started = Date.now();
    let history: AgentInputItem[] = [];
    let last: Turn | undefined;
    try {
      for (const message of item.turns) {
        const turn: Turn = { text: '', calls: [], events: [], blocked: false };
        const context: AssistantContext = { user, now: now(), defaultSite: 'Manila', emit: (e) => turn.events.push(e) };
        try {
          const agent = item.agent === 'admin' ? adminAssistant : roomAssistant;
          const result = await run(agent, [...history, { role: 'user', content: message }], { context, maxTurns: 10 });
          for (const it of result.newItems) {
            if (it.type !== 'tool_call_item') continue;
            const raw = it.rawItem as { name?: string; arguments?: string };
            turn.calls.push({ name: raw.name ?? '?', args: raw.arguments ? (JSON.parse(raw.arguments) as Record<string, unknown>) : {} });
          }
          turn.text = String(result.finalOutput ?? '');
          history = result.history;
        } catch (error) {
          if (!(error instanceof InputGuardrailTripwireTriggered)) throw error;
          turn.text = item.agent === 'admin' ? ADMIN_OFF_TOPIC_REPLY : OFF_TOPIC_REPLY; // what the route sends; the history stays as it was
          turn.blocked = true;
        }
        last = turn;
      }
      outcomes.push({ item, problems: check(item.expect, last as Turn), turn: last, ms: Date.now() - started });
    } catch (error) {
      outcomes.push({ item, problems: [`error: ${error instanceof Error ? error.message : String(error)}`], ms: Date.now() - started });
    }
    const o = outcomes[outcomes.length - 1] as (typeof outcomes)[number];
    const mark = o.problems.length ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
    const extra = o.turn?.blocked ? ' [guardrail]' : '';
    console.log(`${mark} ${item.id.padEnd(26)} ${String(Math.round(o.ms / 100) / 10).padStart(5)}s${extra}`);
    for (const p of o.problems) console.log(`    ${p}`);
    if (o.problems.length && o.turn) console.log(`    reply: ${o.turn.text.replace(/\s+/g, ' ').slice(0, 240)}`);
  }

  const passed = outcomes.filter((o) => o.problems.length === 0).length;
  const rate = outcomes.length ? passed / outcomes.length : 1;
  const byTag = new Map<string, { n: number; ok: number }>();
  for (const o of outcomes) {
    for (const t of o.item.tags) {
      const s = byTag.get(t) ?? { n: 0, ok: 0 };
      s.n++;
      if (o.problems.length === 0) s.ok++;
      byTag.set(t, s);
    }
  }
  console.log(`\nPassed ${passed}/${outcomes.length} (${Math.round(rate * 100)}%) · bar ${Math.round(spec.passBar.overall * 100)}%, safety ${Math.round(spec.passBar.safety * 100)}%`);
  console.log([...byTag.entries()].sort().map(([t, s]) => `${t} ${s.ok}/${s.n}`).join(' · '));
  const safety = byTag.get('safety');
  const safetyOk = !safety || safety.ok / safety.n >= spec.passBar.safety;
  if (rate < spec.passBar.overall || !safetyOk) process.exitCode = 1;

  if (!only && !tag) {
    const cell = (t: string) => t.replace(/\|/g, '\\|').replace(/\s+/g, ' ');
    const lines = [
      '# Agent evals: last full run',
      '',
      `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · model ${process.env.OPENAI_MODEL || 'SDK default'} · ${spec.scenario} scenario · clock ${spec.now}`,
      '',
      `**Passed ${passed}/${outcomes.length} (${Math.round(rate * 100)}%)**, bar ${Math.round(spec.passBar.overall * 100)}% overall and ${Math.round(spec.passBar.safety * 100)}% safety: ${rate >= spec.passBar.overall && safetyOk ? 'met' : 'NOT met'}.`,
      '',
      [...byTag.entries()].sort().map(([t, s]) => `${t} ${s.ok}/${s.n}`).join(' · '),
      '',
      '| Item | Tags | Result | Time |',
      '|---|---|---|---|',
      ...outcomes.map((o) => `| ${o.item.id} | ${o.item.tags.join(', ')} | ${o.problems.length ? `✗ ${cell(o.problems.join('; '))}` : `✓${o.turn?.blocked ? ' (guardrail)' : ''}`} | ${Math.round(o.ms / 100) / 10} s |`),
      '',
    ];
    writeFileSync('evals/last-run.md', lines.join('\n'));
    console.log('Report: evals/last-run.md');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
