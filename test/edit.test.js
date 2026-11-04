const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFixture } = require('./helpers.js');
const { wireFakeLinkedIn } = require('./fake-linkedin.js');
const D = require('../extension/lib/dom.js');

const urn = 'urn:li:msg_message:(urn:li:fsd_profile:OWNER,2-BBB)';
const target = (doc) => D.matchMessage(doc, { urn, text: 'first own message' }).el;

test('editMessage explodes the message after one human-pace delay', async () => {
  const doc = wireFakeLinkedIn(loadFixture());
  const calls = [];
  const r = await D.editMessage(doc, target(doc), '💬💣💨', { delay: async (ms) => calls.push(ms), rand: () => 0.5 });
  assert.deepEqual(r, { ok: true });
  assert.equal(D.messageKeyOf(doc.querySelector(`[data-event-urn="${urn}"]`)).text, '💬💣💨');
  assert.equal(calls.length, 1);
  assert.ok(calls[0] >= 1000 && calls[0] <= 3000);
  assert.equal(doc.querySelector('form.msg-edit-form__base-form'), null);
  // nothing else changed
  assert.equal(D.ownMessages(doc).filter((e) => D.messageKeyOf(e).text === '💬💣💨').length, 1);
});

test('missing Edit control fails loudly', async () => {
  const doc = wireFakeLinkedIn(loadFixture(), { noEdit: true });
  const r = await D.editMessage(doc, target(doc), '💬💣💨', { delay: async () => {}, rand: () => 0, waitMs: 50 });
  assert.deepEqual(r, { ok: false, reason: 'edit_control_missing' });
});

test('missing options trigger fails loudly', async () => {
  const doc = wireFakeLinkedIn(loadFixture());
  const el = target(doc);
  el.querySelector('.msg-s-event-listitem__options-trigger').remove();
  const r = await D.editMessage(doc, el, '💬💣💨', { delay: async () => {}, rand: () => 0, waitMs: 50 });
  assert.deepEqual(r, { ok: false, reason: 'edit_control_missing' });
});

test('Save that does not stick is verify_failed', async () => {
  const doc = wireFakeLinkedIn(loadFixture(), { breakSave: true });
  const r = await D.editMessage(doc, target(doc), '💬💣💨', { delay: async () => {}, rand: () => 1, waitMs: 50 });
  assert.deepEqual(r, { ok: false, reason: 'verify_failed' });
});
