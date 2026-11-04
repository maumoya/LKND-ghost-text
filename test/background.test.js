const test = require('node:test');
const assert = require('node:assert/strict');
const { fakeChrome } = require('./fake-chrome.js');
const { makeBackground } = require('../extension/background.js');
const B = require('../extension/lib/bombs.js');

const URL = 'https://www.linkedin.com/messaging/thread/ABC/';
const MIN = 60e3;
const opts = (now) => ({ now: () => now, sleep: async () => {} });

function bombAt(sentAt, seconds = 20) {
  return B.newBomb({ conversationUrl: URL, key: { urn: 'u1', text: 'hi' }, sentAt, seconds });
}

async function armed(bg, b) { await bg.handleMessage({ type: 'arm', bomb: b }); return b; }

test('arm stores the bomb and creates one alarm at fireAt', async () => {
  const c = fakeChrome(); const bg = makeBackground(c, opts(0));
  const b = await armed(bg, bombAt(0));
  assert.equal(c._alarms.size, 1);
  assert.equal(c._alarms.get(b.id).when, b.fireAt);
  assert.equal((await bg.getBombs())[b.id].status, 'pending');
});

test('onAlarm with the chat open explodes in that tab, no new tab', async () => {
  const c = fakeChrome({ tabs: [{ id: 7, url: URL + '?x=1', status: 'complete' }] });
  const bg = makeBackground(c, opts(20e3));
  const b = await armed(bg, bombAt(0));
  await bg.onAlarm(b.id);
  assert.deepEqual(c._sent.map((s) => [s.tabId, s.msg.type]), [[7, 'explode']]);
  assert.equal(c._created.length, 0);
  assert.equal((await bg.getBombs())[b.id].status, 'done');
});

test('onAlarm with no tab opens a background tab and closes it after', async () => {
  const c = fakeChrome(); const bg = makeBackground(c, opts(20e3));
  const b = await armed(bg, bombAt(0));
  await bg.onAlarm(b.id);
  assert.equal(c._created.length, 1);
  assert.equal(c._created[0].active, false);
  assert.equal(c._created[0].url, URL);
  assert.deepEqual(c._removed, [c._created[0].id]);
  assert.equal((await bg.getBombs())[b.id].status, 'done');
});

test('second fire is a no-op', async () => {
  const c = fakeChrome({ tabs: [{ id: 7, url: URL, status: 'complete' }] });
  const bg = makeBackground(c, opts(20e3));
  const b = await armed(bg, bombAt(0));
  await bg.handleMessage({ type: 'fireNow', id: b.id });
  await bg.onAlarm(b.id);
  assert.equal(c._sent.length, 1);
});

test('concurrent fireNow and alarm explode only once', async () => {
  const c = fakeChrome({ tabs: [{ id: 7, url: URL, status: 'complete' }] });
  const bg = makeBackground(c, opts(20e3));
  const b = await armed(bg, bombAt(0));
  await Promise.all([bg.handleMessage({ type: 'fireNow', id: b.id }), bg.onAlarm(b.id)]);
  assert.equal(c._sent.length, 1);
});

test('startup: 54 min fires, 56 min is missed with badge', async () => {
  const now = 100 * MIN;
  const c = fakeChrome({ tabs: [{ id: 7, url: URL, status: 'complete' }] });
  const bg = makeBackground(c, opts(now));
  const fire = await armed(bg, bombAt(now - 54 * MIN, 1800));
  const miss = await armed(bg, bombAt(now - 56 * MIN, 1800));
  await bg.onStartup();
  const all = await bg.getBombs();
  assert.equal(all[fire.id].status, 'done');
  assert.equal(all[miss.id].status, 'missed');
  assert.equal(c._sent.length, 1);
  assert.equal(c.badge, '1');
});

test('startup re-creates alarms for future pending bombs', async () => {
  const c = fakeChrome(); const bg = makeBackground(c, opts(5e3));
  const b = await armed(bg, bombAt(0, 300));
  c._alarms.clear();
  await bg.onStartup();
  assert.equal(c._alarms.get(b.id).when, b.fireAt);
  assert.equal(c._sent.length, 0);
});

test('cancelAll clears alarms and cancels pending; cancelled bomb never fires', async () => {
  const c = fakeChrome({ tabs: [{ id: 7, url: URL, status: 'complete' }] });
  const bg = makeBackground(c, opts(0));
  const a = await armed(bg, bombAt(0)); const b = await armed(bg, bombAt(0, 60));
  await bg.handleMessage({ type: 'cancelAll' });
  assert.equal(c._alarms.size, 0);
  const all = await bg.getBombs();
  assert.equal(all[a.id].status, 'cancelled');
  assert.equal(all[b.id].status, 'cancelled');
  await bg.onAlarm(a.id);
  assert.equal(c._sent.length, 0);
});

test('cancel one bomb', async () => {
  const c = fakeChrome(); const bg = makeBackground(c, opts(0));
  const a = await armed(bg, bombAt(0));
  await bg.handleMessage({ type: 'cancel', id: a.id });
  assert.equal((await bg.getBombs())[a.id].status, 'cancelled');
  assert.equal(c._alarms.has(a.id), false);
});

test('explode failure marks failed with reason and raises the badge', async () => {
  const c = fakeChrome({ tabs: [{ id: 7, url: URL, status: 'complete' }], explodeReply: { ok: false, reason: 'ambiguous' } });
  const bg = makeBackground(c, opts(20e3));
  const b = await armed(bg, bombAt(0));
  await bg.onAlarm(b.id);
  const got = (await bg.getBombs())[b.id];
  assert.equal(got.status, 'failed');
  assert.equal(got.reason, 'ambiguous');
  assert.equal(c.badge, '1');
});

test('content script never answers: failed, not stuck pending; created tab closed', async () => {
  const c = fakeChrome();
  c.tabs.sendMessage = async () => { throw new Error('Receiving end does not exist'); };
  const bg = makeBackground(c, opts(20e3));
  const b = await armed(bg, bombAt(0));
  await bg.onAlarm(b.id);
  const got = (await bg.getBombs())[b.id];
  assert.equal(got.status, 'failed');
  assert.equal(got.reason, 'no_content_script');
  assert.equal(c._removed.length, 1);
});

test('popup open resets the badge', async () => {
  const c = fakeChrome({ tabs: [{ id: 7, url: URL, status: 'complete' }], explodeReply: { ok: false, reason: 'not_found' } });
  let now = 20e3;
  const bg = makeBackground(c, { now: () => now, sleep: async () => {} });
  const b = await armed(bg, bombAt(0));
  await bg.onAlarm(b.id);
  assert.equal(c.badge, '1');
  now += 1;
  await bg.handleMessage({ type: 'popupOpened' });
  assert.equal(c.badge, '');
});
