'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  conditionalOvulation,
  relativeOvulationLabels,
  ovulationTodayLabel,
  heroStatus,
  toLocalISO,
  addDays,
  parseLocalDate,
  todayISO
} = require('../app.js');

const REGULAR = [28, 27, 29, 28, 28, 29, 27, 28];
const sum = (a) => a.reduce((x, y) => x + y, 0);

describe('conditionalOvulation', () => {
  it('is a probability distribution over cycle days', () => {
    const p = conditionalOvulation(REGULAR, 10);
    assert.ok(Math.abs(sum(p) - 1) < 1e-9);
    assert.ok(p.every((v) => v >= 0));
  });

  it('peaks near cycle day 15 for a regular 28-day history', () => {
    const p = conditionalOvulation(REGULAR, 9);
    const peak = p.indexOf(Math.max(...p));
    assert.ok(peak >= 14 && peak <= 16);
  });

  it('moves probability later once the period is late', () => {
    const early = conditionalOvulation(REGULAR, 10);
    const late = conditionalOvulation(REGULAR, 22);
    const mean = (p) => p.reduce((a, v, k) => a + v * k, 0);
    assert.ok(mean(late) > mean(early));
  });
});

describe('relativeOvulationLabels', () => {
  const labelsOf = (arr, ws) => {
    const p = [];
    arr.forEach((v, i) => { p[ws + i] = v; });
    return relativeOvulationLabels(p, ws, ws + arr.length - 1).map((x) => x.label);
  };

  it('labels a clear peak high and its tails low', () => {
    assert.deepEqual(labelsOf([0.01, 0.05, 0.3, 0.05, 0.01], 10), ['low', 'low', 'high', 'low', 'low']);
  });

  it('gives identical estimates the same label (all medium)', () => {
    assert.deepEqual(labelsOf([0.05, 0.05, 0.05, 0.05], 10), ['medium', 'medium', 'medium', 'medium']);
  });

  it('keeps near-equal estimates together', () => {
    const l = labelsOf([0.01, 0.218, 0.32, 0.217, 0.07], 10);
    assert.equal(l[1], l[3]);
  });

  it('does not depend on the absolute scale of the estimates', () => {
    const a = labelsOf([0.01, 0.1, 0.3, 0.2, 0.05], 10);
    const b = labelsOf([0.02, 0.2, 0.6, 0.4, 0.1], 10);
    assert.deepEqual(a, b);
  });
});

describe('ovulationTodayLabel / hero', () => {
  const stats = (day) => ({ modelLengths: REGULAR, currentDay: day, peakStart: 9, peakEnd: 17 });

  it('is empty outside the displayed window or without model data', () => {
    assert.equal(ovulationTodayLabel(stats(5)), '');
    assert.equal(ovulationTodayLabel(stats(18)), '');
    assert.equal(ovulationTodayLabel({ currentDay: 12, peakStart: 9, peakEnd: 17 }), '');
    assert.equal(ovulationTodayLabel(null), '');
  });

  it('is high on the peak day and low on the window edge', () => {
    assert.equal(ovulationTodayLabel(stats(15)), 'high chance today');
    assert.equal(ovulationTodayLabel(stats(9)), 'low chance today');
  });

  it('never prints a percentage', () => {
    for (let d = 9; d <= 17; d++) assert.doesNotMatch(ovulationTodayLabel(stats(d)), /%|\d/);
  });

  it('shows the label in the hero tiny line only inside the window', () => {
    const base = {
      ...stats(15),
      nextPeriodISO: toLocalISO(addDays(parseLocalDate(todayISO()), 13)),
      testDateISO: toLocalISO(addDays(parseLocalDate(todayISO()), 20)),
      mostRecentPaused: false,
      pregSinceISO: null
    };
    assert.equal(heroStatus(base).tiny, 'high chance today');
    assert.equal(heroStatus({ ...base, currentDay: 5 }).tiny, '');
  });
});
