const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  PALETTES,
  GESTATION_DAYS,
  phaseOfDay,
  phasePalette,
  heroStatus,
  toLocalISO,
  addDays,
  parseLocalDate,
  todayISO
} = require('../app.js');

function baseStats(overrides = {}) {
  const today = todayISO();
  return {
    currentDay: 5,
    peakStart: 10,
    peakEnd: 17,
    nextPeriodISO: toLocalISO(addDays(parseLocalDate(today), 20)),
    testDateISO: toLocalISO(addDays(parseLocalDate(today), 25)),
    mostRecentPaused: false,
    pregSinceISO: null,
    ...overrides
  };
}

describe('phaseOfDay', () => {
  it('is follicular before the fertile window', () => {
    assert.equal(phaseOfDay({ currentDay: 9, peakStart: 10, peakEnd: 17 }), 'follicular');
  });

  it('is fertile inside the window (inclusive)', () => {
    assert.equal(phaseOfDay({ currentDay: 10, peakStart: 10, peakEnd: 17 }), 'fertile');
    assert.equal(phaseOfDay({ currentDay: 17, peakStart: 10, peakEnd: 17 }), 'fertile');
  });

  it('is luteal after the window', () => {
    assert.equal(phaseOfDay({ currentDay: 18, peakStart: 10, peakEnd: 17 }), 'luteal');
  });
});

describe('phasePalette', () => {
  it('resolves the fertile palette', () => {
    assert.equal(phasePalette('fertile'), PALETTES.fertile);
  });

  it('falls back to empty for unknown keys', () => {
    assert.equal(phasePalette('nope'), PALETTES.empty);
    assert.equal(phasePalette('paused'), PALETTES.empty);
  });

  it('names the fertile phase "Ovulation window"', () => {
    assert.equal(PALETTES.fertile.name, 'Ovulation window');
  });
});

describe('heroStatus', () => {
  it('prompts to log when there are no stats', () => {
    assert.deepEqual(heroStatus(null), { badge: '', big: '–', label: 'log a period', tiny: '' });
    assert.deepEqual(heroStatus({ currentDay: null }), {
      badge: '',
      big: '–',
      label: 'log a period',
      tiny: ''
    });
  });

  it('shows paused state', () => {
    assert.deepEqual(heroStatus(baseStats({ mostRecentPaused: true, currentDay: null })), {
      badge: 'paused',
      big: '--',
      label: 'tracking paused',
      tiny: ''
    });
  });

  it('counts down to the fertile window', () => {
    const s = heroStatus(baseStats({ currentDay: 8 }));
    assert.equal(s.badge, 'follicular');
    assert.equal(s.big, '2');
    assert.equal(s.label, 'days to fertile');
    const singular = heroStatus(baseStats({ currentDay: 9 }));
    assert.equal(singular.big, '1');
    assert.equal(singular.label, 'day to fertile');
  });

  it('labels the fertile phase "ovulation window"', () => {
    const s = heroStatus(baseStats({ currentDay: 10 }));
    assert.equal(s.badge, 'ovulation window');
    assert.equal(s.big, '8');
    assert.equal(s.label, 'fertile days left');

    const lastDay = heroStatus(baseStats({ currentDay: 17 }));
    assert.equal(lastDay.badge, 'ovulation window');
    assert.equal(lastDay.big, '1');
    assert.equal(lastDay.label, 'fertile day left');
  });

  it('never uses the bare "ovulation" badge', () => {
    for (const day of [10, 12, 17]) {
      assert.notEqual(heroStatus(baseStats({ currentDay: day })).badge, 'ovulation');
    }
  });

  it('shows luteal countdown to period', () => {
    const today = todayISO();
    const s = heroStatus(
      baseStats({
        currentDay: 25,
        nextPeriodISO: toLocalISO(addDays(parseLocalDate(today), 3)),
        testDateISO: toLocalISO(addDays(parseLocalDate(today), -1))
      })
    );
    assert.equal(s.badge, 'luteal');
    assert.equal(s.big, '3');
    assert.equal(s.label, 'days to period');
    assert.match(s.tiny, /not fertile/);
  });

  it('flags overdue cycles', () => {
    const today = todayISO();
    const s = heroStatus(
      baseStats({
        currentDay: 40,
        nextPeriodISO: toLocalISO(addDays(parseLocalDate(today), -2)),
        testDateISO: toLocalISO(addDays(parseLocalDate(today), -5))
      })
    );
    assert.equal(s.badge, 'luteal');
    assert.equal(s.big, '!');
    assert.equal(s.label, 'overdue');
  });

  it('counts down to the due date when pregnant', () => {
    const pregSince = toLocalISO(addDays(parseLocalDate(todayISO()), -(GESTATION_DAYS - 270)));
    const s = heroStatus({ pregSinceISO: pregSince });
    assert.equal(s.badge, 'pregnant');
    assert.equal(s.big, '270');
    assert.equal(s.label, 'days to due date');
  });

  it('handles due today and past-due pregnancy', () => {
    const dueToday = toLocalISO(addDays(parseLocalDate(todayISO()), -GESTATION_DAYS));
    assert.equal(heroStatus({ pregSinceISO: dueToday }).label, 'due today');

    const pastDue = toLocalISO(addDays(parseLocalDate(todayISO()), -(GESTATION_DAYS + 5)));
    assert.equal(heroStatus({ pregSinceISO: pastDue }).label, 'past due date');
  });
});
