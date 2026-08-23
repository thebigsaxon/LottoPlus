import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFutureWorkspaceModel,
  futureCellEvidence,
  normalizeFutureDigitMap,
  rankHistoricalSuccessors,
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

test('future digit map keeps one selection per column and toggles the active digit off', () => {
  const mapped = selectFutureDigit([], 2, 5);
  assert.deepEqual(mapped, [{ column: 2, digit: 5 }]);
  assert.deepEqual(selectFutureDigit(mapped, 2, 5), []);
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

test('historical successors use same-column ones-digit transitions and rank by frequency', () => {
  const history = [
    { date: '2026-01-01', numbers: [5, 11, 22, 33, 40] },
    { date: '2026-01-02', numbers: [21, 15, 23, 34, 41] },
    { date: '2026-01-03', numbers: [15, 16, 24, 35, 42] },
    { date: '2026-01-04', numbers: [22, 17, 25, 36, 40] },
    { date: '2026-01-05', numbers: [35, 18, 26, 37, 41] },
    { date: '2026-01-06', numbers: [11, 19, 27, 38, 42] },
    { date: '2026-01-07', numbers: [25, 20, 28, 39, 40] }
  ];

  const firstBall = rankHistoricalSuccessors([...history].reverse())[0];
  assert.equal(firstBall.presentNumber, 25);
  assert.equal(firstBall.presentDigit, 5);
  assert.equal(firstBall.totalTransitions, 3);
  assert.deepEqual(firstBall.candidates, [
    { digit: 1, rank: 1, count: 2, mostRecentTransitionDate: '2026-01-06' },
    { digit: 2, rank: 2, count: 1, mostRecentTransitionDate: '2026-01-04' }
  ]);
});

test('historical successor ties prefer recent transitions and then lower digits', () => {
  const history = [
    { date: '2026-01-01', numbers: [5, 11, 21, 31, 40] },
    { date: '2026-01-02', numbers: [13, 12, 22, 32, 41] },
    { date: '2026-01-03', numbers: [15, 13, 23, 33, 42] },
    { date: '2026-01-04', numbers: [12, 14, 24, 34, 40] },
    { date: '2026-01-05', numbers: [25, 15, 25, 35, 41] }
  ];
  const firstBall = rankHistoricalSuccessors(history)[0];
  assert.deepEqual(firstBall.candidates.map(item => item.digit), [2, 3]);

  const sameDateHistory = [
    { date: '2026-01-01', numbers: [5, 11, 21, 31, 40] },
    { date: '2026-01-02', numbers: [13, 12, 22, 32, 41] },
    { date: '2026-01-02', numbers: [15, 13, 23, 33, 42] },
    { date: '2026-01-02', numbers: [12, 14, 24, 34, 40] },
    { date: '2026-01-03', numbers: [25, 15, 25, 35, 41] }
  ];
  assert.deepEqual(rankHistoricalSuccessors(sameDateHistory)[0].candidates.map(item => item.digit), [2, 3]);
});

test('historical successors limit analysis to the newest 50 valid draws', () => {
  const history = Array.from({ length: 52 }, (_, index) => ({
    date: `2026-02-${String(index + 1).padStart(2, '0')}`,
    numbers: [1, 12, 23, 34, 40]
  }));
  history[0].numbers[0] = 9;
  history[1].numbers[0] = 8;
  history[2].numbers[0] = 19;
  history[3].numbers[0] = 7;
  history[51].numbers[0] = 29;
  history.push({ date: 'not-valid-numbers', numbers: [0, 12, 23, 34, 40] });

  const firstBall = rankHistoricalSuccessors(history)[0];
  assert.equal(firstBall.totalTransitions, 1);
  assert.deepEqual(firstBall.candidates.map(item => item.digit), [7]);
});

test('historical successors return only supported candidates for sparse data', () => {
  assert.deepEqual(rankHistoricalSuccessors([]), []);
  const results = rankHistoricalSuccessors([
    { date: '2026-01-01', numbers: [1, 12, 23, 34, 40] }
  ]);
  assert.equal(results.length, 5);
  results.forEach((result, column) => {
    assert.equal(result.column, column);
    assert.equal(result.totalTransitions, 0);
    assert.deepEqual(result.candidates, []);
  });
});
