import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNumberEvidence, validCash5NumbersForDigit, validNumbersForDigit } from '../js/evidenceEngine.js';

test('valid full numbers cover Cash 5 endings 0, 1, and 2', () => {
  assert.deepEqual(validCash5NumbersForDigit(0), [10, 20, 30, 40]);
  assert.deepEqual(validCash5NumbersForDigit(1), [1, 11, 21, 31, 41]);
  assert.deepEqual(validCash5NumbersForDigit(2), [2, 12, 22, 32, 42]);
  assert.deepEqual(validNumbersForDigit(0, 'treasureHunt'), [10, 20, 30]);
  assert.equal(validNumbersForDigit(3, 'cash5').at(-1), 43);
  assert.equal(validNumbersForDigit(3, 'treasureHunt').at(-1), 23);
});

test('evidence reports motif, recency, frequency, and column support', () => {
  const draws = [
    { numbers: [1, 12, 23, 34, 35] },
    { numbers: [2, 11, 24, 35, 36] }
  ];
  const matches = [{ historicalFuture: { numbers: [11, 14, 22, 33, 40] } }];
  const evidence = buildNumberEvidence(1, draws, matches, [1]);
  const eleven = evidence.find(item => item.number === 11);
  assert.equal(eleven.motifFutureCount, 1);
  assert.equal(eleven.frequency, 1);
  assert.equal(eleven.sameColumnCount, 1);
  assert.equal(eleven.mostRecentRowsAgo, 0);
  assert.equal(eleven.historyFitTier, 'strong');
  assert.ok(eleven.historyFit > 0);
  assert.ok(eleven.patternSignal > 0);
});
