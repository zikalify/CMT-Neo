const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { hexToRgb, mix } = require('../app.js');

describe('hexToRgb', () => {
  it('parses primary colors', () => {
    assert.deepEqual(hexToRgb('#ff0000'), { r: 255, g: 0, b: 0 });
    assert.deepEqual(hexToRgb('#00ff00'), { r: 0, g: 255, b: 0 });
    assert.deepEqual(hexToRgb('#0000ff'), { r: 0, g: 0, b: 255 });
  });
});

describe('mix', () => {
  it('returns first color at t=0 and second at t=1', () => {
    assert.equal(mix('#ff3fa4', '#a855f7', 0), '#ff3fa4');
    assert.equal(mix('#ff3fa4', '#a855f7', 1), '#a855f7');
  });

  it('blends black and white to gray at t=0.5', () => {
    assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  });
});
