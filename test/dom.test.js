const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFixture } = require('./helpers.js');
const D = require('../extension/lib/dom.js');

const URN_BBB = 'urn:li:msg_message:(urn:li:fsd_profile:OWNER,2-BBB)';

test('composer found; no send button in Enter-to-send mode', () => {
  const doc = loadFixture();
  assert.ok(D.findComposer(doc));
  assert.equal(D.findSendButton(doc), null);
  const b = doc.createElement('button');
  b.className = 'msg-form__send-button';
  doc.querySelector('.msg-form__footer').appendChild(b);
  assert.equal(D.findSendButton(doc), b);
});

test('hasAttachment false, true once a preview exists', () => {
  const doc = loadFixture();
  assert.equal(D.hasAttachment(doc), false);
  const p = doc.createElement('div');
  p.className = 'msg-form__attachment-preview';
  doc.querySelector('.msg-form').prepend(p);
  assert.equal(D.hasAttachment(doc), true);
});

test('ownMessages excludes the other person', () => {
  assert.equal(D.ownMessages(loadFixture()).length, 4);
});

test('messageKeyOf strips the (Edited) label', () => {
  const doc = loadFixture();
  const own = D.ownMessages(doc);
  assert.deepEqual(D.messageKeyOf(own[0]), { urn: URN_BBB, text: 'first own message' });
  assert.equal(D.messageKeyOf(own[3]).text, 'Already edited');
});

test('match by urn', () => {
  const doc = loadFixture();
  const r = D.matchMessage(doc, { urn: URN_BBB, text: 'first own message' });
  assert.equal(r.ok, true);
  assert.equal(r.el.getAttribute('data-event-urn'), URN_BBB);
});

test('duplicate text is refused', () => {
  assert.deepEqual(D.matchMessage(loadFixture(), { text: 'dup text' }), { ok: false, reason: 'ambiguous' });
});

test('hand-edited or unknown text is not_found', () => {
  const doc = loadFixture();
  assert.deepEqual(D.matchMessage(doc, { text: 'never sent' }), { ok: false, reason: 'not_found' });
  // urn found but its text no longer matches the bombed text: owner hand-edited it
  assert.deepEqual(D.matchMessage(doc, { urn: URN_BBB, text: 'original before hand edit' }), { ok: false, reason: 'not_found' });
});

test('unknown urn falls back to text; whitespace and CRLF normalised', () => {
  const doc = loadFixture();
  const r = D.matchMessage(doc, { urn: 'urn:li:msg_message:(x,gone)', text: '  first own message\r\n' });
  assert.equal(r.ok, true);
});

test('missing message list is selector_missing', () => {
  const doc = loadFixture();
  doc.querySelectorAll('.msg-s-event-listitem').forEach((e) => e.remove());
  assert.deepEqual(D.matchMessage(doc, { text: 'first own message' }), { ok: false, reason: 'selector_missing' });
});

test('never matches the other person, even on exact text', () => {
  const doc = loadFixture();
  assert.deepEqual(D.matchMessage(doc, { text: 'Hi there from Test Person' }), { ok: false, reason: 'not_found' });
  const other = 'urn:li:msg_message:(urn:li:fsd_profile:OTHER1,2-AAA)';
  assert.deepEqual(D.matchMessage(doc, { urn: other, text: 'Hi there from Test Person' }), { ok: false, reason: 'not_found' });
});
