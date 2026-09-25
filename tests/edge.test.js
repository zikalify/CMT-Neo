const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseLocalDate,
  toLocalISO,
  addDays,
  diffDays,
  computeStats,
  normalizeDate
} = require('../app.js');

describe('calendar edge cases', () => {
  it('handles leap day round-trips', () => {
    assert.equal(toLocalISO(parseLocalDate('2024-02-29')), '2024-02-29');
    assert.equal(diffDays('2024-02-28', '2024-02-29'), 1);
    assert.equal(toLocalISO(addDays(parseLocalDate('2024-02-28'), 1)), '2024-02-29');
  });

  it('handles year boundaries and DST-adjacent days', () => {
    assert.equal(toLocalISO(addDays(parseLocalDate('2025-12-31'), 1)), '2026-01-01');
    assert.equal(diffDays('2025-12-31', '2026-01-01'), 1);
    // spring-forward weekend (US 2026-03-08): pure date math stays whole-day
    assert.equal(diffDays('2026-03-07', '2026-03-09'), 2);
  });

  it('supports very short and very long cycles without crashing', () => {
    const mk = (gaps) => {
      let cursor = parseLocalDate('2026-09-25');
      const dates = [toLocalISO(cursor)];
      for (let i = gaps.length - 1; i >= 0; i--) {
        cursor = addDays(cursor, -gaps[i]);
        dates.push(toLocalISO(cursor));
      }
      return dates.map((date) => ({ date, paused: false, pregnant: false }));
    };
    const short = computeStats(mk([18, 19, 18]));
    assert.ok(short.peakStart <= short.peakEnd);
    const long = computeStats(mk([45, 50, 44]));
    assert.ok(long.peakStart <= long.peakEnd);
    assert.ok(long.median >= 40);
  });
});

describe('normalizeDate edge cases', () => {
  it('parses Feb 29 on leap years', () => {
    assert.equal(normalizeDate('02/29/2024'), '2024-02-29');
  });

  it('rejects impossible dates but falls back to DD/MM when valid', () => {
    assert.equal(normalizeDate('02/30/2026'), null);
    assert.equal(normalizeDate('13/13/2026'), null);
    // month 13 is invalid as MM/DD, so the parser tries DD/MM -> Jan 13
    assert.equal(normalizeDate('13/01/2026'), '2026-01-13');
  });

  it('parses single-digit ISO segments', () => {
    assert.equal(normalizeDate('2026-9-5'), '2026-09-05');
  });
});
