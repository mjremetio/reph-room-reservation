import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verbatimDrift } from '../../scripts/spec-verbatim';

test('the spec’s verbatim copies match the code (run npm run spec:sync after a change)', () => {
  assert.deepEqual(verbatimDrift(process.cwd()), []);
});
