const STORE_KEY = 'cmt.neo.periods.v1';

const PALETTES = {
    follicular: { name: 'Follicular', bg: '#120b06', bg2: '#2a1608', a: '#ff9f43', b: '#ffd166', glow: 'rgba(255,159,67,0.4)' },
    fertile: { name: 'Ovulation window', bg: '#160819', bg2: '#340f40', a: '#ff3fa4', b: '#a855f7', glow: 'rgba(255,63,164,0.45)' },
    luteal: { name: 'Luteal', bg: '#07101a', bg2: '#0d2a48', a: '#38c6ff', b: '#7c6bff', glow: 'rgba(56,198,255,0.38)' },
    pregnant: { name: 'Pregnant', bg: '#0a140f', bg2: '#0e2f22', a: '#4ade80', b: '#22d3ee', glow: 'rgba(74,222,128,0.4)' },
    empty: { name: 'Getting started', bg: '#0c0814', bg2: '#1d1030', a: '#b78dff', b: '#ff7ac2', glow: 'rgba(183,141,255,0.42)' }
};

const GESTATION_DAYS = 280;

const state = {
    periods: [],
    stats: null,
    editingDate: null
};

const $ = (sel) => document.querySelector(sel);

function getPeriods() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}

function savePeriods(periods) {
    const sorted = periods.slice().sort((a, b) => parseLocalDate(b.date) - parseLocalDate(a.date));
    localStorage.setItem(STORE_KEY, JSON.stringify(sorted));
    load();
}

function parseLocalDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function toLocalISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function diffDays(a, b) {
    return Math.round((parseLocalDate(b) - parseLocalDate(a)) / 86400000);
}

function todayISO() {
    return toLocalISO(new Date());
}

function fmtShort(iso) {
    return parseLocalDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16)
    };
}

function mix(hexA, hexB, t) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    const c = [
        Math.round(a.r + (b.r - a.r) * t),
        Math.round(a.g + (b.g - a.g) * t),
        Math.round(a.b + (b.b - a.b) * t)
    ];
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Ovulation-day estimate from period dates only (experimental, not validated
// against ovulation ground truth). Assumptions: cycle length = ovulation day +
// luteal phase; luteal phase ~ discrete normal(13, 1.8) truncated to 6..20 days;
// ovulation-day spread = past cycle-length spread minus luteal spread (floored),
// recency-weighted (half-life 6 cycles) with one pseudo-cycle (mean 29, sd 4.5).
// ---------------------------------------------------------------------------
const OV_MODEL = {
    lutealMean: 13,
    lutealSd: 1.8,
    priorMean: 29,
    priorSd: 4.5,
    priorWeight: 1,
    halfLife: 6,
    minOvSd: 1.5,
    maxDay: 70
};
const OV_FLAT = 0.2;
const OV_GAP = 0.06;
const OV_SPAN = 0.15;

function normalPdf(x, m, s) {
    return Math.exp(-0.5 * Math.pow((x - m) / s, 2)) / (s * Math.sqrt(2 * Math.PI));
}

function lutealPmf() {
    const pmf = {};
    let z = 0;
    for (let l = 6; l <= 20; l++) {
        pmf[l] = normalPdf(l, OV_MODEL.lutealMean, OV_MODEL.lutealSd);
        z += pmf[l];
    }
    for (const l in pmf) pmf[l] /= z;
    return pmf;
}

// lengths: completed cycle lengths, oldest to newest.
function ovulationPmf(lengths) {
    const o = OV_MODEL;
    const n = lengths.length;
    const w = lengths.map((_, i) => Math.pow(0.5, (n - 1 - i) / o.halfLife));
    const sw = w.reduce((a, b) => a + b, 0);
    const neff = n ? (sw * sw) / w.reduce((a, b) => a + b * b, 0) : 0;
    const m = n ? lengths.reduce((a, c, i) => a + w[i] * c, 0) / sw : o.priorMean;
    let s2 = n >= 2
        ? (lengths.reduce((a, c, i) => a + w[i] * Math.pow(c - m, 2), 0) / sw) * (neff / Math.max(neff - 1, 1))
        : o.priorSd * o.priorSd;
    s2 = (neff * s2 + o.priorWeight * o.priorSd * o.priorSd) / (neff + o.priorWeight);
    const varO = Math.max(s2 - o.lutealSd * o.lutealSd, o.minOvSd * o.minOvSd);
    const sorted = lengths.slice().sort((a, b) => a - b);
    const q = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
    const iqrSd = sorted.length >= 4 ? (q(0.75) - q(0.25)) / 1.34 : Math.sqrt(s2);
    const spread = Math.max(Math.min(Math.sqrt(s2), iqrSd || Math.sqrt(s2)), 1);
    const h = Math.min(3, Math.max(1.0, 0.9 * spread * Math.pow(Math.max(neff + o.priorWeight, 1), -0.2) * 0.6));
    const r = s2 > 0 ? Math.sqrt(Math.max(varO - h * h, 0) / s2) : 0;
    const comps = lengths.map((c, i) => ({ w: w[i], mu: m + r * (c - m) - o.lutealMean, sd: h }));
    comps.push({
        w: o.priorWeight,
        mu: o.priorMean - o.lutealMean,
        sd: Math.sqrt(Math.max(o.priorSd * o.priorSd - o.lutealSd * o.lutealSd, o.minOvSd * o.minOvSd))
    });
    const zw = comps.reduce((a, c) => a + c.w, 0);
    const pO = new Array(o.maxDay + 1).fill(0);
    let z = 0;
    for (let k = 1; k <= o.maxDay; k++) {
        pO[k] = comps.reduce((a, c) => a + (c.w / zw) * normalPdf(k, c.mu, c.sd), 0);
        z += pO[k];
    }
    for (let k = 1; k <= o.maxDay; k++) pO[k] /= z;
    return pO;
}

// P(ovulation on day k | period has not started by cycle day d), per day k.
function conditionalOvulation(lengths, d) {
    const pO = ovulationPmf(lengths);
    const L = lutealPmf();
    const survive = (x) => {
        let s = 0;
        for (const l in L) if (+l >= x) s += L[l];
        return s;
    };
    const p = new Array(OV_MODEL.maxDay + 1).fill(0);
    let z = 0;
    for (let k = 1; k <= OV_MODEL.maxDay; k++) {
        p[k] = pO[k] * survive(d - k);
        z += p[k];
    }
    if (z < 1e-9) return null;
    for (let k = 1; k <= OV_MODEL.maxDay; k++) p[k] /= z;
    return p;
}

// Low / medium / high for every day in [ws, we], relative to the highest and lowest
// estimate inside that window (thirds of the range). Near-equal estimates share a
// label, and a nearly flat window is all medium. No quotas or caps.
function relativeOvulationLabels(p, ws, we) {
    const days = [];
    for (let k = ws; k <= we; k++) days.push({ day: k, p: p[k] || 0, label: 'medium' });
    if (!days.length) return days;
    const vs = days.map((x) => x.p);
    const hi = Math.max(...vs);
    const lo = Math.min(...vs);
    const range = hi - lo;
    if (hi <= 0 || range < OV_FLAT * hi) return days;
    const order = vs.map((_, i) => i).sort((i, j) => vs[j] - vs[i]);
    const groups = [];
    order.forEach((i) => {
        const g = groups[groups.length - 1];
        if (g && g.last - vs[i] < OV_GAP * range && g.first - vs[i] < OV_SPAN * range) {
            g.idx.push(i);
            g.last = vs[i];
        } else {
            groups.push({ first: vs[i], last: vs[i], idx: [i] });
        }
    });
    groups.forEach((g) => {
        const mean = g.idx.reduce((a, i) => a + vs[i], 0) / g.idx.length;
        const t = (mean - lo) / range;
        const label = t >= 2 / 3 ? 'high' : t < 1 / 3 ? 'low' : 'medium';
        g.idx.forEach((i) => { days[i].label = label; });
    });
    return days;
}

// Today's label, only inside the displayed window; '' when it cannot be computed.
function ovulationTodayLabel(stats) {
    if (!stats || !stats.modelLengths || stats.currentDay === null) return '';
    if (stats.currentDay < stats.peakStart || stats.currentDay > stats.peakEnd) return '';
    const p = conditionalOvulation(stats.modelLengths, stats.currentDay);
    if (!p) return '';
    const today = relativeOvulationLabels(p, stats.peakStart, stats.peakEnd).find((x) => x.day === stats.currentDay);
    return today ? today.label + ' chance of ovulation today' : '';
}

function computeStats(periods) {
    const valid = periods.filter((p) => !p.paused && !p.pregnant).sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date));

    const allDesc = periods.slice().sort((a, b) => parseLocalDate(b.date) - parseLocalDate(a.date));
    const mostRecent = allDesc[0];
    if (!mostRecent) return null;
    const pregSinceISO = mostRecent.pregnant ? mostRecent.date : null;

    if (valid.length === 1) {
        const ref = valid[0];
        const median = 28;
        const peakStart = 10;
        const peakEnd = 17;
        let currentDay = null;
        if (!mostRecent.paused && !mostRecent.pregnant) {
            currentDay = diffDays(ref.date, todayISO()) + 1;
        }
        const nextPeriod = addDays(parseLocalDate(ref.date), median);
        const testDate = addDays(parseLocalDate(ref.date), peakEnd + 14 - 1);
        return {
            totalCycles: 1,
            shortest: median,
            longest: median,
            median,
            stability: 'Regular',
            peakStart,
            peakEnd,
            currentDay,
            mostRecentPaused: mostRecent.paused,
            pregSinceISO,
            lastDateISO: ref.date,
            nextPeriodISO: toLocalISO(nextPeriod),
            testDateISO: toLocalISO(testDate)
        };
    }

    if (valid.length < 2) {
        if (pregSinceISO) {
            return {
                totalCycles: valid.length,
                shortest: 28,
                longest: 28,
                median: 28,
                stability: 'Regular',
                peakStart: 10,
                peakEnd: 17,
                currentDay: null,
                mostRecentPaused: false,
                pregSinceISO,
                lastDateISO: mostRecent.date,
                nextPeriodISO: mostRecent.date,
                testDateISO: mostRecent.date
            };
        }
        if (mostRecent.paused) {
            return {
                totalCycles: valid.length,
                shortest: 28,
                longest: 28,
                median: 28,
                stability: 'Regular',
                peakStart: 10,
                peakEnd: 17,
                currentDay: null,
                mostRecentPaused: true,
                pregSinceISO,
                lastDateISO: mostRecent.date,
                nextPeriodISO: mostRecent.date,
                testDateISO: mostRecent.date
            };
        }
        return null;
    }

    const all = periods.slice().sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date));
    const cycleLengths = [];
    let lastValid = null;

    for (const p of all) {
        if (p.paused || p.pregnant) {
            // Interrupted gap (missed logs, anovulatory spell, conception,
            // postpartum return): not a completed ovulatory cycle, so break
            // the chain instead of counting the long gap as one cycle.
            lastValid = null;
        } else {
            if (lastValid) cycleLengths.push(diffDays(lastValid.date, p.date));
            lastValid = p;
        }
    }

    if (cycleLengths.length < 1) return null;

    const NORMAL_MIN = 20;
    const NORMAL_MAX = 45;
    const normalLengths = cycleLengths.filter((c) => c >= NORMAL_MIN && c <= NORMAL_MAX);
    const useRobust = normalLengths.length >= 2;
    const usableLengths = useRobust ? normalLengths : cycleLengths;

    if (usableLengths.length < 1) return null;

    const recent = usableLengths.slice(-12);
    const range = Math.max(...recent) - Math.min(...recent);
    const stable = range <= 9;
    const recent6 = recent.slice(-6);
    const shortest = stable ? Math.min(...recent) : Math.min(...recent6);
    const longest = stable ? Math.max(...recent) : Math.max(...recent6);

    let median;
    let sample;
    if (useRobust) {
        // Plausible subset: plain robust median. The legacy 2x recency
        // weighting overreacts after long-gap spells (e.g. median jumps to
        // 41 on [..,45,41] when the stable centre is ~35).
        const s = recent.slice().sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        median = s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
        sample = recent;
    } else if (!stable) {
        const weighted = [];
        recent6.forEach((c, i) => {
            const w = i >= recent6.length - 3 ? 2 : 1;
            for (let k = 0; k < w; k++) weighted.push(c);
        });
        const s = weighted.slice().sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        median = s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
        sample = weighted;
    } else {
        const s = recent.slice().sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        median = s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
        sample = recent;
    }

    const deviations = sample.map((c) => Math.abs(c - median)).sort((a, b) => a - b);
    const dm = Math.floor(deviations.length / 2);
    const mad = deviations.length % 2 ? deviations[dm] : (deviations[dm - 1] + deviations[dm]) / 2;

    const fertileStart = Math.max(1, shortest - 18);
    const fertileEnd = Math.max(1, longest - 11);
    const peakStart = Math.max(fertileStart, Math.round((median - 18) - 1.5 * mad));
    const peakEnd = Math.min(fertileEnd, Math.round((median - 11) + 0.3 * mad));

    let currentDay = null;
    if (!mostRecent.paused && !mostRecent.pregnant) {
        currentDay = diffDays(mostRecent.date, todayISO()) + 1;
    }

    const nextPeriod = addDays(parseLocalDate(mostRecent.date), median);
    const testDate = addDays(parseLocalDate(mostRecent.date), peakEnd + 14 - 1);

    return {
        totalCycles: valid.length,
        shortest,
        longest,
        median,
        stability: stable ? 'Regular' : 'Irregular',
        peakStart,
        peakEnd,
        currentDay,
        mostRecentPaused: mostRecent.paused,
        pregSinceISO,
        lastDateISO: mostRecent.date,
        nextPeriodISO: toLocalISO(nextPeriod),
        testDateISO: toLocalISO(testDate),
        modelLengths: cycleLengths.filter((c) => c >= 18 && c <= 60).slice(-12)
    };
}

function phaseOfDay(stats) {
    if (stats.currentDay < stats.peakStart) {
        return 'follicular';
    }
    if (stats.currentDay <= stats.peakEnd) return 'fertile';
    return 'luteal';
}

function phasePalette(key) {
    return PALETTES[key] || PALETTES.empty;
}

function heroStatus(stats) {
    if (stats && stats.pregSinceISO) {
        const dueISO = toLocalISO(addDays(parseLocalDate(stats.pregSinceISO), GESTATION_DAYS));
        const left = diffDays(todayISO(), dueISO);
        if (left > 1) return { badge: 'pregnant', big: String(left), label: 'days to due date', tiny: '' };
        if (left === 1) return { badge: 'pregnant', big: '1', label: 'day to due date', tiny: '' };
        if (left === 0) return { badge: 'pregnant', big: '!', label: 'due today', tiny: '' };
        return { badge: 'pregnant', big: '!', label: 'past due date', tiny: 'log period when back' };
    }
    if (stats && stats.mostRecentPaused) {
        return { badge: 'paused', big: '--', label: 'tracking paused', tiny: '' };
    }
    if (!stats || stats.currentDay === null) {
        return { badge: '', big: '\u2013', label: 'log a period', tiny: '' };
    }

    const d = stats.currentDay;
    const untilPeriod = diffDays(todayISO(), stats.nextPeriodISO);
    const untilTest = diffDays(todayISO(), stats.testDateISO);
    const testMsg = untilTest > 0 ? 'test in ' + untilTest + 'd'
        : untilTest === 0 ? 'test due today'
        : 'test window passed';

    if (d < stats.peakStart) {
        const n = stats.peakStart - d;
        return { badge: phaseOfDay(stats), big: String(n), label: n === 1 ? 'day to fertile' : 'days to fertile', tiny: '' };
    }
    if (d <= stats.peakEnd) {
        const left = stats.peakEnd - d + 1;
        return { badge: 'ovulation window', big: String(left), label: left === 1 ? 'fertile day left' : 'fertile days left', tiny: ovulationTodayLabel(stats) };
    }
    if (untilPeriod < 0) {
        return { badge: 'luteal', big: '!', label: 'overdue', tiny: testMsg };
    }
    return {
        badge: 'luteal',
        big: String(untilPeriod),
        label: untilPeriod === 1 ? 'day to period' : 'days to period',
        tiny: 'not fertile · ' + testMsg
    };
}

function applyTheme(palette, progress) {
    const accent = mix(palette.a, palette.b, progress);
    const accent2 = mix(palette.b, palette.a, Math.min(1, progress * 0.5 + 0.5));

    const root = document.documentElement.style;
    root.setProperty('--accent', accent);
    root.setProperty('--accent2', accent2);
    root.setProperty('--glow', palette.glow);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        const computedBg2 = getComputedStyle(document.documentElement).getPropertyValue('--bg2').trim();
        meta.setAttribute('content', computedBg2 || palette.bg2);
    }
}

function syncThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        const computedBg2 = getComputedStyle(document.documentElement).getPropertyValue('--bg2').trim();
        meta.setAttribute('content', computedBg2);
    }
}

if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener?.('change', syncThemeColor);
}

function renderHero(status, model, stats) {
    $('#phaseBadge').textContent = status.badge;
    $('#heroBig').textContent = status.big;
    $('#heroLabel').textContent = status.label;
    $('#heroTiny').textContent = status.tiny;

    const progress = stats && model.total && stats.currentDay !== null && stats.currentDay <= model.total
        ? stats.currentDay / model.total : 0;
    const palette = phasePalette(model.phaseKey);
    applyTheme(palette, progress);
}

function renderMenu() {
    const list = $('#historyList');
    if (!state.periods.length) {
        list.innerHTML = '<p class="empty-state">nothing yet</p>';
    } else {
        const sorted = state.periods.slice().sort((a, b) => parseLocalDate(b.date) - parseLocalDate(a.date));
        list.innerHTML = sorted.map((p) => (
            '<div class="hist-item">' +
                '<div class="hist-date">' + fmtShort(p.date) + '<small>' + parseLocalDate(p.date).getFullYear() + '</small></div>' +
                '<button class="hist-chip' + (p.pregnant ? ' on' : '') + '" data-preg="' + p.date + '">got pregnant</button>' +
                '<button class="mini-btn" data-edit="' + p.date + '" aria-label="edit">' + editIcon() + '</button>' +
                '<button class="mini-btn danger" data-delete="' + p.date + '" aria-label="delete">' + trashIcon() + '</button>' +
            '</div>'
        )).join('');
    }
}

function editIcon() {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
}

function trashIcon() {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></svg>';
}

function load() {
    state.periods = getPeriods();
    if (state.periods.some((p) => p.paused)) {
        state.periods = state.periods.map((p) => ({ date: p.date, paused: false, pregnant: !!p.pregnant }));
        localStorage.setItem(STORE_KEY, JSON.stringify(state.periods));
    }
    state.stats = computeStats(state.periods);

    const model = { total: state.stats ? state.stats.median : null, phaseKey: 'empty' };
    let statsForHero = state.stats;
    if (state.stats && state.stats.pregSinceISO) {
        model.phaseKey = 'pregnant';
        model.total = GESTATION_DAYS;
        const elapsed = Math.max(0, diffDays(state.stats.pregSinceISO, todayISO()));
        statsForHero = { currentDay: Math.min(elapsed, GESTATION_DAYS) };
    } else if (state.stats && state.stats.currentDay !== null) {
        model.phaseKey = phaseOfDay(state.stats);
    } else if (state.stats && state.stats.mostRecentPaused) {
        model.phaseKey = 'paused';
    }

    renderHero(heroStatus(state.stats), model, statsForHero);
    renderMenu();

    const dateInput = $('#logDate');
    if (dateInput) {
        dateInput.max = todayISO();
        dateInput.value = todayISO();
    }
}

function logPeriod(dateStr) {
    if (!dateStr) return;
    if (state.periods.some((p) => p.date === dateStr)) {
        toast('already logged');
        return;
    }
    state.periods.push({ date: dateStr, paused: false, pregnant: false });
    savePeriods(state.periods);
    toast('period logged');
    closeSheets();
}

function updatePeriod(oldDate, newDate) {
    if (state.periods.some((p) => p.date === newDate && p.date !== oldDate)) {
        toast('already exists');
        return false;
    }
    savePeriods(state.periods.map((p) => (p.date === oldDate ? { ...p, date: newDate } : p)));
    toast('updated');
    return true;
}

function deletePeriod(dateStr) {
    savePeriods(state.periods.filter((p) => p.date !== dateStr));
    toast('deleted');
}

function togglePregnant(dateStr) {
    const entry = state.periods.find((p) => p.date === dateStr);
    const on = entry && !entry.pregnant;
    savePeriods(state.periods.map((p) => (p.date === dateStr ? { ...p, pregnant: !p.pregnant } : p)));
    if (on) toast('due ' + fmtShort(toLocalISO(addDays(parseLocalDate(dateStr), GESTATION_DAYS))));
    else toast('unmarked');
}

function buildCSVContent(periods) {
    let csv = 'Date,Paused,Pregnant\n';
    periods.slice().sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date)).forEach((p) => {
        csv += p.date + ',' + (p.paused ? 'Yes' : 'No') + ',' + (p.pregnant ? 'Yes' : 'No') + '\n';
    });
    return csv;
}

function parseCSVText(text) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error('file is empty');
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    if (!headers.includes('date') || !headers.includes('paused')) {
        throw new Error('need Date,Paused');
    }
    const di = headers.indexOf('date');
    const pi = headers.indexOf('paused');
    const gi = headers.indexOf('pregnant');
    const imported = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',');
        const raw = vals[di]?.trim();
        if (!raw) continue;
        const date = normalizeDate(raw);
        if (!date) {
            errors.push(i + 1);
            continue;
        }
        const gval = gi >= 0 ? (vals[gi] || '').trim().toLowerCase() : '';
        const pval = (vals[pi] || '').trim().toLowerCase();
        const isYes = (v) => v === 'yes' || v === 'true' || v === '1';
        const pregnant = isYes(gval) || isYes(pval);
        imported.push({ date, paused: false, pregnant });
    }

    return { imported, errors };
}

function mergePeriods(existing, imported) {
    const merged = [...existing];
    imported.forEach((imp) => {
        const idx = merged.findIndex((p) => p.date === imp.date);
        if (idx >= 0) merged[idx] = imp;
        else merged.push(imp);
    });
    return merged;
}

function exportCSV() {
    if (!state.periods.length) {
        toast('nothing to export');
        return;
    }
    const csv = buildCSVContent(state.periods);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cmt-neo-' + todayISO() + '.csv';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('exported');
}

function importCSV(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const { imported, errors } = parseCSVText(e.target.result);

            if (!imported.length) {
                toast(errors.length ? 'could not parse dates' : 'no records found');
                return;
            }

            savePeriods(mergePeriods(state.periods, imported));
            toast(errors.length ? 'imported, skipped ' + errors.length : 'imported');
        } catch (err) {
            toast(err.message);
        }
    };
    reader.readAsText(file);
}

function normalizeDate(str) {
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
        const [y, m, d] = str.split('-').map(Number);
        return toLocalISO(new Date(y, m - 1, d));
    }
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(str)) {
        const parts = str.split(/[/-]/);
        const a = new Date(parts[2], parts[0] - 1, parts[1]);
        const b = new Date(parts[2], parts[1] - 1, parts[0]);
        const validA = !isNaN(a.getTime()) && a.getMonth() === parts[0] - 1;
        const validB = !isNaN(b.getTime()) && b.getMonth() === parts[1] - 1;
        if (validA) return toLocalISO(a);
        if (validB) return toLocalISO(b);
        return null;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : toLocalISO(d);
}

function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2400);
}

let sheetPushed = false;

function clearSheetInline() {
    document.querySelectorAll('.sheet-panel').forEach((p) => { p.style.transform = ''; p.style.transition = ''; });
}

function openSheet(id) {
    const alreadyOpen = !!document.querySelector('.sheet.open');
    closeSheets(true);
    document.getElementById(id).classList.add('open');
    if (!alreadyOpen && !sheetPushed) {
        try {
            history.pushState({ cmtNeoSheet: true }, '');
            sheetPushed = true;
        } catch (e) {}
    }
}

function closeSheets(silent) {
    const wasOpen = !!document.querySelector('.sheet.open');
    clearSheetInline();
    document.querySelectorAll('.sheet').forEach((s) => s.classList.remove('open'));
    if (wasOpen && sheetPushed && !silent) {
        sheetPushed = false;
        try { history.back(); } catch (e) {}
    }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', () => {
        sheetPushed = false;
        clearSheetInline();
        document.querySelectorAll('.sheet').forEach((s) => s.classList.remove('open'));
    });
}

let confirmAction = null;

function askConfirm(title, sub, yesLabel, action) {
    $('#confirmTitle').textContent = title;
    $('#confirmSub').textContent = sub || '';
    $('#confirmSub').style.display = sub ? '' : 'none';
    $('#confirmYes').textContent = yesLabel;
    confirmAction = action;
    openSheet('confirmSheet');
}

function bindSheetSwipe() {
    document.querySelectorAll('.sheet-panel').forEach((panel) => {
        let startY = null;
        let dy = 0;
        const snapBack = () => {
            startY = null;
            if (dy <= 0) {
                dy = 0;
                panel.style.transition = '';
                panel.style.transform = '';
                return;
            }
            dy = 0;
            panel.style.transition = '';
            panel.style.transform = 'translateY(0)';
            panel.addEventListener('transitionend', function te() {
                panel.style.transform = '';
                panel.removeEventListener('transitionend', te);
            });
        };
        panel.addEventListener('touchstart', (e) => {
            if (!panel.closest('.sheet').classList.contains('open')) return;
            if (!e.touches.length) return;
            startY = e.touches[0].clientY;
            dy = 0;
            panel.style.transition = 'none';
        }, { passive: true });
        panel.addEventListener('touchmove', (e) => {
            if (startY === null || !e.touches.length) return;
            if (panel.scrollHeight > panel.clientHeight + 1 && panel.scrollTop > 0) {
                startY = null;
                panel.style.transition = '';
                return;
            }
            dy = Math.max(0, e.touches[0].clientY - startY);
            panel.style.transform = 'translateY(' + dy + 'px)';
        }, { passive: true });
        panel.addEventListener('touchend', () => {
            if (startY === null) return;
            if (dy > 110) {
                startY = null;
                dy = 0;
                panel.style.transition = '';
                panel.style.transform = '';
                closeSheets();
            } else {
                snapBack();
            }
        });
        panel.addEventListener('touchcancel', () => {
            if (startY === null) return;
            snapBack();
        });
    });
}

function openLogSheet(prefill) {
    state.editingDate = prefill || null;
    $('#logSheetTitle').textContent = state.editingDate ? 'edit period' : 'period';
    $('#logSheetSub').textContent = state.editingDate ? 'change first day' : 'first day';
    $('#confirmLog').textContent = state.editingDate ? 'update' : 'save';
    $('#logDate').value = state.editingDate || todayISO();
    openSheet('logSheet');
}

function init() {
    $('#fab').addEventListener('click', () => openLogSheet(null));
    $('#menuBtn').addEventListener('click', () => openSheet('menuSheet'));
    document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeSheets));

    $('#quickChips').addEventListener('click', (e) => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        document.querySelectorAll('#quickChips .chip').forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        const d = new Date();
        d.setDate(d.getDate() - Number(btn.dataset.offset));
        $('#logDate').value = toLocalISO(d);
    });

    $('#confirmLog').addEventListener('click', () => {
        const v = $('#logDate').value;
        if (state.editingDate) {
            if (updatePeriod(state.editingDate, v)) {
                state.editingDate = null;
                closeSheets();
            }
        } else {
            logPeriod(v);
        }
    });

    $('#menuExport').addEventListener('click', exportCSV);
    $('#menuImport').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (e) => {
        if (e.target.files[0]) importCSV(e.target.files[0]);
        e.target.value = '';
    });

    $('#confirmYes').addEventListener('click', () => {
        const fn = confirmAction;
        confirmAction = null;
        closeSheets();
        if (fn) fn();
    });

    $('#clearAllBtn').addEventListener('click', () => {
        askConfirm('erase everything?', 'this deletes all logged periods', 'erase all', () => {
            localStorage.removeItem(STORE_KEY);
            load();
            toast('erased');
        });
    });

    $('#historyList').addEventListener('click', (e) => {
        const del = e.target.closest('[data-delete]');
        if (del) {
            deletePeriod(del.dataset.delete);
            return;
        }
        const preg = e.target.closest('[data-preg]');
        if (preg) {
            togglePregnant(preg.dataset.preg);
            return;
        }
        const edit = e.target.closest('[data-edit]');
        if (edit) {
            openLogSheet(edit.dataset.edit);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSheets();
    });

    bindSheetSwipe();
    load();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}

if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PALETTES,
        GESTATION_DAYS,
        STORE_KEY,
        state,
        parseLocalDate,
        toLocalISO,
        addDays,
        diffDays,
        todayISO,
        fmtShort,
        hexToRgb,
        mix,
        computeStats,
        conditionalOvulation,
        relativeOvulationLabels,
        ovulationTodayLabel,
        phaseOfDay,
        phasePalette,
        heroStatus,
        normalizeDate,
        getPeriods,
        savePeriods,
        logPeriod,
        updatePeriod,
        deletePeriod,
        togglePregnant,
        buildCSVContent,
        parseCSVText,
        mergePeriods,
        load
    };
}
