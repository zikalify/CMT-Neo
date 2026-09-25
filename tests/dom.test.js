const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { installFakeBrowser } = require('./helpers/fake-browser');

const app = require('../app.js');

const browser = installFakeBrowser();

function reset(periods) {
  browser.localStorage.clear();
  if (periods) browser.localStorage.setItem(app.STORE_KEY, JSON.stringify(periods));
  app.state.periods = [];
  app.state.stats = null;
  for (const el of browser.document._els.values()) {
    el.textContent = '';
    el.innerHTML = '';
    el.value = '';
    el.max = '';
  }
}

function el(sel) {
  return browser.document._els.get(sel);
}

describe('load() integration', () => {
  beforeEach(() => reset());

  it('shows the empty state with no periods', () => {
    app.load();
    assert.deepEqual(app.state.periods, []);
    assert.equal(app.state.stats, null);
    assert.equal(el('#heroLabel').textContent, 'log a period');
    assert.match(el('#historyList').innerHTML, /nothing yet/);
  });

  it('drives the hero badge from real stats (ovulation window)', () => {
    // single period 12 days ago -> currentDay 13 -> inside [10,17]
    const d = new Date();
    d.setDate(d.getDate() - 12);
    const iso = app.toLocalISO(d);
    reset([{ date: iso, paused: false, pregnant: false }]);
    app.load();
    assert.equal(app.state.stats.currentDay, 13);
    assert.equal(el('#phaseBadge').textContent, 'ovulation window');
    assert.match(el('#historyList').innerHTML, new RegExp(String(d.getFullYear())));
  });

  it('migrates legacy paused entries to unpaused', () => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    reset([{ date: app.toLocalISO(d), paused: true, pregnant: false }]);
    app.load();
    assert.ok(app.state.periods.every((p) => p.paused === false));
    const stored = JSON.parse(browser.localStorage.getItem(app.STORE_KEY));
    assert.ok(stored.every((p) => p.paused === false));
  });

  it(' caps the log date input at today', () => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    reset([{ date: app.toLocalISO(d), paused: false, pregnant: false }]);
    app.load();
    assert.equal(el('#logDate').max, app.todayISO());
    assert.equal(el('#logDate').value, app.todayISO());
  });
});
