import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchPeople, sameEmail } from '../people';

test('emails match regardless of case; a missing email never matches', () => {
  assert.equal(sameEmail('MarkJoseph.Remetio@lexisnexis.com', 'markjoseph.remetio@lexisnexis.com'), true);
  assert.equal(sameEmail('markjoseph.remetio@lexisnexis.com', 'alpha.tester@example.com'), false);
  assert.equal(sameEmail(undefined, 'markjoseph.remetio@lexisnexis.com'), false);
  assert.equal(sameEmail(undefined, undefined), false);
});

test('a person is found by any words of their name, in any order, or by their e-mail', () => {
  const people = [
    { name: 'Tester, Alpha', email: 'alpha.tester@example.com' },
    { name: 'Tester, Bravo', email: 'bravo.tester@example.com' },
    { name: 'Kim, Tae Hwan S.', email: 'taehwan.kim@example.com' },
  ];
  const names = (q: string) => matchPeople(people, q).map((p) => p.name);
  assert.deepEqual(names('alpha'), ['Tester, Alpha']);
  assert.deepEqual(names('Alpha Tester'), ['Tester, Alpha']);
  assert.deepEqual(names('Tester, Alpha'), ['Tester, Alpha']);
  assert.deepEqual(names('tae hwan'), ['Kim, Tae Hwan S.']);
  assert.deepEqual(names('BRAVO.TESTER@example.com'), ['Tester, Bravo']);
  assert.deepEqual(names('tester'), ['Tester, Alpha', 'Tester, Bravo'], 'several: the caller asks which one');
  assert.deepEqual(names('charlie'), []);
  assert.deepEqual(names('  '), []);
});
