import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_CASH_5 } from '../js/sampleData.js';
import {
  analyzeNextDrawBoard,
  analyzeNextDrawBoardV5,
  buildOptimizedSystemLines,
  buildOptimizedSystemLinesV5,
  feasibleRangeForColumn,
  projectNextPatternSignals,
  rankPatternRecommendationsByColumn,
  scoreNextDrawColumnsV6,
  walkForwardPatternPerformance,
  walkForwardPatternPerformanceV5
} from '../js/patternRecommendations.js';

const sourceDraws = [
  { date: '2026-08-21', numbers: [1, 2, 3, 4, 5] },
  { date: '2026-08-22', numbers: [2, 11, 13, 15, 16] }
];

const CURRENT_FIFTY = [
  ['2026-08-26', [14, 16, 19, 31, 41]], ['2026-08-25', [2, 4, 13, 20, 39]],
  ['2026-08-24', [16, 17, 28, 33, 40]], ['2026-08-23', [1, 13, 17, 40, 41]],
  ['2026-08-22', [1, 19, 20, 24, 38]], ['2026-08-21', [3, 22, 23, 24, 35]],
  ['2026-08-20', [1, 3, 12, 23, 37]], ['2026-08-19', [8, 11, 28, 32, 34]],
  ['2026-08-18', [1, 8, 12, 33, 38]], ['2026-08-17', [13, 17, 33, 38, 39]],
  ['2026-08-16', [1, 3, 5, 32, 38]], ['2026-08-15', [2, 14, 15, 32, 36]],
  ['2026-08-14', [15, 21, 27, 32, 40]], ['2026-08-13', [1, 13, 24, 33, 34]],
  ['2026-08-12', [16, 17, 32, 39, 42]], ['2026-08-11', [1, 15, 17, 33, 38]],
  ['2026-08-10', [12, 28, 33, 34, 38]], ['2026-08-09', [10, 12, 18, 20, 22]],
  ['2026-08-08', [12, 23, 27, 33, 35]], ['2026-08-07', [9, 23, 27, 39, 40]],
  ['2026-08-06', [13, 20, 23, 33, 37]], ['2026-08-05', [3, 13, 21, 29, 42]],
  ['2026-08-04', [1, 5, 6, 11, 39]], ['2026-08-03', [11, 23, 25, 37, 42]],
  ['2026-08-02', [1, 21, 22, 33, 35]], ['2026-08-01', [2, 19, 27, 33, 42]],
  ['2026-07-31', [7, 10, 12, 29, 42]], ['2026-07-30', [3, 14, 19, 30, 41]],
  ['2026-07-29', [3, 5, 7, 17, 37]], ['2026-07-28', [6, 7, 12, 27, 41]],
  ['2026-07-27', [4, 26, 32, 36, 42]], ['2026-07-26', [3, 4, 22, 30, 34]],
  ['2026-07-25', [3, 4, 23, 27, 34]], ['2026-07-24', [4, 19, 26, 28, 34]],
  ['2026-07-23', [5, 13, 20, 27, 36]], ['2026-07-22', [1, 5, 12, 20, 35]],
  ['2026-07-21', [4, 9, 15, 24, 31]], ['2026-07-20', [15, 17, 34, 36, 42]],
  ['2026-07-19', [14, 15, 26, 33, 36]], ['2026-07-18', [10, 22, 24, 29, 32]],
  ['2026-07-17', [7, 8, 11, 14, 42]], ['2026-07-16', [6, 21, 24, 38, 40]],
  ['2026-07-15', [1, 4, 17, 34, 41]], ['2026-07-14', [7, 8, 33, 35, 41]],
  ['2026-07-13', [1, 14, 27, 37, 39]], ['2026-07-12', [8, 9, 22, 26, 37]],
  ['2026-07-11', [11, 17, 25, 28, 38]], ['2026-07-10', [3, 15, 23, 35, 39]],
  ['2026-07-09', [5, 11, 23, 25, 39]], ['2026-07-08', [3, 18, 25, 35, 41]]
].map(([date, numbers], index) => ({ id: `fixture-${index}`, date, numbers }));

test('pattern projections include legacy and newly established families with concrete Ball targets', () => {
  const signals = projectNextPatternSignals(sourceDraws);
  assert.deepEqual([...new Set(signals.map(signal => signal.pattern))].sort(), [
    'consecutive', 'diagonal', 'inline', 'invertedL', 'lPattern', 'repeat', 'sister', 'sisterOutput', 'vertical'
  ]);
  assert.ok(signals.every(signal => Number.isInteger(signal.targetColumn)
    && signal.targetColumn >= 0 && signal.targetColumn < 5
    && Number.isInteger(signal.direction)));
});

test('mirrored diagonal, sister-output, and L signals route to intended columns', () => {
  const signals = projectNextPatternSignals(sourceDraws);
  assert.ok(signals.some(signal => signal.pattern === 'diagonal'
    && signal.sourceColumns.join(',') === '0,1' && signal.targetColumn === 2 && signal.direction === 1));
  assert.ok(signals.some(signal => signal.pattern === 'diagonal'
    && signal.sourceColumns.join(',') === '4,3' && signal.targetColumn === 2 && signal.direction === -1));
  assert.ok(signals.some(signal => signal.pattern === 'sisterOutput'
    && signal.sourceColumns.join(',') === '2,2' && signal.targetColumn === 1 && signal.direction === -1));
  assert.ok(signals.some(signal => signal.pattern === 'lPattern'
    && signal.sourceColumns.join(',') === '0,1' && signal.targetColumn === 1 && signal.direction === 1));
});

test('frozen version 5 remains available for evaluation comparisons', () => {
  const analysis = analyzeNextDrawBoardV5(CURRENT_FIFTY);
  assert.equal(analysis.version, 5);
  analysis.columns.forEach(column => assert.equal(new Set(column.candidates.map(candidate => candidate.digit)).size, 3));
  assert.ok(new Set(analysis.columns.map(column => column.candidates.map(candidate => candidate.digit).join(','))).size > 2);
});

test('ending candidates use position frequency, pattern lift, and HNCDE state', () => {
  const analysis = analyzeNextDrawBoardV5(CURRENT_FIFTY);
  analysis.columns.forEach((column, index) => {
    assert.equal(column.column, index);
    assert.equal(new Set(column.candidates.map(candidate => candidate.digit)).size, 3);
    assert.deepEqual(column.candidates.map(candidate => candidate.rank), [1, 2, 3]);
    column.candidates.forEach(candidate => {
      assert.ok(Math.abs(candidate.endingScore
        - ((candidate.frequencyScore * 0.7) + (candidate.patternScore * 0.2) + (candidate.stateScore * 0.1))) < 0.0000001);
      assert.equal(candidate.combinedScore, candidate.endingScore);
      assert.ok(Array.isArray(candidate.stateLabels) && candidate.stateLabels.length >= 1);
      assert.equal(new Set(candidate.families.map(family => family.key)).size, candidate.families.length);
      assert.ok(candidate.families.every(family => family.lift > 0
        && family.posteriorRate >= family.baselineRate));
      assert.ok(Math.abs(candidate.patternLift
        - candidate.families.reduce((sum, family) => sum + family.lift, 0)) < 0.0000001);
    });
  });
});

test('full-number history uses latest plus prior three without excluding repeats', () => {
  const analysis = analyzeNextDrawBoardV5(CURRENT_FIFTY, { includeWalkForward: false });
  const first = analysis.columns[0];
  assert.deepEqual(first.stream.recentValues, [1, 16, 2, 14]);
  assert.deepEqual(first.stream.deltas, [15, -14, 12]);
  assert.equal(first.stream.averageDelta, 13 / 3);
  assert.equal(first.stream.forecast, 14 + (13 / 3));
  analysis.columns.forEach((column, index) => {
    const range = feasibleRangeForColumn(index);
    assert.ok(column.numberCandidates.some(candidate => candidate.appearances > 0));
    column.numberCandidates.forEach(candidate => {
      assert.ok(candidate.number >= range.min && candidate.number <= range.max);
      assert.ok(Math.abs(candidate.numberScore
        - ((candidate.numberFrequencyScore * 0.8) + (candidate.recencyScore * 0.1) + (candidate.streamScore * 0.1))) < 0.0000001);
      assert.ok(Math.abs(candidate.combinedScore
        - ((candidate.endingScore * 0.7) + (candidate.numberScore * 0.3))) < 0.0000001);
    });
  });
});

test('optimized lines are increasing, avoid triple endings, and reuse no numbers across lines', () => {
  const columns = Array.from({ length: 5 }, (_, column) => ({
    column,
    available: true,
    numberCandidates: [0, 1, 2].map(offset => {
      const number = 1 + (column * 9) + offset;
      return {
        number,
        digit: number % 10,
        combinedScore: 100 - (offset * 5),
        endingScore: 100 - (offset * 5),
        numberScore: 100 - (offset * 5),
        patternScore: 90 - (offset * 4),
        streamScore: 100 - (offset * 6),
        patternLift: 0.1,
        familyCount: 1,
        families: []
      };
    })
  }));
  const lines = buildOptimizedSystemLines(columns, 3);
  assert.ok(lines.every(line => line.available));
  lines.forEach(line => {
    assert.equal(new Set(line.numbers).size, 5);
    assert.ok(line.numbers.every((number, index) => index === 0 || number > line.numbers[index - 1]));
    const endingCounts = line.digits.reduce((counts, digit) => counts.set(digit, (counts.get(digit) || 0) + 1), new Map());
    assert.ok(Math.max(...endingCounts.values()) <= 2);
  });
  for (let left = 0; left < lines.length; left += 1) {
    for (let right = left + 1; right < lines.length; right += 1) {
      assert.ok(lines[left].numbers.filter((number, index) => number !== lines[right].numbers[index]).length >= 2);
    }
  }
  assert.equal(new Set(lines.flatMap(line => line.numbers)).size, 15);
  for (let column = 0; column < 5; column += 1) {
    assert.equal(new Set(lines.map(line => line.digits[column])).size, 3);
  }
});

test('joint portfolio search beats sequential strongest-line-first assembly when greedy is suboptimal', () => {
  const numberPools = [
    [1, 2, 3, 4, 5],
    [11, 12, 13, 14, 15],
    [21, 22, 23, 24, 25],
    [31, 32, 33, 34, 35],
    [38, 39, 40, 41, 42]
  ];
  const columns = numberPools.map((numbers, column) => ({
    column,
    available: true,
    numberCandidates: numbers.map((number, index) => {
      const probability = (5 - index) / 10;
      return {
        number,
        digit: number % 10,
        modelProbability: probability,
        endingProbability: probability,
        tensProbability: probability,
        combinedScore: probability * 100,
        endingScore: probability * 100,
        numberScore: probability * 100,
        patternScore: 0,
        streamScore: 0
      };
    })
  }));
  const joint = buildOptimizedSystemLines(columns, 3);
  const greedy = buildOptimizedSystemLinesV5(columns, 3);
  const jointExact = joint.reduce((sum, line) => sum + line.expectedExactHits, 0);
  const greedyExact = greedy.reduce((sum, line) => (
    sum + line.positions.reduce((lineSum, item) => lineSum + item.modelProbability, 0)
  ), 0);

  assert.deepEqual(joint.map(line => line.numbers), [
    [1, 11, 22, 32, 38],
    [3, 13, 21, 31, 40],
    [2, 12, 23, 33, 39]
  ]);
  assert.ok(jointExact > greedyExact);
  assert.equal(Math.round(jointExact * 10), 60);
  assert.equal(Math.round(greedyExact * 10), 58);
});

test('whole-line assembly rejects a higher-scoring triple-ending math line', () => {
  const topNumbers = [1, 13, 23, 33, 42];
  const alternatives = [2, 14, 24, 34, 41];
  const columns = Array.from({ length: 5 }, (_, column) => ({
    column,
    available: true,
    numberCandidates: [topNumbers[column], alternatives[column]].map((number, index) => ({
      number,
      digit: number % 10,
      combinedScore: 100 - (index * 10),
      endingScore: 100 - (index * 10),
      numberScore: 100 - (index * 10),
      patternScore: 0,
      streamScore: 0,
      patternLift: 0,
      familyCount: 0,
      families: []
    }))
  }));
  const [line] = buildOptimizedSystemLines(columns, 1);
  assert.equal(line.available, true);
  assert.notDeepEqual(line.numbers, topNumbers);
  const endingCounts = line.digits.reduce((counts, digit) => counts.set(digit, (counts.get(digit) || 0) + 1), new Map());
  assert.ok(Math.max(...endingCounts.values()) <= 2);
});

test('previously used numbers remain eligible instead of making a Ball unavailable', () => {
  const draws = Array.from({ length: 38 }, (_, index) => ({
    date: `2026-${String(index + 1).padStart(3, '0')}`,
    numbers: [index + 1, 39, 40, 41, 42]
  }));
  const analysis = analyzeNextDrawBoard(draws, { includeWalkForward: false });
  assert.equal(analysis.columns[0].available, true);
  assert.ok(analysis.columns[0].numberCandidates.some(candidate => candidate.numberAppearances > 0));
  assert.ok(analysis.lines.some(line => line.available));
});

test('ranking is chronological and restricted to newest 50 valid draws', () => {
  const extra = [
    { date: '2026-07-06', numbers: [1, 2, 3, 4, 5] },
    { date: '2026-07-07', numbers: [5, 6, 7, 8, 9] }
  ];
  assert.deepEqual(
    rankPatternRecommendationsByColumn([...extra, ...CURRENT_FIFTY]),
    rankPatternRecommendationsByColumn(CURRENT_FIFTY)
  );
  assert.deepEqual(
    rankPatternRecommendationsByColumn([...CURRENT_FIFTY].reverse()),
    rankPatternRecommendationsByColumn(CURRENT_FIFTY)
  );
});

test('EB50 probabilities ignore observations older than the latest 50 draws', () => {
  const older = [
    { date: '2026-07-06', numbers: [1, 2, 3, 4, 5] },
    { date: '2026-07-07', numbers: [5, 6, 7, 8, 9] }
  ];
  const policy = {
    kind: 'eb50', priorStrength: 50, patternWeight: 0, stateWeight: 0,
    evidenceId: 'test-eb50'
  };
  assert.deepEqual(
    scoreNextDrawColumnsV6([...older, ...CURRENT_FIFTY], 3, policy),
    scoreNextDrawColumnsV6(CURRENT_FIFTY, 3, policy)
  );
});

test('frozen v5 walk-forward evaluations remain leakage-free and reported per Ball and rank', () => {
  const prefix = CURRENT_FIFTY.slice(1);
  const prefixPerformance = walkForwardPatternPerformanceV5(prefix);
  const fullPerformance = walkForwardPatternPerformanceV5(CURRENT_FIFTY);
  const finalDate = [...CURRENT_FIFTY].sort((a, b) => a.date.localeCompare(b.date)).at(-1).date;
  assert.deepEqual(
    fullPerformance.evaluations.filter(evaluation => evaluation.targetDate !== finalDate),
    prefixPerformance.evaluations
  );
  fullPerformance.columnRankStats.flat().forEach(stats => {
    assert.ok(stats.trials >= 25);
    assert.equal(stats.sufficient, true);
    assert.equal(stats.endingRate, stats.endingHits / stats.trials);
    assert.equal(stats.numberRate, stats.numberHits / stats.trials);
  });
});

test('empty history is empty and the evidence model supports sparse valid history', () => {
  assert.deepEqual(rankPatternRecommendationsByColumn([]), []);
  const rankings = rankPatternRecommendationsByColumn(SAMPLE_CASH_5.slice(0, 3));
  assert.equal(rankings.length, 5);
  assert.ok(rankings.every(result => result.available && result.candidates.length === 3));
});

test('version 10 still exposes four independently scored study tracks', () => {
  const analysis = analyzeNextDrawBoard(CURRENT_FIFTY, { includeWalkForward: false });
  assert.equal(analysis.version, 10);
  assert.equal(analysis.policy.kind, 'control');
  assert.equal(analysis.policy.patternWeight, 0);
  assert.equal(analysis.policy.historyWeight, 0);
  assert.equal(analysis.targetAfterDate, '2026-08-26');
  analysis.columns.forEach(column => {
    assert.ok(Math.abs(column.allCandidates.reduce((sum, candidate) => sum + candidate.endingProbability, 0) - 1) < 1e-9);
    column.numberCandidates.forEach(candidate => {
      assert.ok(candidate.comboProbability > 0 && candidate.comboProbability <= 1);
      assert.ok(candidate.endingProbability > 0 && candidate.endingProbability <= 1);
      assert.ok(Math.abs(candidate.endingProbability - candidate.comboEndingProbability) < 1e-12);
      assert.ok(candidate.tensProbability > 0 && candidate.tensProbability <= 1);
      assert.ok(candidate.historyProbability > 0 && candidate.historyProbability <= 1);
      assert.ok(candidate.patternProbability > 0 && candidate.patternProbability <= 1);
      assert.ok(candidate.stateProbability > 0 && candidate.stateProbability <= 1);
    });
    const patternMass = column.allCandidates.reduce((sum, candidate) => sum + candidate.patternProbability, 0);
    const comboMass = column.allCandidates.reduce((sum, candidate) => sum + candidate.comboEndingProbability, 0);
    assert.ok(Math.abs(patternMass - 1) < 1e-9);
    assert.ok(Math.abs(comboMass - 1) < 1e-9);
    assert.notDeepEqual(
      column.allCandidates.map(candidate => candidate.patternProbability),
      column.allCandidates.map(candidate => candidate.comboEndingProbability)
    );
    assert.ok(column.sourceTops.combo.digit >= 0 && column.sourceTops.combo.digit <= 9);
  });
  assert.equal(analysis.sourceForecasts.length, 5);
  assert.deepEqual(analysis.trackForecasts.map(track => track.key), ['control', 'temporal', 'structure', 'hncde']);
  assert.deepEqual(analysis.trackForecasts.map(track => track.status), ['control', 'study', 'study', 'study']);
  assert.equal(analysis.promotionPolicy.activeTrack, 'control');
  assert.equal(analysis.promotionPolicy.promotedTrack, null);
  const pivot = analysis.trackForecasts.find(track => track.key === 'structure').pivotEvidence;
  assert.equal(pivot.sourceDate, '2026-08-26');
  assert.ok(pivot.columns.every(column => column.candidates.every(candidate => (
    candidate.number >= column.column + 1 && candidate.number <= 38 + column.column
  ))));
  assert.equal(analysis.lines.length, 3);
  assert.equal(new Set(analysis.lines.flatMap(line => line.numbers)).size, 15);
  analysis.lines.forEach(line => assert.equal(line.sourceTrack, 'control'));
  assert.equal(analysis.portfolio.uniqueNumberCount, 15);
  assert.ok(analysis.portfolio.expectedUnorderedHits > 0);
  assert.ok(analysis.portfolio.expectedExactHits > 0);
});

test('v6 walk-forward statistics are candidate-specific rather than rank slots', () => {
  const performance = walkForwardPatternPerformance(CURRENT_FIFTY);
  assert.ok(performance.candidateStats.length > 0);
  assert.ok(performance.candidateStats.every(stats => Number.isInteger(stats.digit)
    && Number.isInteger(stats.number) && stats.policy === 'control'));
  assert.equal(new Set(performance.candidateStats.map(stats => `${stats.column}:${stats.digit}:${stats.number}`)).size, performance.candidateStats.length);
});

test('new draw history leaves the combo line vote unchanged while study tracks can move', () => {
  const before = analyzeNextDrawBoard(CURRENT_FIFTY.slice(1), { includeWalkForward: false });
  const throughLatest = analyzeNextDrawBoard(CURRENT_FIFTY, { includeWalkForward: false });
  assert.deepEqual(
    before.columns.map(column => column.allCandidates.map(candidate => candidate.endingProbability)),
    throughLatest.columns.map(column => column.allCandidates.map(candidate => candidate.endingProbability))
  );
  assert.notDeepEqual(
    before.columns.map(column => column.allCandidates.map(candidate => candidate.historyProbability)),
    throughLatest.columns.map(column => column.allCandidates.map(candidate => candidate.historyProbability))
  );
});
