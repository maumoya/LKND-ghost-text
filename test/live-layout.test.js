// Regressions from the live run on LinkedIn (2026-11-04): empty attachment widgets, <br> line
// breaks in bubbles, the 💣 button nested in LinkedIn's send-options trigger, and an edit form
// left open after a mismatch.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFixture } = require('./helpers.js');
const { wireFakeLinkedIn } = require('./fake-linkedin.js');
const { install } = require('../extension/content.js');
const D = require('../extension/lib/dom.js');

const fast = { delay: async () => {}, rand: () => 0, waitMs: 100 };
const urn = 'urn:li:msg_message:(urn:li:fsd_profile:OWNER,2-BBB)';
const target = (doc) => D.matchMessage(doc, { urn, text: 'first own message' }).el;

test('live: empty attachment widgets are not an attachment', () => {
  const doc = wireFakeLinkedIn(loadFixture());
  const form = doc.querySelector('form.msg-form');
  form.insertAdjacentHTML('beforeend',
    '<div class="msg-form__attachment-drag-and-drop"><svg></svg></div>' +
    '<ul class="msg-form__attachment-list"></ul>' +
    '<input type="file" class="msg-form__attachment-upload-input" hidden>');
  assert.equal(D.hasAttachment(doc), false);
  form.querySelector('.msg-form__attachment-list').innerHTML = '<li>photo.png</li>';
  assert.equal(D.hasAttachment(doc), true);
});

test('live: a bubble with <br> keeps its line break', () => {
  const doc = wireFakeLinkedIn(loadFixture());
  const el = target(doc);
  el.querySelector('p.msg-s-event-listitem__body').innerHTML = 'go 👀<br>This message will self-destruct in 20 seconds. 💣';
  assert.equal(D.bodyText(el), 'go 👀\nThis message will self-destruct in 20 seconds. 💣');
});

test('live: a two-line message (bubble <br>, editor paragraphs) is edited', async () => {
  const doc = wireFakeLinkedIn(loadFixture());
  const el = target(doc);
  el.querySelector('p.msg-s-event-listitem__body').innerHTML = 'go<br>tag line';
  const r = await D.editMessage(doc, el, '💬💣💨', fast);
  assert.deepEqual(r, { ok: true });
});

test('live: the edit form is closed with Cancel after a mismatch', async () => {
  const doc = wireFakeLinkedIn(loadFixture(), { wrongEdit: true });
  const r = await D.editMessage(doc, target(doc), '💬💣💨', fast);
  assert.equal(r.reason, 'edit_mismatch');
  assert.equal(doc.querySelector('form.msg-edit-form__base-form'), null);
});

test('live: 💣 sits outside the send-options trigger and its click does not bubble', () => {
  const doc = wireFakeLinkedIn(loadFixture());
  const toggle = doc.querySelector('.msg-form__send-toggle');
  const trig = doc.createElement('span');
  trig.className = 'artdeco-hoverable-trigger';
  toggle.replaceWith(trig);
  trig.appendChild(toggle);
  let bubbled = 0;
  doc.querySelector('.msg-form__footer').addEventListener('click', () => bubbled++);
  const rt = { runtime: { sendMessage: async () => ({ ok: true, bombs: {} }), onMessage: { addListener() {} } } };
  install(doc, rt, { url: 'https://www.linkedin.com/messaging/thread/ABC/', setTimeout: () => 0, setInterval: () => 0 });
  const btn = doc.querySelector('.lb-bomb');
  assert.ok(btn);
  assert.equal(btn.closest('.artdeco-hoverable-trigger'), null);
  btn.click();
  assert.equal(bubbled, 0);
  assert.equal(doc.querySelector('.lb-menu').hidden, false);
});
