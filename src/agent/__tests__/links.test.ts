import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mailtoLink, teamsChatLink } from '../links';

test('Teams and email links carry the message safely', () => {
  const text = 'Hi Alpha, could we swap rooms? Batanes, 3F is free 3:00–4:30 PM & fits 5.';
  const teams = new URL(teamsChatLink('alpha.tester@example.com', text));
  assert.equal(teams.hostname, 'teams.microsoft.com');
  assert.equal(teams.searchParams.get('users'), 'alpha.tester@example.com');
  assert.equal(teams.searchParams.get('message'), text);
  assert.ok(mailtoLink('alpha.tester@example.com', 'About your room booking', text).startsWith('mailto:alpha.tester@example.com?subject='));
});
