import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDigitRepeatSummary } from '../js/repeatSummary.js';

test('heat summary classifies all ten digits from the rolling three-draw window', () => {
  const draws = [
    { numbers: [3, 10, 21, 24, 35] },
    { numbers: [3, 10, 22, 26, 37] },
    { numbers: [3, 10, 24, 25, 28] },
    { numbers: [3, 10, 21, 26, 29] }
  ];
  const summary = buildDigitRepeatSummary(draws);
  assert.deepEqual(summary.hot.map(item => item.digit), [3, 0]);
  assert.deepEqual(summary.neutral.map(item => item.digit), [1, 2, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(summary.cold.map(item => item.digit), []);
  assert.equal(summary.items.length, 10);
  assert.deepEqual(summary.repeatingDigits, [3, 0]);
  assert.equal(summary.repeatingCount, 2);
});

test('hot requires a sequential repeat into the current draw', () => {
  const summary = buildDigitRepeatSummary([
    { numbers: [1, 2, 13, 24, 35] },
    { numbers: [1, 12, 23, 34, 35] },
    { numbers: [1, 22, 33, 34, 36] },
    { numbers: [11, 22, 33, 34, 45] }
  ]);

  assert.equal(summary.hot.some(item => item.digit === 1), true, '1 repeats into the current draw');
  assert.equal(summary.hot.some(item => item.digit === 5), false, '5 is absent from the previous draw');
  assert.equal(summary.neutral.some(item => item.digit === 5), true);
});

test('latest example produces the requested HNCDE groups', () => {
  const summary = buildDigitRepeatSummary([
    { id: 'n-3', date: '2026-08-24', numbers: [6, 7, 8, 13, 20] },
    { id: 'n-2', date: '2026-08-25', numbers: [2, 4, 13, 20, 29] },
    { id: 'n-1', date: '2026-08-26', numbers: [4, 6, 9, 11, 21] },
    { id: 'n', date: '2026-08-27', numbers: [5, 6, 13, 16, 21] }
  ]);

  assert.deepEqual(summary.hot.map(item => item.digit), [1, 6]);
  assert.deepEqual(summary.cold.map(item => item.digit), [7, 8]);
  assert.deepEqual(summary.decliningDigits, [4, 9]);
  assert.deepEqual(summary.emergingDigits, [5]);
});

test('timeline marks cold-to-drawn digits emerging and former hot digits declining', async () => {
  const { buildDigitHeatTimeline } = await import('../js/repeatSummary.js');
  const draws = [
    { id: 'a', date: '2026-01-01', numbers: [1, 2, 3, 4, 10] },
    { id: 'b', date: '2026-01-02', numbers: [1, 12, 13, 14, 20] },
    { id: 'c', date: '2026-01-03', numbers: [1, 22, 23, 24, 30] },
    { id: 'd', date: '2026-01-04', numbers: [1, 22, 23, 24, 30] },
    { id: 'e', date: '2026-01-05', numbers: [5, 26, 27, 28, 39] }
  ];
  const latest = buildDigitHeatTimeline(draws).at(-1);
  assert.deepEqual(latest.emergingDigits, [5, 6, 7, 8, 9]);
  assert.deepEqual(latest.decliningDigits, [1, 2, 3, 4, 0]);
});
