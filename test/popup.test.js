const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { render, left } = require('../extension/popup.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'extension', 'popup.html'), 'utf8');
const doc = () => new JSDOM(html).window.document; // scripts never run here

const bombs = {
  a: { id: 'a', status: 'pending', fireAt: 65000, key: { text: 'hi\nThis message will self-destruct in 1 minute. 💣' } },
  b: { id: 'b', status: 'failed', reason: 'ambiguous', endedAt: 5, key: { text: '<img src=x onerror=alert(1)>' } },
  c: { id: 'c', status: 'done', endedAt: 6, key: { text: 'gone' } },
};

test('countdown format', () => {
  assert.equal(left(20000), '20s');
  assert.equal(left(65000), '1m 05s');
  assert.equal(left(-5), '0s');
});

test('pending row with countdown and cancel; failed row with reason; done hidden', () => {
  const d = doc();
  const cancelled = [];
  render(d, bombs, 0, (id) => cancelled.push(id));
  const p = d.querySelectorAll('#pending li.bomb');
  assert.equal(p.length, 1);
  assert.equal(p[0].querySelector('.txt').textContent, 'hi');
  assert.equal(p[0].querySelector('.when').textContent, '1m 05s');
  p[0].querySelector('button').click();
  assert.deepEqual(cancelled, ['a']);
  const e = d.querySelectorAll('#ended li.bomb');
  assert.equal(e.length, 1);
  assert.equal(e[0].querySelector('.reason').textContent, 'failed: ambiguous');
  assert.equal(d.querySelector('#ended img'), null); // text only, no markup injection
});

test('empty state disables the kill switch', () => {
  const d = doc();
  render(d, {}, 0, () => {});
  assert.equal(d.getElementById('cancelAll').disabled, true);
  assert.match(d.getElementById('pending').textContent, /No bombs ticking/);
});

test('popup shows the honest limits', () => {
  const t = doc().body.textContent;
  for (const s of ['screenshots', 'only while Chrome is open', '55 minutes', 'Edited', 'never guesses']) assert.ok(t.includes(s), s);
});
