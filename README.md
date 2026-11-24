# CMT-Neo

A minimal, offline-first cycle tracker. Log period start dates; it shows where you are in the cycle, with a countdown to the fertile window, the ovulation window, and the next period.

Everything runs in the browser. Period dates are stored in `localStorage` on your device only. Nothing is sent anywhere. Dates can be exported and imported as CSV (`Date,Paused,Pregnant`).

## Ovulation window and today's chance label

The fertile window shown in the app comes from your logged cycle lengths (robust median and spread of recent cycles). It is unchanged.

Inside that window the hero shows one extra line under "fertile days left": `low chance today`, `medium chance today` or `high chance today`. Outside the window nothing extra is shown. No percentages are displayed, and nothing beyond today is shown.

### How the label is computed

Only period dates are used. The estimate is experimental and has not been validated against measured ovulation (for example LH tests or temperature data).

1. Cycle length is modelled as ovulation day plus luteal phase length. The luteal phase is assumed to be a normal distribution (mean 13 days, sd 1.8, limited to 6 to 20 days).  
2. The spread of ovulation day is the spread of your past cycle lengths minus the luteal spread, with a floor. Recent cycles count more (half-life 6 cycles). The last 12 completed cycles of 18 to 60 days are used, plus one weak "typical 29-day cycle" prior.  
3. For today's cycle day, the model gives each day an internal chance of being the ovulation day, given that the period has not started yet. The estimates are recalculated each day.  
4. The internal estimate for every day in the displayed window is compared with the others in that same window. A day in the top third of the window's range is `high`, the bottom third is `low`, and the middle is `medium`. Near-equal estimates always get the same label, and a nearly flat window shows `medium` for every day. There are no fixed percentage cut-offs and no quotas.

### What the label means, and does not

- The label is relative to your own other fertile-window days. `high` means "higher than your other window days", not a high absolute chance, and `low` does not mean ovulation is unlikely.  
- Irregular histories spread the estimate over many days, so every day can have a small absolute chance while the labels still differ.  
- It is not a pregnancy chance, a contraception method, or medical advice.  
- Missed or wrong logs, cycles outside 18 to 60 days, pauses and pregnancy breaks change the result.  
- Assumptions that are not validated: the luteal length, independence of ovulation day and luteal length, and the weighting and prior.

## Development

```
npm ci
npm test              # node --test tests/*.test.js on Node 22
npm run lint
npm run test:e2e
```

The service worker cache name (`cmt-neo-vNNN` in `sw.js`) is bumped whenever shipped files change so installed copies update.