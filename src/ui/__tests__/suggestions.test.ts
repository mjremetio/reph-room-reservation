import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN_WORDS, looksOnTopic } from '../../agent/guardrails';
import { ROOMS } from '../../data/rooms';
import { ADMIN_SUGGESTIONS } from '../admin/suggestions';

test("every Admin assistant suggestion passes the scope guardrail's keyword check, without the classifier", () => {
  const items = ADMIN_SUGGESTIONS.flatMap((g) => g.items);
  assert.equal(items.length, 17);
  assert.equal(new Set(items).size, items.length, 'no repeats');
  for (const q of items) assert.ok(looksOnTopic(q, ROOMS.map((r) => r.name), ADMIN_WORDS), q);
});
