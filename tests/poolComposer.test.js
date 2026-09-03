import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPivotWorkbench, equationKey, PIVOT_CHOOSERS } from '../js/pivotWorkbench.js';
import {
  composePoolLines,
  reasonForNumber,
  systemLineLabel
} from '../js/poolComposer.js';

const SCREENSHOT = [
  { id: 'a', date: '2026-08-28', numbers: [15, 25, 28, 30, 38] }
];

const borrowedIncludeSkip = {
  methodVersion: 2,
  chooser: PIVOT_CHOOSERS.HIGH,
  operators: { add: false, direct: false, borrowed: true },
  skipSharedPivotDigit: true,
  includePivotDigit: true,
  recencyDraws: 0,
  disabledEquations: []
};

function composeScreenshot(extraSettings = {}) {
  const workbench = buildPivotWorkbench(SCREENSHOT, { ...borrowedIncludeSkip, ...extraSettings });
  return { workbench, composed: composePoolLines(workbench) };
}

test('Aug 28 {2,7,8} pool never leaves those endings', () => {
  const { workbench, composed } = composeScreenshot();
  assert.deepEqual(workbench.combined.digits, [2, 7, 8]);
  const used = composed.lines.filter(line => line.available).flatMap(line => line.numbers);
  assert.ok(used.length >= 10);
  assert.ok(used.every(number => [2, 7, 8].includes(number % 10)));
  assert.equal(new Set(used).size, used.length);
});

test('Core, Spread, and Guard are disjoint sorted lines when the matrix is wide enough', () => {
  const wide = buildPivotWorkbench([
    { id: 'a', date: '2026-08-28', numbers: [15, 25, 28, 30, 38] }
  ], {
    ...borrowedIncludeSkip,
    operators: { add: true, direct: true, borrowed: true },
    skipSharedPivotDigit: false,
    includePivotDigit: true
  });
  const composed = composePoolLines(wide);
  const available = composed.lines.filter(line => line.available);
  assert.ok(available.length >= 2);
  available.forEach(line => {
    assert.equal(line.numbers.length, 5);
    assert.deepEqual(line.numbers, [...line.numbers].sort((left, right) => left - right));
  });
  const used = available.flatMap(line => line.numbers);
  assert.equal(new Set(used).size, used.length);
  assert.deepEqual(composed.lines.map(line => line.role), ['core', 'spread', 'guard']);
});

test('Guard includes an ending that is not the single most-supported digit in a 3+ pool', () => {
  const wide = buildPivotWorkbench(SCREENSHOT, {
    ...borrowedIncludeSkip,
    operators: { add: true, direct: true, borrowed: true },
    skipSharedPivotDigit: false
  });
  assert.ok(wide.combined.digits.length >= 3);
  const composed = composePoolLines(wide);
  const guard = composed.lines.find(line => line.role === 'guard');
  if (guard.available) {
    assert.ok(guard.digits.some(digit => digit !== composed.mostSupported));
  } else {
    const spread = composed.lines.find(line => line.role === 'spread');
    assert.equal(spread.available, true);
    assert.ok(spread.digits.some(digit => digit !== composed.mostSupported));
  }
});

test('reasons cite a real workbench equation, not a probability', () => {
  const { workbench, composed } = composeScreenshot();
  const reasons = composed.lines.flatMap(line => line.positions.map(item => item.reason));
  assert.ok(reasons.length > 0);
  reasons.forEach(reason => {
    assert.match(reason, /ending [0-9]/);
    assert.doesNotMatch(reason, /%/);
    assert.doesNotMatch(reason, /unordered inclusion/i);
  });
  const arithmetic = workbench.pool.equations.find(item => item.operation === 'borrowed');
  assert.ok(reasons.some(reason => reason.includes(arithmetic.explanation) || /pivot/.test(reason)));
  assert.equal(reasonForNumber(17, 'guard', {
    equations: workbench.pool.equations,
    pivots: [8],
    mostSupported: 8,
    lineNumbers: [2, 7, 12, 17, 22]
  }).includes('17'), true);
});

test('dropping an equation changes the composed tickets', () => {
  const full = composeScreenshot();
  const two = full.workbench.pool.equations.filter(item => item.result === 2);
  const dropped = composeScreenshot({
    disabledEquations: two.map(equationKey)
  });
  assert.notDeepEqual(
    full.composed.lines.map(line => line.numbers.join(',')),
    dropped.composed.lines.map(line => line.numbers.join(','))
  );
});

test('composer does not read a later draw', () => {
  const source = [{ id: 'a', date: '2026-08-28', numbers: [15, 25, 28, 30, 38] }];
  const first = composePoolLines(buildPivotWorkbench(source, borrowedIncludeSkip));
  const withLater = composePoolLines(buildPivotWorkbench([
    { id: 'a', date: '2026-08-28', numbers: [15, 25, 28, 30, 38] },
    { id: 'b', date: '2026-08-29', numbers: [1, 2, 3, 4, 5] }
  ], borrowedIncludeSkip));
  assert.notEqual(
    (withLater.lines.find(line => line.available)?.numbers || []).join(','),
    (first.lines.find(line => line.available)?.numbers || []).join(',')
  );
  const cloned = [{ id: 'a', date: '2026-08-28', numbers: [15, 25, 28, 30, 38] }];
  const before = composePoolLines(buildPivotWorkbench(cloned, borrowedIncludeSkip));
  cloned.push({ id: 'b', date: '2026-08-29', numbers: [10, 17, 32, 37, 38] });
  const afterSourceOnly = composePoolLines(buildPivotWorkbench(cloned.slice(0, 1), borrowedIncludeSkip));
  assert.deepEqual(afterSourceOnly.lines.map(line => line.numbers), before.lines.map(line => line.numbers));
});

test('a pool under 3 digits does not invent Quick Picks', () => {
  const composed = composePoolLines({
    combined: { digits: [8, 2] },
    pool: { equations: [] },
    activePivots: [8],
    source: { numbers: [8, 18, 28, 30, 38] }
  });
  assert.equal(composed.available, false);
  assert.ok(composed.lines.every(line => line.available === false && line.numbers.length === 0));
  assert.match(composed.unavailableReason, /under 3/);
});

test('composer is deterministic for a fixed source row and settings', () => {
  const first = composeScreenshot();
  const second = composeScreenshot();
  assert.deepEqual(first.composed, second.composed);
});

test('system line labels prefer Core/Spread/Guard from analyzer 10', () => {
  assert.equal(systemLineLabel({ role: 'core', rank: 1 }, 10), 'Core');
  assert.equal(systemLineLabel({ rank: 2 }, 10), 'Spread');
  assert.equal(systemLineLabel({ rank: 1 }, 9), 'System A');
});
