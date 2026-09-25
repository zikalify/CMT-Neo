const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { buildCSVContent, parseCSVText, mergePeriods } = require('../app.js');

describe('buildCSVContent', () => {
  it('emits header plus oldest-first rows with Yes/No flags', () => {
    const csv = buildCSVContent([
      { date: '2026-09-01', paused: false, pregnant: true },
      { date: '2026-08-01', paused: false, pregnant: false }
    ]);
    assert.equal(csv, 'Date,Paused,Pregnant\n2026-08-01,No,No\n2026-09-01,No,Yes\n');
  });

  it('emits only the header for an empty list', () => {
    assert.equal(buildCSVContent([]), 'Date,Paused,Pregnant\n');
  });
});

describe('parseCSVText', () => {
  it('parses a well-formed export', () => {
    const { imported, errors } = parseCSVText('Date,Paused,Pregnant\n2026-08-01,No,No\n2026-09-01,No,Yes\n');
    assert.deepEqual(errors, []);
    assert.deepEqual(imported, [
      { date: '2026-08-01', paused: false, pregnant: false },
      { date: '2026-09-01', paused: false, pregnant: true }
    ]);
  });

  it('accepts yes/true/1 in either paused or pregnant columns', () => {
    const { imported } = parseCSVText('Date,Paused,Pregnant\n2026-09-01,Yes,No\n2026-09-02,No,true\n2026-09-03,No,1\n');
    assert.ok(imported.every((p) => p.pregnant === true));
  });

  it('throws on empty input and bad headers', () => {
    assert.throws(() => parseCSVText(''), /file is empty/);
    assert.throws(() => parseCSVText('Foo,Bar\n2026-09-01,x\n'), /need Date,Paused/);
  });

  it('collects per-line date errors without throwing', () => {
    const { imported, errors } = parseCSVText('Date,Paused,Pregnant\nnot-a-date,No,No\n2026-09-01,No,No\n');
    assert.deepEqual(errors, [2]);
    assert.deepEqual(imported.map((p) => p.date), ['2026-09-01']);
  });

  it('skips blank lines', () => {
    const { imported } = parseCSVText('Date,Paused,Pregnant\n\n2026-09-01,No,No\n\n');
    assert.equal(imported.length, 1);
  });
});

describe('mergePeriods', () => {
  it('overwrites same-date entries and appends new ones', () => {
    const merged = mergePeriods(
      [{ date: '2026-09-01', paused: false, pregnant: false }],
      [
        { date: '2026-09-01', paused: false, pregnant: true },
        { date: '2026-09-02', paused: false, pregnant: false }
      ]
    );
    assert.equal(merged.length, 2);
    assert.equal(merged.find((p) => p.date === '2026-09-01').pregnant, true);
  });
});

describe('csv round-trip', () => {
  it('build -> parse preserves dates and flags', () => {
    const periods = [
      { date: '2026-07-04', paused: false, pregnant: false },
      { date: '2026-08-01', paused: false, pregnant: true }
    ];
    const { imported } = parseCSVText(buildCSVContent(periods));
    assert.deepEqual(imported.map((p) => p.date), periods.map((p) => p.date));
    assert.deepEqual(imported.map((p) => p.pregnant), [false, true]);
  });
});
