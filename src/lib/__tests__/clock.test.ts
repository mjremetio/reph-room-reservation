import assert from 'node:assert/strict';
import { test } from 'node:test';
import { now } from '../clock';

test('DEMO_NOW starts the clock at the demo time, and a bad value falls back to real time', () => {
  const saved = process.env.DEMO_NOW;
  try {
    process.env.DEMO_NOW = '2026-09-28T09:00:00+08:00';
    const demo = now().getTime() - Date.parse('2026-09-28T01:00:00Z');
    assert.ok(demo >= 0 && demo < 60_000, `${demo} ms after the demo start`);
    process.env.DEMO_NOW = 'not a date';
    assert.ok(Math.abs(now().getTime() - Date.now()) < 1000);
  } finally {
    if (saved === undefined) delete process.env.DEMO_NOW;
    else process.env.DEMO_NOW = saved;
  }
});
