import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  forecastReducedPool, selectNestedPools, poolShape, balancedPool, coverageBaseline
} from '../js/poolReductionAgent.js';

const archive = JSON.parse(await readFile(new URL('./fixtures/cash5-history.json', import.meta.url), 'utf8')).draws;

function checkPools(result) {
  for (const size of [20, 18, 16]) {
    const pool = result.pools[size];
    assert.equal(pool.length, size);
    assert.equal(new Set(pool).size, size);
    assert.ok(pool.every(n => Number.isInteger(n) && n >= 1 && n <= 42));
    assert.deepEqual(pool, [...pool].sort((a, b) => a - b));
    const shape = poolShape(pool);
    const minimum = Math.floor(size * 0.4);
    for (const count of [shape.odd, shape.even, shape.low, shape.high]) assert.ok(count >= minimum);
    assert.equal(balancedPool(pool), true);
  }
  assert.ok(result.pools[18].every(n => result.pools[20].includes(n)));
  assert.ok(result.pools[16].every(n => result.pools[18].includes(n)));
  assert.equal(result.removals.length, 4);
  assert.deepEqual(result.removals.map(r => [r.fromSize, r.toSize]), [[20, 19], [19, 18], [18, 17], [17, 16]]);
}

test('uniform ties are repeatable and nested pools meet exact size and balance rules', () => {
  const uniform = Array(42).fill(1);
  const before = [...uniform];
  const first = selectNestedPools(uniform, '2026-09-11');
  checkPools(first);
  assert.deepEqual(selectNestedPools(uniform, '2026-09-11'), first);
  assert.deepEqual(uniform, before);
});

test('strong one-quadrant evidence cannot violate parity or range coverage during nested removals', () => {
  for (const favored of [n => n % 2 && n <= 21, n => !(n % 2) && n > 21]) {
    const scores = Array.from({ length: 42 }, (_, i) => favored(i + 1) ? 100 + i : 0);
    checkPools(selectNestedPools(scores, '2026-09-10'));
  }
  assert.throws(() => selectNestedPools(Array(41).fill(1), '2026-09-11'), /42 finite/);
  assert.throws(() => selectNestedPools(Array(42).fill(NaN), '2026-09-11'), /42 finite/);
});

test('a historical forecast is invariant to appended and altered future results and input order', () => {
  const prefix = archive.slice(0, 105);
  const sourceDate = prefix.at(-1).date;
  const frozen = JSON.stringify(prefix);
  const expected = forecastReducedPool(prefix);
  const future = archive.slice(105, 115).map(draw => ({ ...draw, numbers: [1, 2, 3, 4, 5] }));
  const replay = forecastReducedPool([...prefix, ...future].reverse(), { throughDate: sourceDate });
  assert.deepEqual(replay, expected);
  assert.equal(JSON.stringify(prefix), frozen);
  assert.equal(expected.sourceDate, sourceDate);
  assert.equal(expected.historyCount, prefix.length);
  for (const component of expected.language.components) {
    assert.ok(component.matches.every(pair => pair.targetDate <= sourceDate && pair.sourceDate < pair.targetDate));
  }
  checkPools(expected);
});

test('all-even and all-odd draws receive synthetic companions that restore odd ending support', () => {
  for (const [numbers, companion] of [[[6, 8, 34, 36, 40], 1], [[1, 3, 15, 27, 39], 0]]) {
    const result = forecastReducedPool([{ date: '2026-09-11', numbers }]);
    assert.equal(result.pivot.companion, companion);
    assert.equal(result.pivot.synthetic, true);
    assert.ok(result.pivot.primaryDigits.length > 0);
    assert.ok(result.pivot.primaryDigits.every(n => n % 2 === 0));
    assert.ok(result.pivot.companionDigits.length > 0);
    assert.ok(result.pivot.companionDigits.every(n => n % 2 === 1));
    assert.equal(result.numbers.length, 42);
    assert.ok(result.numbers.every(row => Number.isFinite(row.score) && row.score > 0));
    checkPools(result);
  }
});

test('reduced pools represent full numbers and do not automatically admit every number sharing an ending', () => {
  const result = selectNestedPools(Array.from({ length: 42 }, (_, i) => i + 1), '2026-09-11');
  const pool = result.pools[20];
  const endings = new Set(pool.map(n => n % 10));
  const endingExpanded = Array.from({ length: 42 }, (_, i) => i + 1).filter(n => endings.has(n % 10));
  assert.ok(endingExpanded.length > pool.length);
  const excludedWithSupportedEnding = endingExpanded.find(n => !pool.includes(n));
  assert.ok(Number.isInteger(excludedWithSupportedEnding));
  assert.equal(pool.includes(excludedWithSupportedEnding), false);
});

test('coverage baselines are the full-number hypergeometric distribution for five from 42', () => {
  for (const size of [16, 18, 20, 42]) {
    const baseline = coverageBaseline(size);
    assert.ok(Math.abs(baseline.distribution.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    const expectation = baseline.distribution.reduce((a, p, hits) => a + p * hits, 0);
    assert.ok(Math.abs(expectation - 5 * size / 42) < 1e-12);
    assert.equal(baseline.expectedHits, 5 * size / 42);
    let allFive = 1;
    for (let i = 0; i < 5; i++) allFive *= (size - i) / (42 - i);
    assert.ok(Math.abs(baseline.allFive - allFive) < 1e-12);
  }
  assert.deepEqual(coverageBaseline(42).distribution, [0, 0, 0, 0, 0, 1]);
  assert.throws(() => coverageBaseline(4), /5–42/);
  assert.throws(() => coverageBaseline(43), /5–42/);
});
