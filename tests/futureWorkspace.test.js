import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFutureWorkspaceModel,
  futureCellEvidence,
  normalizeFutureDigitMap,
  selectFutureDigit
} from '../js/futureWorkspace.js';

const draws = [
  { id: 'past', date: '2026-01-01', numbers: [2, 13, 24, 35, 41] },
  { id: 'present', date: '2026-01-02', numbers: [6, 17, 28, 39, 40] }
];

test('mirrored source rows preserve ball columns and exact selections', () => {
  const model = buildFutureWorkspaceModel(draws, [
    { cellId: 'past-b2-ones', role: 'past', column: 2, digit: 4 }
  ]);
  assert.deepEqual(model.past.map(cell => cell.number), draws[0].numbers);
  assert.equal(model.past[2].column, 2);
  assert.equal(model.past[2].selected, true);
  assert.equal(model.present[2].selected, false);
});

test('future row maps the sorted ticket row into five square columns', () => {
  const model = buildFutureWorkspaceModel(draws, [], [39, 4, 21]);
  assert.deepEqual(model.future.map(cell => cell.number), [4, 21, 39, null, null]);
  assert.deepEqual(model.future.map(cell => cell.digit), [4, 1, 9, null, null]);
});

test('future row preserves explicit slip positions including empty slots', () => {
  const model = buildFutureWorkspaceModel(draws, [], [4, null, 21, null, 39]);
  assert.deepEqual(model.future.map(cell => cell.number), [4, null, 21, null, 39]);
});

test('motif future numbers remain aligned to their original ball columns', () => {
  const matches = [
    { historicalFuture: { numbers: [3, 14, 25, 36, 42] } },
    { historicalFuture: { numbers: [3, 17, 25, 38, 41] } },
    { historicalFuture: { numbers: [7, 14, 29, 36, 40] } }
  ];
  const model = buildFutureWorkspaceModel(draws, [], [], matches);
  assert.deepEqual(model.columnSuggestions[0].suggestions, [
    { number: 3, digit: 3, count: 2 },
    { number: 7, digit: 7, count: 1 }
  ]);
  assert.deepEqual(model.columnSuggestions[2].suggestions, [
    { number: 25, digit: 5, count: 2 },
    { number: 29, digit: 9, count: 1 }
  ]);
});

test('future digit map keeps exactly one idempotent selection per column', () => {
  const mapped = selectFutureDigit([], 2, 5);
  assert.deepEqual(mapped, [{ column: 2, digit: 5 }]);
  assert.deepEqual(selectFutureDigit(mapped, 2, 5), mapped);
  assert.deepEqual(selectFutureDigit(mapped, 2, 7), [{ column: 2, digit: 7 }]);
  assert.deepEqual(normalizeFutureDigitMap([
    { column: 2, digit: 5 }, { column: 2, digit: 7 }, { column: 8, digit: 2 }
  ]), [{ column: 2, digit: 7 }]);
  assert.deepEqual(normalizeFutureDigitMap([
    { column: 2, digit: 5 }, { column: 2, digit: 7 }
  ], { column: 2, digit: 5 }), [{ column: 2, digit: 5 }]);
});

test('future cell evidence stays scoped to the selected space', () => {
  const evidenceDraws = [
    { numbers: [1, 12, 25, 34, 40] },
    { numbers: [2, 14, 25, 36, 41] },
    { numbers: [5, 16, 27, 38, 42] }
  ];
  const matches = [{ historicalFuture: { numbers: [3, 14, 25, 36, 41] } }];
  const evidence = futureCellEvidence(evidenceDraws, matches, 2, 5);
  assert.equal(evidence.windowCount, 2);
  assert.equal(evidence.motifCount, 1);
  assert.deepEqual(evidence.fullNumbers.find(item => item.number === 25), { number: 25, spaceCount: 2 });
});
