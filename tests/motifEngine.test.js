import test from 'node:test';
import assert from 'node:assert/strict';
import { arithmeticCandidates, findBoardSimilarSequences, findHistoricalMotifs } from '../js/motifEngine.js';

const draws = [
  { id: 'd1', date: '2026-01-01', numbers: [1, 12, 23, 34, 35] },
  { id: 'd2', date: '2026-01-02', numbers: [2, 13, 24, 35, 36] },
  { id: 'd3', date: '2026-01-03', numbers: [3, 14, 25, 36, 37] },
  { id: 'd4', date: '2026-01-04', numbers: [4, 15, 26, 37, 38] },
  { id: 'd5', date: '2026-01-05', numbers: [5, 16, 27, 38, 39] },
  { id: 'd6', date: '2026-01-06', numbers: [6, 17, 28, 39, 40] },
  { id: 'd7', date: '2026-01-07', numbers: [7, 18, 29, 30, 41] },
  { id: 'd8', date: '2026-01-08', numbers: [8, 19, 20, 31, 42] },
  { id: 'd9', date: '2026-01-09', numbers: [1, 12, 23, 34, 35] },
  { id: 'd10', date: '2026-01-10', numbers: [2, 13, 24, 35, 36] }
];

test('historical motif triples never overlap the two current rows', () => {
  const selections = [
    { role: 'past', column: 0, digit: 1 },
    { role: 'present', column: 0, digit: 2 }
  ];
  const matches = findHistoricalMotifs(draws, selections);
  assert.ok(matches.length > 0);
  assert.ok(matches.every(match => !['d9', 'd10'].includes(match.historicalFuture.id)));
  assert.equal(matches[0].kind, 'exact');
});

test('arithmetic candidates expose each operation and explanation', () => {
  const candidates = arithmeticCandidates([{ digit: 2 }, { digit: 9 }]);
  assert.deepEqual(candidates.map(item => item.result).sort(), [1, 7, 8]);
  assert.ok(candidates.every(item => item.explanation));
});

test('motif explanations include arithmetic across past and present rows', () => {
  const selections = [
    { role: 'past', column: 0, digit: 1 },
    { role: 'present', column: 0, digit: 2 }
  ];
  const matches = findHistoricalMotifs(draws, selections);
  assert.ok(matches.some(match => match.reasons.some(reason => reason.startsWith('Past-to-present'))));
});

test('motif matching explains one-column sister shifts', () => {
  const sisterDraws = [
    { id: 'h1', date: '2026-01-01', numbers: [2, 11, 23, 34, 35] },
    { id: 'h2', date: '2026-01-02', numbers: [1, 12, 23, 34, 35] },
    { id: 'h3', date: '2026-01-03', numbers: [3, 14, 25, 36, 37] },
    { id: 'now-past', date: '2026-01-04', numbers: [1, 12, 24, 35, 36] },
    { id: 'now-present', date: '2026-01-05', numbers: [2, 13, 24, 35, 36] }
  ];
  const matches = findHistoricalMotifs(sisterDraws, [
    { role: 'past', column: 1, digit: 2 },
    { role: 'present', column: 1, digit: 3 }
  ]);
  assert.ok(matches.some(match => match.reasons.some(reason => reason.includes('sister'))));
});

test('Next Draw Board mappings drive similar historical sequences', () => {
  const matches = findBoardSimilarSequences(draws, [
    { column: 0, digit: 1 },
    { column: 2, digit: 3 }
  ]);
  assert.ok(matches.length > 0);
  assert.equal(matches[0].historicalMatch.id, 'd9');
  assert.equal(matches[0].historicalFuture.id, 'd10');
  assert.equal(matches[0].kind, 'exact');
  assert.equal(matches[0].coverage, 1);
});

test('board sequence search treats multiple mapped digits in one ball as alternatives', () => {
  const matches = findBoardSimilarSequences(draws, [
    { column: 0, digit: 9 },
    { column: 0, digit: 1 }
  ]);
  assert.ok(matches.some(match => match.historicalMatch.id === 'd9'));
  assert.equal(matches.find(match => match.historicalMatch.id === 'd9').mappedColumnCount, 1);
});
