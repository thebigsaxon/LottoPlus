import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { consecutivePairs, detectNumberTheme } from '../js/numberTheme.js';

const FOUR_ROWS = [
  { id: 'd1', date: '2026-08-28', numbers: [15, 25, 28, 30, 38] },
  { id: 'd2', date: '2026-08-29', numbers: [10, 17, 32, 37, 38] },
  { id: 'd3', date: '2026-08-30', numbers: [7, 11, 18, 36, 37] },
  { id: 'd4', date: '2026-08-31', numbers: [7, 9, 16, 38, 39] }
];

test('consecutive pairs are whole numbers, not endings', () => {
  assert.deepEqual(consecutivePairs([7, 9, 16, 38, 39]), [[38, 39]]);
  assert.deepEqual(consecutivePairs([10, 17, 32, 37, 38]), [[37, 38]]);
  assert.deepEqual(consecutivePairs([7, 11, 18, 36, 37]), [[36, 37]]);
});

test('the Aug 28–31 block fires a live whole-number theme alert', () => {
  const theme = detectNumberTheme(FOUR_ROWS);
  assert.equal(theme.intensity, 'alert');
  assert.equal(theme.active, true);
  assert.ok(theme.signals.some(item => item.key === 'sliding-consecutive'));
  assert.ok(theme.signals.some(item => item.key === 'hopping-repeats'));
  assert.ok(theme.signals.some(item => item.key === 'high-box'));
  assert.ok(theme.signals.some(item => item.key === 'persistent' && item.numbers.includes(38)));
  assert.ok(theme.numbersInPlay.includes(7));
  assert.ok(theme.numbersInPlay.includes(38));
  assert.ok(theme.numbersInPlay.includes(39));
  assert.equal(theme.themeLine.length, 5);
  assert.ok(theme.themeLine.every(number => theme.numbersInPlay.includes(number)
    || number === theme.themeLine.at(-1)));
  assert.doesNotMatch(theme.summary, /ending/);
  assert.deepEqual(theme.drawIds, ['d1', 'd2', 'd3', 'd4']);
});

test('the theme is already visible after three rows, before the 7-9-16-38-39 result', () => {
  const theme = detectNumberTheme(FOUR_ROWS.slice(0, 3));
  assert.ok(theme.active);
  assert.equal(theme.intensity, 'watch');
  assert.ok(theme.signals.some(item => item.key === 'low-descent'));
  assert.ok(theme.signals.some(item => item.key === 'hopping-repeats'));
  assert.equal(theme.numbersInPlay.includes(39), false);
});

test('detection never reads a later draw', () => {
  const prefix = detectNumberTheme(FOUR_ROWS.slice(0, 3));
  const mutated = [
    ...FOUR_ROWS.slice(0, 3),
    { id: 'future', date: '2026-08-31', numbers: [1, 2, 3, 4, 5] }
  ];
  const leaked = detectNumberTheme(FOUR_ROWS.slice(0, 3));
  mutated[3].numbers = [38, 39, 40, 41, 42];
  assert.deepEqual(detectNumberTheme(FOUR_ROWS.slice(0, 3)).signals.map(item => item.key), prefix.signals.map(item => item.key));
  assert.deepEqual(leaked.numbersInPlay, prefix.numbersInPlay);
  const withFourth = detectNumberTheme(mutated);
  assert.notDeepEqual(withFourth.summary, prefix.summary);
});

test('ordinary non-stacked history stays silent', () => {
  const quiet = [
    { id: 'a', date: '2026-01-01', numbers: [3, 14, 22, 31, 40] },
    { id: 'b', date: '2026-01-02', numbers: [5, 12, 19, 27, 41] },
    { id: 'c', date: '2026-01-03', numbers: [2, 16, 24, 33, 42] },
    { id: 'd', date: '2026-01-04', numbers: [8, 13, 21, 29, 35] }
  ];
  const theme = detectNumberTheme(quiet);
  assert.equal(theme.active, false);
  assert.equal(theme.intensity, 'silent');
  assert.deepEqual(theme.themeLine, []);
});

test('archive theme alerts stay uncommon', async () => {
  const archive = JSON.parse(await readFile(new URL('./fixtures/cash5-history.json', import.meta.url), 'utf8'));
  let alerts = 0;
  let watches = 0;
  for (let end = 4; end <= archive.draws.length; end += 1) {
    const theme = detectNumberTheme(archive.draws.slice(0, end));
    if (theme.intensity === 'alert') alerts += 1;
    if (theme.intensity === 'watch') watches += 1;
  }
  const trials = archive.draws.length - 3;
  assert.ok(alerts / trials < 0.05);
  assert.ok(watches / trials < 0.2);
});
