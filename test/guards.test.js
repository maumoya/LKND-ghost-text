const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EXT = path.join(__dirname, '..', 'extension');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return files(p);
    return /\.(js|html|json|css)$/.test(d.name) ? [p] : [];
  });
}

// The SVG namespace is an identifier, not a request.
const SVG_NS = 'http://www.w3.org/2000/svg';
const NET = /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|https?:\/\/(?!www\.linkedin\.com\/messaging)/;

test('no network calls or remote URLs anywhere in the extension', () => {
  const all = files(EXT);
  assert.ok(all.length >= 8);
  for (const f of all) {
    const src = fs.readFileSync(f, 'utf8').split(SVG_NS).join('');
    assert.doesNotMatch(src, NET, f);
  }
});

test('never touches cookies', () => {
  for (const f of files(EXT)) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /document\.cookie|chrome\.cookies/, f);
});

test('manifest permissions are exactly storage, alarms, tabs on messaging only', () => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions, ['storage', 'alarms', 'tabs']);
  assert.deepEqual(m.host_permissions, ['https://www.linkedin.com/messaging/*']);
  for (const bad of ['cookies', 'webRequest', 'scripting', '<all_urls>']) {
    assert.ok(!JSON.stringify(m).includes(bad), bad);
  }
  assert.deepEqual(m.content_scripts[0].matches, ['https://www.linkedin.com/messaging/*']);
  assert.deepEqual(m.content_scripts[0].js, ['lib/timers.js', 'lib/bombs.js', 'lib/ring.js', 'lib/dom.js', 'content.js']);
  assert.equal(m.background.service_worker, 'background.js');
  assert.equal(m.action.default_popup, 'popup.html');
});

test('every file the manifest names exists', () => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const named = [m.background.service_worker, m.action.default_popup, ...m.content_scripts[0].js, ...Object.values(m.icons)];
  for (const f of named) assert.ok(fs.existsSync(path.join(EXT, f)), f);
});
