import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDigitRepeatSummary } from '../js/repeatSummary.js';

test('repeat summary orders digits 1 through 0 and adds consecutive streaks', () => {
  const draws = [
    { numbers: [3, 10, 21, 24, 35] },
    { numbers: [3, 10, 22, 26, 37] },
    { numbers: [3, 10, 24, 25, 28] },
    { numbers: [3, 10, 21, 26, 29] }
  ];
  const summary = buildDigitRepeatSummary(draws);
  assert.deepEqual(summary.latestRepeats, [
    { digit: 3, streak: 4 },
    { digit: 0, streak: 4 }
  ]);
  assert.deepEqual(summary.previousRepeats, [
    { digit: 3, streak: 3 },
    { digit: 0, streak: 3 }
  ]);
  assert.deepEqual(
    summary.coldDigits.map(item => item.digit),
    [...summary.coldDigits.map(item => item.digit)].sort((a, b) => {
      const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
      return order.indexOf(a) - order.indexOf(b);
    })
  );
});
