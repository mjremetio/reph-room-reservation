import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toCsv } from '../csv';

test('quotes commas, quotes and new lines', () => {
  assert.equal(toCsv(['a', 'b'], [['Tester, Alpha', 'say "hi"\nthere']]), 'a,b\r\n"Tester, Alpha","say ""hi""\nthere"\r\n');
});

test('neutralises spreadsheet formulas and keeps empty cells', () => {
  assert.equal(toCsv(['x', 'y', 'z'], [['=HYPERLINK("x")', null, 5]]), 'x,y,z\r\n"\'=HYPERLINK(""x"")",,5\r\n');
});
