import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPivotCandidatePool,
  buildPivotDefinitions,
  buildPivotPool,
  buildWinningPivotTimeline,
  evaluateWinningPivotPair,
  expandPivotPoolNumbers,
  normalizePivotPoolMode,
  resolveActivePivotReference,
  resolveActiveWinningPivotDrawId
} from '../js/pivotPools.js';

const SCREENSHOT_ROW = [15, 25, 28, 30, 38];

test('Pivot Pools select the first minimum and maximum ending positions', () => {
  assert.deepEqual(buildPivotDefinitions(SCREENSHOT_ROW), [
    { kind: 'low', label: 'Low', digit: 0, column: 3 },
    { kind: 'high', label: 'High', digit: 8, column: 2 }
  ]);
  assert.equal(normalizePivotPoolMode('unsupported'), 'both');
});

test('screenshot row produces the expected low, high, and combined pools', () => {
  assert.deepEqual(buildPivotPool(SCREENSHOT_ROW, 'low').digits, [2, 5, 8]);
  assert.deepEqual(buildPivotPool(SCREENSHOT_ROW, 'high').digits, [0, 2, 3, 6, 7, 8]);
  assert.deepEqual(buildPivotPool(SCREENSHOT_ROW, 'both').digits, [0, 2, 3, 5, 6, 7, 8]);
  assert.ok([0, 7, 2, 7, 8].every(digit => buildPivotPool(SCREENSHOT_ROW, 'both').digits.includes(digit)));
});

test('Pivot Pools retain modulo-addition and borrowed-difference equations', () => {
  const pool = buildPivotPool(SCREENSHOT_ROW, 'both');
  const explanations = pool.candidates.flatMap(candidate => candidate.evidence.map(item => item.explanation));

  assert.ok(explanations.includes('8 + 5 = 13 → 3'));
  assert.ok(explanations.includes('15 − 8 = 7'));
  assert.ok(explanations.includes('10 − 8 = 2'));
  assert.ok(explanations.includes('0 + 8 = 8'));
});

test('a pivot never compares with its own Ball but may compare with an equal ending elsewhere', () => {
  const highPool = buildPivotPool(SCREENSHOT_ROW, 'high');
  const evidence = highPool.candidates.flatMap(candidate => candidate.evidence);

  assert.ok(evidence.every(item => item.otherColumn !== item.pivotColumn));
  assert.ok(evidence.some(item => item.pivotColumn === 2 && item.otherColumn === 4
    && item.pivotDigit === 8 && item.otherDigit === 8));
  assert.ok(highPool.digits.includes(0));
});

test('equal low and high endings collapse into one pivot', () => {
  const definitions = buildPivotDefinitions([5, 15, 25, 35, 5]);
  const pool = buildPivotPool([5, 15, 25, 35, 5], 'high');

  assert.deepEqual(definitions, [{ kind: 'low', label: 'Pivot', digit: 5, column: 0 }]);
  assert.equal(pool.mode, 'both');
  assert.equal(pool.pivots.length, 1);
  assert.deepEqual(pool.digits, [0]);
  assert.ok(pool.candidates[0].evidence.every(item => item.otherColumn !== 0));
});

test('pool calculation depends only on its source row', () => {
  const before = buildPivotPool(SCREENSHOT_ROW, 'both');
  const unrelatedFollowingRows = [
    [10, 17, 32, 37, 38],
    [1, 11, 21, 31, 41]
  ];
  unrelatedFollowingRows.forEach(() => {
    assert.deepEqual(buildPivotPool(SCREENSHOT_ROW, 'both'), before);
  });
  assert.equal(buildPivotPool([15, 25, null, 30, 38], 'both').valid, false);
});

test('every pivot mode expands endings into legal whole-number candidates by Ball position', () => {
  ['low', 'high', 'both'].forEach(mode => {
    for (let column = 0; column < 5; column += 1) {
      const expanded = expandPivotPoolNumbers(SCREENSHOT_ROW, mode, column);
      assert.equal(expanded.valid, true);
      assert.equal(expanded.column, column);
      assert.ok(expanded.numbers.length > 0);
      expanded.numbers.forEach(candidate => {
        assert.ok(candidate.number >= column + 1);
        assert.ok(candidate.number <= 38 + column);
        assert.ok(expanded.digits.includes(candidate.digit));
        assert.equal(candidate.number % 10, candidate.digit);
        assert.ok(candidate.evidence.length > 0);
      });
    }
  });
});

test('zero endings, duplicate pivot endings, and unrestricted expansion are deterministic', () => {
  const source = [5, 15, 25, 35, 5];
  const first = expandPivotPoolNumbers(source, 'both');
  const second = expandPivotPoolNumbers(source, 'high');

  assert.equal(first.pivots.length, 1);
  assert.deepEqual(first, second);
  assert.deepEqual(first.numbers.map(candidate => candidate.number), [10, 20, 30, 40]);
  assert.deepEqual(expandPivotPoolNumbers(source, 'both'), first);
});

test('pivot expansion cannot read a target or later draw', () => {
  const expected = expandPivotPoolNumbers(SCREENSHOT_ROW, 'both', 2);
  const laterDraws = [
    [10, 17, 22, 37, 38],
    [1, 11, 21, 31, 41]
  ];
  laterDraws.forEach(() => assert.deepEqual(expandPivotPoolNumbers(SCREENSHOT_ROW, 'both', 2), expected));
  assert.deepEqual(expandPivotPoolNumbers([15, 25, null, 30, 38], 'both', 2).numbers, []);
});

test('active reference defaults to latest official row and resets after filtering', () => {
  const draws = [
    { id: 'd1', numbers: [1, 12, 23, 34, 42] },
    { id: 'd2', numbers: SCREENSHOT_ROW },
    { id: 'preview', preview: true, numbers: [10, null, null, null, null] }
  ];

  assert.deepEqual(resolveActivePivotReference(draws, null, true), { drawId: 'd2', mode: 'both' });
  assert.deepEqual(resolveActivePivotReference(draws, { drawId: 'd1', mode: 'high' }, true), { drawId: 'd1', mode: 'high' });
  assert.deepEqual(resolveActivePivotReference(draws.slice(1), { drawId: 'd1', mode: 'low' }, true), { drawId: 'd2', mode: 'both' });
  assert.equal(resolveActivePivotReference(draws, { drawId: 'd1', mode: 'low' }, false), null);
});

test('Winning Pivot Point finds pivot 8 with five Ball hits in the screenshot pair', () => {
  const evaluation = evaluateWinningPivotPair(
    { id: 'source', date: '2026-08-28', numbers: SCREENSHOT_ROW },
    { id: 'target', date: '2026-08-29', numbers: [10, 17, 22, 37, 38] }
  );

  assert.equal(evaluation.valid, true);
  assert.equal(evaluation.winningHitCount, 5);
  assert.deepEqual(evaluation.winners.map(candidate => candidate.digit), [8]);
  assert.deepEqual(evaluation.winners[0].matchedTargetColumns, [0, 1, 2, 3, 4]);
  assert.deepEqual(evaluation.candidates.map(candidate => [candidate.digit, candidate.hitCount]), [
    [8, 5], [5, 3], [0, 2]
  ]);
});

test('winning-pivot candidates collapse repeated endings and retain every source position', () => {
  const candidate = buildPivotCandidatePool(SCREENSHOT_ROW, 8);

  assert.equal(candidate.valid, true);
  assert.deepEqual(candidate.sourceColumns, [2, 4]);
  assert.deepEqual(candidate.digits, [0, 2, 3, 6, 7, 8]);
  assert.ok(candidate.candidates.flatMap(item => item.evidence).every(item => item.otherColumn !== item.pivotColumn));
  assert.ok(candidate.candidates.flatMap(item => item.evidence).some(item => item.explanation === '15 − 8 = 7'));
});

test('repeated target endings count as separate Ball hits', () => {
  const evaluation = evaluateWinningPivotPair(
    { id: 'source', numbers: SCREENSHOT_ROW },
    { id: 'target', numbers: [10, 17, 22, 37, 38] }
  );
  const winningEight = evaluation.candidates.find(candidate => candidate.digit === 8);

  assert.deepEqual(winningEight.matchedTargetDigits, [0, 7, 2, 7, 8]);
  assert.equal(winningEight.hitCount, 5);
});

test('all maximum pivots win and their target matches form a deterministic union', () => {
  const evaluation = evaluateWinningPivotPair(
    { id: 'source', numbers: [1, 2, 3, 9, 10] },
    { id: 'target', numbers: [4, 7, 11, 12, 13] }
  );

  assert.equal(evaluation.winningHitCount, 4);
  assert.deepEqual(evaluation.winners.map(candidate => candidate.digit), [0, 1, 3, 9]);
  assert.deepEqual(evaluation.matchedTargetColumns, [0, 1, 2, 3, 4]);
  assert.deepEqual(evaluation.candidates.map(candidate => candidate.hitCount), [4, 4, 4, 4, 3]);
});

test('winning-pivot timelines use adjacent official rows and reject previews or partial rows', () => {
  const draws = [
    { id: 'd1', date: '2026-08-27', numbers: [1, 2, 3, 9, 10] },
    { id: 'd2', date: '2026-08-28', numbers: SCREENSHOT_ROW },
    { id: 'd3', date: '2026-08-29', numbers: [10, 17, 22, 37, 38] },
    { id: 'preview', preview: true, numbers: [1, null, null, null, null] }
  ];

  const timeline = buildWinningPivotTimeline(draws);
  assert.deepEqual(timeline.map(item => [item.sourceDrawId, item.targetDrawId]), [['d1', 'd2'], ['d2', 'd3']]);
  assert.equal(evaluateWinningPivotPair(draws[2], draws[3]).valid, false);
  assert.equal(resolveActiveWinningPivotDrawId(draws, null, true), 'd3');
  assert.equal(resolveActiveWinningPivotDrawId(draws, 'd2', true), 'd2');
  assert.equal(resolveActiveWinningPivotDrawId(draws.slice(1), 'd2', true), 'd3');
  assert.equal(resolveActiveWinningPivotDrawId(draws, 'd3', false), null);
});
