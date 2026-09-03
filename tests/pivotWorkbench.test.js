import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildDigitPool,
  buildPivotWorkbench,
  choosePivots,
  equationKey,
  expectedEndingHits,
  evaluateWorkbenchHistory,
  fullNumbersForPool,
  newestUniqueEndings,
  normalizeWorkbenchSettings,
  PIVOT_CHOOSERS,
  scorePoolAgainstDigits,
  toggleManualPivot
} from '../js/pivotWorkbench.js';

const SCREENSHOT_ROW = [15, 25, 28, 30, 38];
const NEXT_ROW = [10, 17, 32, 37, 38];
const THIRD_ROW = [7, 11, 18, 36, 37];

const borrowedIncludeSkip = {
  methodVersion: 2,
  operators: { add: false, direct: false, borrowed: true },
  skipSharedPivotDigit: true,
  includePivotDigit: true,
  disabledEquations: []
};

test('high 9 against 7 9 6 8 9 is 9 ± each other ending, not the pivot itself', () => {
  const pool = buildDigitPool([7, 9, 16, 38, 39], [9]);

  assert.deepEqual(pool.digits, [1, 2, 3, 5, 6, 7]);
  assert.equal(pool.digits.includes(9), false);
  assert.ok(pool.equations.some(item => item.explanation === '9 − 6 = 3'));
  assert.ok(pool.equations.some(item => item.explanation === '9 + 6 = 15 → 5'));
  assert.ok(pool.equations.some(item => item.explanation === '9 − 7 = 2'));
  assert.ok(pool.equations.some(item => item.explanation === '9 + 7 = 16 → 6'));
  assert.ok(pool.equations.some(item => item.explanation === '9 − 8 = 1'));
  assert.ok(pool.equations.some(item => item.explanation === '9 + 8 = 17 → 7'));
  assert.ok(pool.equations.every(item => item.otherDigit !== 9));
});

test('saved workbench settings without a method version migrate to plus-minus pivot math', () => {
  const settings = normalizeWorkbenchSettings({
    operators: { add: true, direct: true, borrowed: true },
    includePivotDigit: true,
    recencyDraws: 1
  });
  assert.deepEqual(settings.operators, { add: true, direct: true, borrowed: false });
  assert.equal(settings.includePivotDigit, false);
  assert.equal(settings.recencyDraws, 0);
});

test('Aug 28 high 8 with borrowed subtraction, include-pivot, skip-copy matches the manual {2,7,8} pool', () => {
  const pool = buildDigitPool(SCREENSHOT_ROW, [8], borrowedIncludeSkip);

  assert.deepEqual(pool.pivots, [8]);
  assert.deepEqual(pool.digits, [2, 7, 8]);
  assert.equal(pool.width, 3);
  assert.ok(pool.equations.some(item => item.explanation === '10 − 8 = 2'));
  assert.ok(pool.equations.some(item => item.explanation === '15 − 8 = 7'));
  assert.ok(pool.equations.some(item => item.operation === 'pivot' && item.result === 8));
  assert.equal(scorePoolAgainstDigits(pool.digits, [0, 7, 2, 7, 8]).hits, 4);
  assert.ok(Math.abs(expectedEndingHits([2, 7, 8]) - (5 * (5 + 4 + 4) / 42)) < 1e-12);
});

test('dropping add and the other 8 is what keeps the pool tight versus the history overlay', () => {
  const overlayLike = buildDigitPool(SCREENSHOT_ROW, [8], {
    methodVersion: 2,
    operators: { add: true, direct: false, borrowed: true },
    skipSharedPivotDigit: false,
    includePivotDigit: false
  });
  const workbench = buildDigitPool(SCREENSHOT_ROW, [8], borrowedIncludeSkip);

  assert.deepEqual(overlayLike.digits, [0, 2, 3, 6, 7, 8]);
  assert.deepEqual(workbench.digits, [2, 7, 8]);
  assert.ok(overlayLike.width > workbench.width);
});

test('0 + child-of-previous-pivot selects 2 on the Aug 29 row', () => {
  const pivots = choosePivots(NEXT_ROW, PIVOT_CHOOSERS.ZERO_ALTERNATE, {
    ...borrowedIncludeSkip,
    previousNumbers: SCREENSHOT_ROW
  });

  assert.deepEqual(pivots, [0, 2]);
});

test('disabled equations shrink the live pool without changing mechanical history', () => {
  const full = buildDigitPool(SCREENSHOT_ROW, [8], borrowedIncludeSkip);
  const dropped = full.equations.filter(item => item.result === 2).map(equationKey);
  const narrowed = buildDigitPool(SCREENSHOT_ROW, [8], {
    ...borrowedIncludeSkip,
    disabledEquations: dropped
  });

  assert.ok(full.digits.includes(2));
  assert.equal(narrowed.digits.includes(2), false);
  assert.deepEqual(narrowed.digits, [7, 8]);
});

test('recency unique endings walk newest first and stop at the limit', () => {
  const draws = [
    { date: '2026-08-28', numbers: SCREENSHOT_ROW },
    { date: '2026-08-29', numbers: NEXT_ROW },
    { date: '2026-08-30', numbers: THIRD_ROW }
  ];
  const newest = newestUniqueEndings(draws, { throughIndex: 2, rowCount: 3, limit: 6 });

  assert.deepEqual(newest.slice(0, 3), [7, 1, 8]);
  assert.ok(newest.includes(6));
  assert.ok(newest.length <= 6);
});

test('tightest chooser is prospective and does not read a later row', () => {
  const later = { date: '2026-08-29', numbers: NEXT_ROW };
  const first = choosePivots(SCREENSHOT_ROW, PIVOT_CHOOSERS.TIGHTEST, borrowedIncludeSkip);
  const mutated = choosePivots(SCREENSHOT_ROW, PIVOT_CHOOSERS.TIGHTEST, borrowedIncludeSkip);
  later.numbers = [1, 2, 3, 4, 5];

  assert.deepEqual(first, mutated);
  assert.equal(first.length, 1);
  assert.ok([0, 5, 8].includes(first[0]));
});

test('workbench live pool uses only the latest official row as source', () => {
  const draws = [
    { id: 'a', date: '2026-08-28', numbers: SCREENSHOT_ROW },
    { id: 'b', date: '2026-08-29', numbers: NEXT_ROW }
  ];
  const board = buildPivotWorkbench(draws, {
    chooser: PIVOT_CHOOSERS.HIGH,
    ...borrowedIncludeSkip
  });
  const changedLater = structuredClone(draws);
  changedLater.push({ id: 'c', date: '2026-08-30', numbers: THIRD_ROW });

  assert.equal(board.source.date, '2026-08-29');
  assert.deepEqual(board.activePivots, [8]);
  assert.notEqual(buildPivotWorkbench(changedLater, {
    chooser: PIVOT_CHOOSERS.HIGH,
    ...borrowedIncludeSkip
  }).source.date, board.source.date);
  changedLater[1].numbers = [1, 2, 3, 4, 5];
  const leaked = buildPivotWorkbench(draws, {
    chooser: PIVOT_CHOOSERS.HIGH,
    ...borrowedIncludeSkip
  });
  assert.deepEqual(leaked.combined.digits, board.combined.digits);
});

test('historical capture never reads the target row to build the pool', async () => {
  const archive = JSON.parse(await readFile(new URL('./fixtures/cash5-history.json', import.meta.url), 'utf8'));
  const slice = archive.draws.slice(0, 80);
  const recipe = { chooser: PIVOT_CHOOSERS.HIGH, ...borrowedIncludeSkip };
  const target = 50;
  const source = slice[target - 1];
  const previous = slice[target - 2];
  const pivots = choosePivots(source.numbers, PIVOT_CHOOSERS.HIGH, {
    ...borrowedIncludeSkip,
    previousNumbers: previous.numbers
  });
  const expectedPool = buildDigitPool(source.numbers, pivots, borrowedIncludeSkip).digits;
  const mutated = structuredClone(slice);
  mutated[target].numbers = [1, 2, 3, 4, 5];
  mutated[target + 1].numbers = [38, 39, 40, 41, 42];
  const leakedPivots = choosePivots(mutated[target - 1].numbers, PIVOT_CHOOSERS.HIGH, {
    ...borrowedIncludeSkip,
    previousNumbers: mutated[target - 2].numbers
  });
  const leakedPool = buildDigitPool(mutated[target - 1].numbers, leakedPivots, borrowedIncludeSkip).digits;
  const summary = evaluateWorkbenchHistory(slice, recipe);

  assert.deepEqual(leakedPivots, pivots);
  assert.deepEqual(leakedPool, expectedPool);
  assert.equal(summary.draws, 79);
  assert.ok(summary.meanWidth > 0);
  assert.ok(Number.isFinite(summary.meanLift));
});

test('workbench settings ignore recency and use the latest draw only', () => {
  const settings = normalizeWorkbenchSettings({ recencyDraws: 1, recencyLimit: 4 });
  assert.equal(settings.recencyDraws, 0);
  assert.equal(settings.recencyLimit, 6);
});

test('manual pivot toggling keeps at most two digits', () => {
  assert.deepEqual(toggleManualPivot([], 8), [8]);
  assert.deepEqual(toggleManualPivot([8], 0), [0, 8]);
  assert.deepEqual(toggleManualPivot([0, 8], 2), [2, 8]);
  assert.deepEqual(toggleManualPivot([2, 8], 8), [2]);
});

test('full-number expansion stays on the 0-9 pool and legal 1-42 values', () => {
  const expanded = fullNumbersForPool([2, 7, 8]);
  assert.deepEqual(expanded.map(item => item.digit), [2, 7, 8]);
  assert.deepEqual(expanded.find(item => item.digit === 2).numbers, [2, 12, 22, 32, 42]);
  assert.ok(expanded.every(item => item.numbers.every(number => number % 10 === item.digit)));
});
