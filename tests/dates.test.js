const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseLocalDate,
  toLocalISO,
  addDays,
  diffDays,
  todayISO,
  fmtShort,
  normalizeDate
} = require('../app.js');

describe('date utils', () => {
  it('parseLocalDate parses YYYY-MM-DD without UTC shift', () => {
    const d = parseLocalDate('2026-09-25');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 8);
    assert.equal(d.getDate(), 25);
  });

  it('toLocalISO round-trips parseLocalDate', () => {
    assert.equal(toLocalISO(parseLocalDate('2026-01-05')), '2026-01-05');
    assert.equal(toLocalISO(parseLocalDate('2026-12-31')), '2026-12-31');
  });

  it('toLocalISO zero-pads month and day', () => {
    assert.equal(toLocalISO(new Date(2026, 0, 5)), '2026-01-05');
  });

  it('addDays crosses month boundaries', () => {
    assert.equal(toLocalISO(addDays(parseLocalDate('2026-01-31'), 1)), '2026-02-01');
    assert.equal(toLocalISO(addDays(parseLocalDate('2026-09-25'), -25)), '2026-08-31');
  });

  it('diffDays measures whole-day differences', () => {
    assert.equal(diffDays('2026-09-01', '2026-09-01'), 0);
    assert.equal(diffDays('2026-09-01', '2026-09-02'), 1);
    assert.equal(diffDays('2026-09-01', '2026-09-29'), 28);
  });

  it('todayISO returns local YYYY-MM-DD', () => {
    assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
    const now = new Date();
    const expected = toLocalISO(now);
    assert.equal(todayISO(), expected);
  });

  it('fmtShort formats like "Sep 25"', () => {
    const s = fmtShort('2026-09-25');
    assert.match(s, /Sep/);
    assert.match(s, /25/);
  });
});

describe('normalizeDate', () => {
  it('accepts ISO dates', () => {
    assert.equal(normalizeDate('2026-09-25'), '2026-09-25');
    assert.equal(normalizeDate('2026-9-5'), '2026-09-05');
  });

  it('accepts US MM/DD/YYYY', () => {
    assert.equal(normalizeDate('09/25/2026'), '2026-09-25');
  });

  it('returns null for garbage', () => {
    assert.equal(normalizeDate('not a date'), null);
  });
});
