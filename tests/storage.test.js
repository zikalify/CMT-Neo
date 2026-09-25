const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { installFakeBrowser } = require('./helpers/fake-browser');

const app = require('../app.js');

const browser = installFakeBrowser();

function seed(periods) {
  browser.localStorage.clear();
  app.state.periods = [];
  app.state.stats = null;
  if (periods) {
    browser.localStorage.setItem(app.STORE_KEY, JSON.stringify(periods));
    app.state.periods = JSON.parse(JSON.stringify(periods));
  }
  for (const el of browser.document._els.values()) {
    el.textContent = '';
    el.innerHTML = '';
  }
}

describe('storage: getPeriods/savePeriods', () => {
  beforeEach(() => seed());

  it('returns [] when nothing is stored', () => {
    assert.deepEqual(app.getPeriods(), []);
  });

  it('returns [] on corrupt JSON instead of throwing', () => {
    browser.localStorage.setItem(app.STORE_KEY, '{nope');
    assert.deepEqual(app.getPeriods(), []);
  });

  it('savePeriods persists newest-first', () => {
    app.savePeriods([
      { date: '2026-08-01', paused: false, pregnant: false },
      { date: '2026-09-01', paused: false, pregnant: false },
      { date: '2026-07-01', paused: false, pregnant: false }
    ]);
    const stored = JSON.parse(browser.localStorage.getItem(app.STORE_KEY));
    assert.deepEqual(stored.map((p) => p.date), ['2026-09-01', '2026-08-01', '2026-07-01']);
  });
});

describe('storage: logPeriod', () => {
  beforeEach(() => seed());

  it('ignores empty input', () => {
    app.state.periods = [];
    app.logPeriod('');
    app.logPeriod(null);
    assert.equal(app.state.periods.length, 0);
  });

  it('logs a new period', () => {
    app.state.periods = [];
    app.logPeriod('2026-09-25');
    assert.ok(app.state.periods.some((p) => p.date === '2026-09-25'));
  });

  it('rejects duplicates without growing the list', () => {
    app.state.periods = [{ date: '2026-09-25', paused: false, pregnant: false }];
    app.logPeriod('2026-09-25');
    assert.equal(app.state.periods.length, 1);
  });
});

describe('storage: updatePeriod', () => {
  beforeEach(() => seed());

  it('renames a date', () => {
    app.state.periods = [{ date: '2026-09-20', paused: false, pregnant: false }];
    assert.equal(app.updatePeriod('2026-09-20', '2026-09-21'), true);
    assert.ok(app.state.periods.some((p) => p.date === '2026-09-21'));
  });

  it('refuses to collide with an existing date', () => {
    app.state.periods = [
      { date: '2026-09-20', paused: false, pregnant: false },
      { date: '2026-09-21', paused: false, pregnant: false }
    ];
    assert.equal(app.updatePeriod('2026-09-20', '2026-09-21'), false);
    assert.equal(app.state.periods.length, 2);
  });
});

describe('storage: deletePeriod', () => {
  beforeEach(() => seed());

  it('removes the entry', () => {
    app.state.periods = [
      { date: '2026-09-20', paused: false, pregnant: false },
      { date: '2026-09-21', paused: false, pregnant: false }
    ];
    app.deletePeriod('2026-09-20');
    assert.deepEqual(app.state.periods.map((p) => p.date), ['2026-09-21']);
  });

  it('is a no-op for unknown dates', () => {
    app.state.periods = [{ date: '2026-09-21', paused: false, pregnant: false }];
    app.deletePeriod('2026-01-01');
    assert.equal(app.state.periods.length, 1);
  });
});

describe('storage: togglePregnant', () => {
  beforeEach(() => seed());

  it('flips the pregnant flag on and off', () => {
    app.state.periods = [{ date: '2026-09-21', paused: false, pregnant: false }];
    app.togglePregnant('2026-09-21');
    assert.equal(app.state.periods[0].pregnant, true);
    app.togglePregnant('2026-09-21');
    assert.equal(app.state.periods[0].pregnant, false);
  });
});
