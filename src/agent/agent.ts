import { Agent, setTracingDisabled } from '@openai/agents';
import type { AssistantContext } from './context';
import { scopeGuardrail } from './guardrails';
import { buildInstructions } from './instructions';
import { roomTools } from './tools';

// The SDK sends run traces (including tool payloads) to OpenAI by default. Off until IT approves it
// (docs/spec/09-quality.md, Observability); set OPENAI_TRACING=true to turn it on.
setTracingDisabled(process.env.OPENAI_TRACING !== 'true');

/**
 * The room assistant, running on OpenAI through the Agents SDK (Responses API).
 * Set OPENAI_MODEL to choose a model; otherwise the SDK default is used.
 */
export const roomAssistant = new Agent<AssistantContext>({
  name: 'REPH room assistant',
  instructions: (runContext) => buildInstructions(runContext.context),
  tools: roomTools,
  // Blocks clearly off-topic messages before the model runs (src/agent/guardrails.ts).
  inputGuardrails: [scopeGuardrail],
  ...(process.env.OPENAI_MODEL ? { model: process.env.OPENAI_MODEL } : {}),
});
