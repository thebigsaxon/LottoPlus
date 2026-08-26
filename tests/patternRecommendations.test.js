import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_CASH_5 } from '../js/sampleData.js';
import {
  projectNextPatternSignals,
  rankPatternRecommendationsByColumn,
  walkForwardPatternPerformance
} from '../js/patternRecommendations.js';

const sourceDraws = [
  { date: '2026-08-21', numbers: [1, 2, 3, 4, 5] },
  { date: '2026-08-22', numbers: [2, 11, 13, 15, 16] }
];

test('pattern projections include all seven families with concrete Ball targets', () => {
  const signals = projectNextPatternSignals(sourceDraws);
  const patterns = new Set(signals.map(signal => signal.pattern));

  assert.deepEqual([...patterns].sort(), [
    'diagonal', 'inline', 'lPattern', 'repeat', 'sister', 'sisterOutput', 'vertical'
  ]);
  assert.ok(signals.every(signal => Number.isInteger(signal.targetColumn)
    && signal.targetColumn >= 0 && signal.targetColumn < 5));
});

test('mirrored diagonal, sister-output, and L signals route to the intended columns', () => {
  const signals = projectNextPatternSignals(sourceDraws);
  assert.ok(signals.some(signal => signal.pattern === 'diagonal'
    && signal.sourceColumns.join(',') === '0,1' && signal.targetColumn === 2));
  assert.ok(signals.some(signal => signal.pattern === 'diagonal'
    && signal.sourceColumns.join(',') === '4,3' && signal.targetColumn === 2));
  assert.ok(signals.some(signal => signal.pattern === 'sisterOutput'
    && signal.sourceColumns.join(',') === '2,2' && signal.targetColumn === 1));
  assert.ok(signals.some(signal => signal.pattern === 'sisterOutput'
    && signal.sourceColumns.join(',') === '2,2' && signal.targetColumn === 3));
  assert.ok(signals.some(signal => signal.pattern === 'lPattern'
    && signal.sourceColumns.join(',') === '0,1' && signal.targetColumn === 0));
  assert.ok(signals.some(signal => signal.pattern === 'lPattern'
    && signal.sourceColumns.join(',') === '0,1' && signal.targetColumn === 1));
});

test('rankings return five Ball columns with three unique normalized candidates', () => {
  const rankings = rankPatternRecommendationsByColumn(SAMPLE_CASH_5);
  assert.equal(rankings.length, 5);
  rankings.forEach((result, column) => {
    assert.equal(result.column, column);
    assert.equal(result.candidates.length, 3);
    assert.equal(new Set(result.candidates.map(candidate => candidate.digit)).size, 3);
    assert.deepEqual(result.candidates.map(candidate => candidate.rank), [1, 2, 3]);
    assert.equal(result.candidates[0].score, 100);
    assert.ok(result.candidates[0].score >= result.candidates[1].score);
    assert.ok(result.candidates[1].score >= result.candidates[2].score);
  });
});

test('equal evidence uses family count, signal count, and lower digit tie breaks', () => {
  const rankings = rankPatternRecommendationsByColumn([
    { date: '2026-08-22', numbers: [1, 2, 3, 4, 5] }
  ]);
  assert.deepEqual(rankings[0].candidates.map(candidate => candidate.digit), [1, 3, 9]);
});

test('each family contributes only its strongest smoothed reliability', () => {
  const rankings = rankPatternRecommendationsByColumn(SAMPLE_CASH_5);
  const candidates = rankings.flatMap(result => result.candidates);
  const repeatedFamilyCandidate = candidates.find(candidate => (
    candidate.families.some(family => family.signalCount > 1)
  ));
  assert.ok(repeatedFamilyCandidate);
  const expected = repeatedFamilyCandidate.families.reduce((sum, family) => sum + family.reliability, 0);
  assert.ok(Math.abs(repeatedFamilyCandidate.rawScore - expected) < 0.0000001);
  repeatedFamilyCandidate.families.forEach(family => {
    assert.equal(family.reliability, (family.hits + 1) / (family.trials + 2));
  });
});

test('ranking is chronological and restricted to the newest 50 valid draws', () => {
  const draws = Array.from({ length: 52 }, (_, index) => ({
    date: `2026-${String(index + 1).padStart(3, '0')}`,
    numbers: [1 + (index % 5), 11 + (index % 5), 21 + (index % 5), 31 + (index % 5), 41 + (index % 2)]
  }));
  const newestFifty = draws.slice(-50);
  assert.deepEqual(
    rankPatternRecommendationsByColumn(draws),
    rankPatternRecommendationsByColumn(newestFifty)
  );
  assert.deepEqual(
    rankPatternRecommendationsByColumn([...draws].reverse()),
    rankPatternRecommendationsByColumn(draws)
  );
});

test('walk-forward evaluations never change when later targets are appended', () => {
  const draws = [...SAMPLE_CASH_5]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12);
  const prefix = draws.slice(0, -1);
  const prefixPerformance = walkForwardPatternPerformance(prefix);
  const fullPerformance = walkForwardPatternPerformance(draws);
  const finalDate = draws.at(-1).date;

  assert.deepEqual(
    fullPerformance.evaluations.filter(evaluation => evaluation.targetDate !== finalDate),
    prefixPerformance.evaluations
  );
});

test('walk-forward rates expose exact hits, trials, and the 25-trial threshold', () => {
  const short = rankPatternRecommendationsByColumn(sourceDraws);
  assert.ok(short.flatMap(result => result.candidates).every(candidate => !candidate.walkForwardSufficient));

  const performance = walkForwardPatternPerformance(SAMPLE_CASH_5);
  performance.rankStats.forEach(stats => {
    assert.ok(stats.trials >= 25);
    assert.equal(stats.sufficient, true);
    assert.equal(stats.rate, stats.hits / stats.trials);
  });
});

test('empty history has no recommendations and sparse history has no fabricated backtest rate', () => {
  assert.deepEqual(rankPatternRecommendationsByColumn([]), []);
  const rankings = rankPatternRecommendationsByColumn([
    { date: '2026-08-22', numbers: [1, 2, 3, 4, 5] }
  ]);
  assert.equal(rankings.length, 5);
  rankings.flatMap(result => result.candidates).forEach(candidate => {
    assert.equal(candidate.walkForwardTrials, 0);
    assert.equal(candidate.walkForwardRate, null);
    assert.equal(candidate.walkForwardSufficient, false);
  });
});
