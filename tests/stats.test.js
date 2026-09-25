const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  computeStats,
  parseLocalDate,
  toLocalISO,
  addDays,
  diffDays,
  todayISO
} = require('../app.js');

function isoDaysAgo(n) {
  return toLocalISO(addDays(new Date(), -n));
}

describe('computeStats', () => {
  it('returns null with no periods', () => {
    assert.equal(computeStats([]), null);
  });

  it('handles a single period with 28-day defaults', () => {
    const ref = isoDaysAgo(5);
    const stats = computeStats([{ date: ref, paused: false, pregnant: false }]);
    assert.equal(stats.totalCycles, 1);
    assert.equal(stats.median, 28);
    assert.equal(stats.peakStart, 10);
    assert.equal(stats.peakEnd, 17);
    assert.equal(stats.currentDay, 6);
    assert.equal(stats.mostRecentPaused, false);
    assert.equal(stats.pregSinceISO, null);
    assert.equal(stats.lastDateISO, ref);
    assert.equal(stats.nextPeriodISO, toLocalISO(addDays(parseLocalDate(ref), 28)));
    assert.equal(stats.testDateISO, toLocalISO(addDays(parseLocalDate(ref), 17 + 14 - 1)));
  });

  it('computes a regular 28-day history', () => {
    const periods = [56, 28, 0].map((ago) => ({
      date: isoDaysAgo(ago),
      paused: false,
      pregnant: false
    }));
    const stats = computeStats(periods);
    assert.equal(stats.totalCycles, 3);
    assert.equal(stats.shortest, 28);
    assert.equal(stats.longest, 28);
    assert.equal(stats.median, 28);
    assert.equal(stats.stability, 'Regular');
    assert.equal(stats.peakStart, 10);
    assert.equal(stats.peakEnd, 17);
    // most recent period was today -> cycle day 1
    assert.equal(stats.currentDay, 1);
    assert.equal(stats.nextPeriodISO, toLocalISO(addDays(parseLocalDate(isoDaysAgo(0)), 28)));
  });

  it('flags irregular cycles and keeps fertile window ordered', () => {
    // gaps of 28, 35, 24, 33, 25 days -> range 11 -> irregular
    const gaps = [28, 35, 24, 33, 25];
    const dates = [];
    let cursor = parseLocalDate(isoDaysAgo(0));
    dates.push(toLocalISO(cursor));
    for (let i = gaps.length - 1; i >= 0; i--) {
      cursor = addDays(cursor, -gaps[i]);
      dates.push(toLocalISO(cursor));
    }
    const periods = dates.map((date) => ({ date, paused: false, pregnant: false }));
    const stats = computeStats(periods);
    assert.equal(stats.stability, 'Irregular');
    assert.equal(stats.shortest, 24);
    assert.equal(stats.longest, 35);
    assert.ok(stats.peakStart <= stats.peakEnd);
    assert.ok(stats.median >= 24 && stats.median <= 35);
  });

  it('returns null currentDay when most recent entry is paused', () => {
    const stats = computeStats([
      { date: isoDaysAgo(30), paused: false, pregnant: false },
      { date: isoDaysAgo(0), paused: true, pregnant: false }
    ]);
    assert.equal(stats.currentDay, null);
    assert.equal(stats.mostRecentPaused, true);
  });

  it('tracks pregnancy from the most recent entry', () => {
    const pregDate = isoDaysAgo(10);
    const refDate = isoDaysAgo(40);
    const stats = computeStats([
      { date: refDate, paused: false, pregnant: false },
      { date: pregDate, paused: false, pregnant: true }
    ]);
    assert.equal(stats.pregSinceISO, pregDate);
    assert.equal(stats.currentDay, null);
    // single-valid-entry branch anchors lastDate on the valid ref date
    assert.equal(stats.lastDateISO, refDate);
  });

  it('uses 28-day defaults for a lone pregnant entry', () => {
    const pregDate = isoDaysAgo(0);
    const stats = computeStats([{ date: pregDate, paused: false, pregnant: true }]);
    assert.equal(stats.median, 28);
    assert.equal(stats.currentDay, null);
    assert.equal(stats.pregSinceISO, pregDate);
  });

  it('derives currentDay from most recent period', () => {
    const stats = computeStats([
      { date: isoDaysAgo(28), paused: false, pregnant: false },
      { date: isoDaysAgo(0), paused: false, pregnant: false }
    ]);
    assert.equal(stats.currentDay, 1);
    assert.equal(diffDays(stats.lastDateISO, todayISO()) + 1, stats.currentDay);
  });
});
