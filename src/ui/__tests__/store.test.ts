import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initial, reducer } from '../store';

test('New chat clears the conversation but keeps the map and the time', () => {
  let s = reducer(initial, { type: 'slot', slot: { start: '2026-09-28T07:00:00.000Z', end: '2026-09-28T08:00:00.000Z' } });
  s = reducer(s, { type: 'user_message', id: 'u1', text: 'Room for 5 today from 3 to 4 PM' });
  s = reducer(s, { type: 'assistant_start', id: 'a1' });
  s = reducer(s, { type: 'text', delta: 'Amsterdam is free.' });
  s = reducer(s, { type: 'confirmed', ticketNo: 'RM-0130001' });

  // While a reply streams, the button is disabled and the action does nothing.
  assert.equal(reducer(s, { type: 'new_conversation' }), s);

  s = { ...s, streaming: false, history: [{ role: 'user', content: 'Room for 5 today from 3 to 4 PM' }], composer: 'draft' };
  const fresh = reducer(s, { type: 'new_conversation' });
  assert.deepEqual(fresh.messages, []);
  assert.deepEqual(fresh.history, []);
  assert.deepEqual(fresh.confirmedTickets, []);
  assert.equal(fresh.composer, '');
  assert.equal(fresh.banner, null);
  assert.deepEqual(fresh.slot, s.slot);
});
