const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFixture } = require('./helpers.js');
const R = require('../extension/lib/ring.js');

test('ringFraction clamps to [0,1]', () => {
  assert.equal(R.ringFraction(0, 0, 20000), 1);
  assert.equal(R.ringFraction(10000, 0, 20000), 0.5);
  assert.equal(R.ringFraction(25000, 0, 20000), 0);
  assert.equal(R.ringFraction(-5, 0, 20000), 1);
});

test('makeRing returns svg.lb-ring', () => {
  const svg = R.makeRing(loadFixture(), 0.5);
  assert.equal(svg.tagName.toLowerCase(), 'svg');
  assert.ok(svg.classList.contains('lb-ring'));
});
