/**
 * Conversation history comes back from the browser (docs/spec/05-agent.md, Conversation state), so it is
 * untrusted input: keep the last items only, never let the client add system or developer messages,
 * and never start in the middle of a tool call (the Responses API rejects a tool output without its call).
 */
const MAX_HISTORY_ITEMS = 60;

type Item = Record<string, unknown>;

const isUserMessage = (item: Item) => item.role === 'user' && (item.type === undefined || item.type === 'message');

export function trimHistory<T extends Item>(items: T[], max = MAX_HISTORY_ITEMS): T[] {
  const safe = items.filter((i) => i.role !== 'system' && i.role !== 'developer');
  const tail = safe.slice(-max);
  const firstUser = tail.findIndex(isUserMessage);
  return firstUser === -1 ? [] : tail.slice(firstUser);
}
