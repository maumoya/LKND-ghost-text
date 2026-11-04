const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'messaging.html'), 'utf8');

// Fresh fixture document per call. Fixture only, never remote content.
function loadFixture() {
  return new JSDOM(html, { runScripts: 'outside-only' }).window.document;
}

module.exports = { loadFixture };
