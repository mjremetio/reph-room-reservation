import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sameEmail } from '../people';

test('emails match regardless of case; a missing email never matches', () => {
  assert.equal(sameEmail('MarkJoseph.Remetio@lexisnexis.com', 'markjoseph.remetio@lexisnexis.com'), true);
  assert.equal(sameEmail('markjoseph.remetio@lexisnexis.com', 'alpha.tester@example.com'), false);
  assert.equal(sameEmail(undefined, 'markjoseph.remetio@lexisnexis.com'), false);
  assert.equal(sameEmail(undefined, undefined), false);
});
