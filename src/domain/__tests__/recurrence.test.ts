import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeRecurrence, expandRecurrence } from '../recurrence';
import { formatManila, manila } from '../time';

const first = { start: manila(2026, 9, 28, 15), end: manila(2026, 9, 28, 16) }; // Mon 3–4 PM
const days = (xs: Array<{ start: Date }>) => xs.map((x) => formatManila(x.start));

test('daily every 1 day keeps the time and length (guidelines example: end date the next day)', () => {
  const r = expandRecurrence(first, { freq: 'Daily', every: 1, until: manila(2026, 9, 30) });
  assert.deepEqual(days(r), ['Mon, Sep 28, 3:00 PM', 'Tue, Sep 29, 3:00 PM', 'Wed, Sep 30, 3:00 PM']);
  assert.ok(r.every((x) => x.end.getTime() - x.start.getTime() === 3_600_000));
});

test('weekly on chosen weekdays, every 2 weeks', () => {
  const r = expandRecurrence(first, { freq: 'Weekly', every: 2, days: ['Monday', 'Wednesday'], until: manila(2026, 10, 14) });
  assert.deepEqual(days(r), ['Mon, Sep 28, 3:00 PM', 'Wed, Sep 30, 3:00 PM', 'Mon, Oct 12, 3:00 PM', 'Wed, Oct 14, 3:00 PM']);
});

test('weekly on a day other than the first date starts at the next such day', () => {
  const r = expandRecurrence(first, { freq: 'Weekly', every: 1, days: ['Thursday'], until: manila(2026, 10, 8) });
  assert.deepEqual(days(r), ['Thu, Oct 1, 3:00 PM', 'Thu, Oct 8, 3:00 PM']);
});

test('monthly on a day number skips months without it; on "the third Thursday"; on "the last Friday"', () => {
  const jan31 = { start: manila(2027, 1, 31, 9), end: manila(2027, 1, 31, 10) };
  assert.deepEqual(days(expandRecurrence(jan31, { freq: 'Monthly', every: 1, on: { day: 31 }, until: manila(2027, 5, 31) })), [
    'Sun, Jan 31, 9:00 AM',
    'Wed, Mar 31, 9:00 AM',
    'Mon, May 31, 9:00 AM',
  ]);
  assert.deepEqual(days(expandRecurrence(first, { freq: 'Monthly', every: 1, on: { week: 'Third', weekday: 'Thursday' }, until: manila(2026, 12, 31) })), [
    'Thu, Oct 15, 3:00 PM',
    'Thu, Nov 19, 3:00 PM',
    'Thu, Dec 17, 3:00 PM',
  ]);
  assert.deepEqual(days(expandRecurrence(first, { freq: 'Monthly', every: 1, on: { week: 'Last', weekday: 'Friday' }, until: manila(2026, 11, 30) })), [
    'Fri, Oct 30, 3:00 PM',
    'Fri, Nov 27, 3:00 PM',
  ]);
});

test('yearly, capped by max, and a readable summary', () => {
  assert.equal(expandRecurrence(first, { freq: 'Yearly', every: 1, until: manila(2029, 12, 31) }).length, 4);
  assert.equal(expandRecurrence(first, { freq: 'Daily', every: 1, until: manila(2027, 12, 31) }, 10).length, 10);
  assert.equal(describeRecurrence({ freq: 'Weekly', every: 1, days: ['Wednesday'], until: manila(2026, 11, 25) }), 'Weekly on Wednesday until Nov 25, 2026');
});
