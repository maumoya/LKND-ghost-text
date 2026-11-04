const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFixture } = require('./helpers.js');
const { wireFakeLinkedIn } = require('./fake-linkedin.js');
const { install } = require('../extension/content.js');
const D = require('../extension/lib/dom.js');

const TAG20 = 'This message will self-destruct in 20 seconds. 💣';
const URL = 'https://www.linkedin.com/messaging/thread/ABC/';

function fakeRuntime() {
  const out = [];
  const listeners = [];
  return {
    out, listeners,
    runtime: {
      sendMessage: async (m) => { out.push(m); return m.type === 'list' ? { ok: true, bombs: {} } : { ok: true }; },
      onMessage: { addListener: (f) => listeners.push(f) },
    },
  };
}

function setup() {
  const doc = wireFakeLinkedIn(loadFixture());
  const rt = fakeRuntime();
  const timers = [];
  const api = install(doc, rt, {
    url: URL, now: () => 1000, setTimeout: (f, ms) => timers.push({ f, ms }), setInterval: () => 0,
    delay: async () => {}, waitMs: 200,
  });
  return { doc, rt, api, timers };
}

function typeInComposer(doc, text) {
  doc.querySelector('.msg-form__contenteditable').innerHTML = text ? '<p>' + text + '</p>' : '<p><br></p>';
}

test('install adds exactly one bomb button, idempotent', () => {
  const { doc, rt } = setup();
  install(doc, rt, { url: URL });
  assert.equal(doc.querySelectorAll('.lb-bomb').length, 1);
  assert.equal(doc.querySelectorAll('.lb-menu button[data-seconds]').length, 4);
});

test('bomb button toggles the timer menu', () => {
  const { doc } = setup();
  const menu = doc.querySelector('.lb-menu');
  assert.equal(menu.hidden, true);
  doc.querySelector('.lb-bomb').click();
  assert.equal(menu.hidden, false);
});

test('choosing 20 s sends with the tag, arms, schedules fireNow and draws a ring', async () => {
  const { doc, rt, api, timers } = setup();
  typeInComposer(doc, 'hi');
  const r = await api.choose(20);
  assert.equal(r.ok, true);
  assert.equal(doc._sent.length, 1);
  assert.ok(doc._sent[0].endsWith(TAG20));
  const arm = rt.out.find((m) => m.type === 'arm');
  assert.ok(arm);
  assert.equal(arm.bomb.fireAt - arm.bomb.sentAt, 20000);
  assert.equal(arm.bomb.conversationUrl, URL);
  assert.ok(arm.bomb.key.urn.includes('2-NEW1'));
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 20000);
  timers[0].f();
  assert.deepEqual(rt.out.at(-1), { type: 'fireNow', id: arm.bomb.id });
  assert.ok(doc.querySelector('[data-event-urn*="2-NEW1"] svg.lb-ring'));
});

test('send button is used when LinkedIn shows one', async () => {
  const { doc, api } = setup();
  const b = doc.createElement('button');
  b.className = 'msg-form__send-button';
  b.type = 'button';
  doc.querySelector('.msg-form__footer').appendChild(b);
  typeInComposer(doc, 'hey');
  const r = await api.choose(60);
  assert.equal(r.ok, true);
  assert.ok(doc._sent[0].endsWith('This message will self-destruct in 1 minute. 💣'));
});

test('attachment present: nothing sent, no arm', async () => {
  const { doc, rt, api } = setup();
  typeInComposer(doc, 'hi');
  const p = doc.createElement('div');
  p.className = 'msg-form__attachment-preview';
  doc.querySelector('.msg-form').prepend(p);
  const r = await api.choose(20);
  assert.deepEqual(r, { ok: false, reason: 'attachment' });
  assert.equal(doc._sent.length, 0);
  assert.equal(rt.out.filter((m) => m.type === 'arm').length, 0);
});

test('empty composer: no-op', async () => {
  const { doc, rt, api } = setup();
  typeInComposer(doc, '');
  const r = await api.choose(20);
  assert.deepEqual(r, { ok: false, reason: 'empty' });
  assert.equal(doc._sent.length, 0);
  assert.equal(rt.out.filter((m) => m.type === 'arm').length, 0);
});

function explode(rt, bomb) {
  return new Promise((resolve) => {
    const keep = rt.listeners[0]({ type: 'explode', bomb }, {}, resolve);
    assert.equal(keep, true);
  });
}

test('explode on the urn-matched message', async () => {
  const { doc, rt } = setup();
  const urn = 'urn:li:msg_message:(urn:li:fsd_profile:OWNER,2-BBB)';
  const r = await explode(rt, { id: 'b1', key: { urn, text: 'first own message' } });
  assert.deepEqual(r, { ok: true });
  assert.equal(D.messageKeyOf(doc.querySelector(`[data-event-urn="${urn}"]`)).text, '💬💣💨');
});

test('explode on duplicate text refuses and changes nothing', async () => {
  const { doc, rt } = setup();
  const r = await explode(rt, { id: 'b2', key: { text: 'dup text' } });
  assert.deepEqual(r, { ok: false, reason: 'ambiguous' });
  assert.equal(D.ownMessages(doc).filter((e) => D.messageKeyOf(e).text === 'dup text').length, 2);
});

test('non-explode messages are ignored', () => {
  const { rt } = setup();
  assert.equal(rt.listeners[0]({ type: 'other' }, {}, () => {}), false);
});
