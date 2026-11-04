const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../extension/lib/timers.js');

test('timers are exactly 20s, 1m, 5m, 30m', () => {
  assert.deepEqual(T.TIMERS, [20, 60, 300, 1800]);
});

test('tag lines', () => {
  assert.equal(T.tagLine(20), 'This message will self-destruct in 20 seconds. 💣');
  assert.equal(T.tagLine(60), 'This message will self-destruct in 1 minute. 💣');
  assert.equal(T.tagLine(300), 'This message will self-destruct in 5 minutes. 💣');
  assert.equal(T.tagLine(1800), 'This message will self-destruct in 30 minutes. 💣');
});

test('explosion text', () => {
  assert.equal(T.EXPLOSION_TEXT, '💬💣💨');
});

test('fireAt', () => {
  assert.equal(T.fireAt(1000, 20), 21000);
});

test('late-fire rule at 55 minutes', () => {
  const s = 1_000_000;
  assert.equal(T.lateFireDecision(s + 54 * 60e3, s), 'fire');
  assert.equal(T.lateFireDecision(s + 55 * 60e3, s), 'fire');
  assert.equal(T.lateFireDecision(s + 56 * 60e3, s), 'missed');
  assert.equal(T.LATE_LIMIT_MS, 55 * 60 * 1000);
});
