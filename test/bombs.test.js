const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../extension/lib/bombs.js');

const mk = () => B.newBomb({ conversationUrl: 'https://www.linkedin.com/messaging/thread/X/', key: { urn: 'u', text: 't' }, sentAt: 1000, seconds: 20 });

test('newBomb shape', () => {
  const b = mk();
  assert.equal(b.status, 'pending');
  assert.equal(b.fireAt, 21000);
  assert.equal(typeof b.id, 'string');
  assert.ok(b.id.length > 0);
  assert.notEqual(mk().id, b.id);
});

test('transitions from pending', () => {
  assert.equal(B.transition(mk(), 'done').status, 'done');
  assert.equal(B.transition(mk(), 'missed').status, 'missed');
  assert.equal(B.transition(mk(), 'cancel').status, 'cancelled');
  const f = B.transition(mk(), 'failed', 'ambiguous');
  assert.equal(f.status, 'failed');
  assert.equal(f.reason, 'ambiguous');
});

test('transition from a final state throws', () => {
  const d = B.transition(mk(), 'done');
  assert.throws(() => B.transition(d, 'failed'));
  assert.throws(() => B.transition(mk(), 'bogus'));
});
