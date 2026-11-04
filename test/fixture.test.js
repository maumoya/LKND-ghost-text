const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'messaging.html'), 'utf8');

test('fixture mirrors the live LinkedIn shape', () => {
  const doc = new JSDOM(html).window.document;
  const all = doc.querySelectorAll('.msg-s-event-listitem');
  const own = doc.querySelectorAll('.msg-s-event-listitem:not(.msg-s-event-listitem--other)');
  assert.equal(all.length, 5);
  assert.equal(own.length, 4);
  for (const el of all) assert.ok(el.getAttribute('data-event-urn').startsWith('urn:li:msg_message:'));
  const dups = [...own].filter((el) => el.querySelector('p.msg-s-event-listitem__body').textContent === 'dup text');
  assert.equal(dups.length, 2);
  assert.ok(doc.querySelector('.msg-form__contenteditable[role="textbox"]'));
  assert.ok(doc.querySelector('.msg-form__send-toggle'));
  assert.equal(doc.querySelector('.msg-form__send-button'), null);
});
