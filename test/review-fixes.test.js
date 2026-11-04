// Tests for the final-review fix pass: C1 wrong-message edit, I2 silent send failures,
// I3 new-message pick, I4 worker restart, #5 slow-loading tab, #6 retry after a done edit.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFixture } = require('./helpers.js');
const { wireFakeLinkedIn } = require('./fake-linkedin.js');
const { install } = require('../extension/content.js');
const { fakeChrome } = require('./fake-chrome.js');
const { makeBackground } = require('../extension/background.js');
const D = require('../extension/lib/dom.js');
const B = require('../extension/lib/bombs.js');

const URL = 'https://www.linkedin.com/messaging/thread/ABC/';
const TAG20 = 'This message will self-destruct in 20 seconds. 💣';
const urn = 'urn:li:msg_message:(urn:li:fsd_profile:OWNER,2-BBB)';
const fast = { delay: async () => {}, rand: () => 0, waitMs: 100 };

function setup(fakeOpts = {}) {
  const doc = wireFakeLinkedIn(loadFixture(), fakeOpts);
  const out = [];
  const rt = { runtime: {
    sendMessage: async (m) => { out.push(m); return m.type === 'list' ? { ok: true, bombs: {} } : { ok: true }; },
    onMessage: { addListener() {} },
  } };
  const api = install(doc, rt, {
    url: URL, now: () => 1000, setTimeout: () => 0, setInterval: () => 0, delay: async () => {}, waitMs: 150,
  });
  return { doc, out, api };
}
const type = (doc, t) => { doc.querySelector('.msg-form__contenteditable').innerHTML = '<p>' + t + '</p>'; };
const target = (doc) => D.matchMessage(doc, { urn, text: 'first own message' }).el;
const edited = (doc) => D.ownMessages(doc).filter((e) => D.bodyText(e) === '💬💣💨').length;

// C1
test('C1: edit refuses when an edit form is already open', async () => {
  const doc = wireFakeLinkedIn(loadFixture());
  doc.querySelector('form.msg-form').classList.add('msg-edit-form__base-form');
  const r = await D.editMessage(doc, target(doc), '💬💣💨', fast);
  assert.deepEqual(r, { ok: false, reason: 'busy' });
  assert.equal(edited(doc), 0);
});

test('C1: edit refuses when a menu is already open', async () => {
  const doc = wireFakeLinkedIn(loadFixture());
  const m = doc.createElement('div');
  m.className = 'artdeco-dropdown__content artdeco-dropdown__content--is-open';
  doc.body.appendChild(m);
  const r = await D.editMessage(doc, target(doc), '💬💣💨', fast);
  assert.deepEqual(r, { ok: false, reason: 'busy' });
  assert.equal(edited(doc), 0);
});

test('C1: edit composer holding a different text is never saved', async () => {
  const doc = wireFakeLinkedIn(loadFixture(), { wrongEdit: true });
  const r = await D.editMessage(doc, target(doc), '💬💣💨', fast);
  assert.deepEqual(r, { ok: false, reason: 'edit_mismatch' });
  assert.equal(edited(doc), 0);
});

// I2
test('I2: attachment refusal is reported to the badge and shown on the page', async () => {
  const { doc, out, api } = setup();
  type(doc, 'secret');
  const img = doc.createElement('div');
  img.className = 'msg-form__attachment-preview';
  doc.querySelector('form.msg-form').appendChild(img);
  const r = await api.choose(20);
  assert.equal(r.reason, 'attachment');
  const f = out.find((m) => m.type === 'sendFailed');
  assert.equal(f && f.reason, 'attachment');
  assert.ok(doc.querySelector('.lb-toast'), 'toast shown');
});

test('I2: send not seen restores the composer without the tag and reports it', async () => {
  const { doc, out, api } = setup({ noSend: true });
  type(doc, 'secret');
  const r = await api.choose(20);
  assert.equal(r.reason, 'send_not_seen');
  assert.equal(D.editorText(doc.querySelector('.msg-form__contenteditable')), 'secret');
  assert.equal((out.find((m) => m.type === 'sendFailed') || {}).reason, 'send_not_seen');
  assert.ok(!out.some((m) => m.type === 'arm'));
});

test('I2: background records a send failure and raises the badge', async () => {
  const c = fakeChrome(); const bg = makeBackground(c, { now: () => 5, sleep: async () => {} });
  await bg.handleMessage({ type: 'sendFailed', reason: 'send_not_seen', preview: 'secret' });
  const all = Object.values(await bg.getBombs());
  assert.equal(all.length, 1);
  assert.equal(all[0].status, 'failed');
  assert.equal(all[0].reason, 'send_not_seen');
  assert.equal(c.badge, '1');
});

// I3
test('I3: after a list re-render the new message is picked by URN, not an old tagged one', async () => {
  const { doc, out, api } = setup({ rerenderOnSend: true });
  type(doc, 'one');
  assert.equal((await api.choose(20)).ok, true);
  type(doc, 'two');
  const r = await api.choose(20);
  assert.equal(r.ok, true);
  const arms = out.filter((m) => m.type === 'arm');
  assert.match(arms[1].bomb.key.urn, /2-NEW2\)$/);
  assert.equal(arms[1].bomb.key.text, 'two\n' + TAG20);
});

// I4
const bombAt = (sentAt, extra = {}) => Object.assign(B.newBomb({ conversationUrl: URL, key: { urn: 'u1', text: 'hi' }, sentAt, seconds: 20 }), extra);

test('I4: worker restart sweep fires an overdue bomb and sets the watchdog', async () => {
  const c = fakeChrome({ tabs: [{ id: 7, url: URL, status: 'complete' }] });
  const b = bombAt(0);
  c._store.bombs = { [b.id]: b };
  const bg = makeBackground(c, { now: () => 30e3, sleep: async () => {} });
  await bg.sweep();
  assert.equal((await bg.getBombs())[b.id].status, 'done');
  assert.ok(c._alarms.get('lb-watchdog'), 'watchdog alarm');
});

test('I4: the watchdog alarm runs the sweep and is not treated as a bomb', async () => {
  const c = fakeChrome({ tabs: [{ id: 7, url: URL, status: 'complete' }] });
  const b = bombAt(0);
  c._store.bombs = { [b.id]: b };
  const bg = makeBackground(c, { now: () => 30e3, sleep: async () => {} });
  await bg.onAlarm('lb-watchdog');
  assert.equal((await bg.getBombs())[b.id].status, 'done');
  assert.equal((await bg.getBombs())['lb-watchdog'], undefined);
});

test('I4: a tab opened before a worker restart is closed after the bomb ends', async () => {
  const c = fakeChrome({ tabs: [{ id: 100, url: URL, status: 'complete' }] });
  const b = bombAt(0, { createdTabId: 100 });
  c._store.bombs = { [b.id]: b };
  const bg = makeBackground(c, { now: () => 30e3, sleep: async () => {} });
  await bg.sweep();
  assert.deepEqual(c._removed, [100]);
  const after = (await bg.getBombs())[b.id];
  assert.equal(after.status, 'done');
  assert.equal(after.createdTabId, undefined);
});

test('I4: an ended bomb whose tab is still open gets it closed by the sweep', async () => {
  const c = fakeChrome({ tabs: [{ id: 101, url: URL, status: 'complete' }] });
  const b = bombAt(0, { status: 'failed', reason: 'x', endedAt: 1, createdTabId: 101 });
  c._store.bombs = { [b.id]: b };
  const bg = makeBackground(c, { now: () => 30e3, sleep: async () => {} });
  await bg.sweep();
  assert.deepEqual(c._removed, [101]);
  assert.equal((await bg.getBombs())[b.id].createdTabId, undefined);
});

test('I4: a tab the bomb opens is recorded on the bomb while it fires', async () => {
  const c = fakeChrome();
  let seen;
  c.tabs.sendMessage = async (tabId, msg) => {
    seen = (await c.storage.local.get('bombs')).bombs[msg.bomb.id].createdTabId;
    return { ok: true };
  };
  const bg = makeBackground(c, { now: () => 20e3, sleep: async () => {} });
  const b = bombAt(0);
  await bg.handleMessage({ type: 'arm', bomb: b });
  await bg.onAlarm(b.id);
  assert.equal(seen, 100);
  assert.deepEqual(c._removed, [100]);
});

// #5
test('#5: explode waits for a message that renders late', async () => {
  const { doc, api } = setup();
  const list = doc.querySelector('.msg-s-message-list-content');
  const keep = [...list.children];
  list.textContent = '';
  const li = doc.createElement('li');
  li.innerHTML = '<div class="msg-s-event-listitem msg-s-event-listitem--other"><p class="msg-s-event-listitem__body">hello</p></div>';
  list.appendChild(li); // something is on screen, the target is not yet
  setTimeout(() => keep.forEach((k) => list.appendChild(k)), 60);
  const r = await api.explode({ key: { urn, text: 'first own message' } });
  assert.deepEqual(r, { ok: true });
});

// #6
test('#6: a retry after the edit already landed reports done, not not_found', async () => {
  const { doc, api } = setup();
  assert.deepEqual(await api.explode({ key: { urn, text: 'first own message' } }), { ok: true });
  assert.deepEqual(await api.explode({ key: { urn, text: 'first own message' } }), { ok: true });
  assert.equal(edited(doc), 1);
});
