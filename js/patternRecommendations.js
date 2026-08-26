import { mathematicalSequenceRelationships, onesDigit } from './onesAnalysis.js';

const MAX_RESEARCH_DRAWS = 50;
const MIN_BACKTEST_TRIALS = 25;

export const PATTERN_FAMILIES = {
  repeat: { label: 'Adjacent repeat' },
  vertical: { label: 'Same-column run' },
  sister: { label: 'Sister shift' },
  inline: { label: 'Inline math' },
  diagonal: { label: 'Diagonal math' },
  sisterOutput: { label: 'Sister output' },
  lPattern: { label: 'L pattern' }
};

function chronologicalDraws(draws) {
  return (Array.isArray(draws) ? draws : [])
    .filter(draw => (
      typeof draw?.date === 'string'
      && draw.date.length > 0
      && Array.isArray(draw.numbers)
      && draw.numbers.length === 5
      && draw.numbers.every(number => Number.isInteger(Number(number)) && Number(number) >= 1 && Number(number) <= 42)
    ))
    .map(draw => ({
      ...draw,
      numbers: draw.numbers.map(Number),
      digits: draw.numbers.map(onesDigit)
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_RESEARCH_DRAWS);
}

function mathSignals(left, right, pattern, targetColumn, sourceColumns) {
  return mathematicalSequenceRelationships(left, right).map(relationship => ({
    digit: relationship.result,
    pattern,
    operation: relationship.operation,
    targetColumn,
    sourceColumns,
    explanation: relationship.explanation
  }));
}

/** Project active patterns into concrete next-draw Ball positions. */
export function projectNextPatternSignals(draws = []) {
  const safeDraws = chronologicalDraws(draws);
  if (!safeDraws.length) return [];
  const latest = safeDraws.at(-1).digits;
  const previous = safeDraws.at(-2)?.digits || [];
  const signals = [];

  if (previous.length) {
    latest.forEach((digit, latestColumn) => {
      previous.forEach((previousDigit, previousColumn) => {
        if (previousDigit !== digit) return;
        signals.push({
          digit,
          pattern: 'repeat',
          operation: 'repeat',
          targetColumn: latestColumn,
          sourceColumns: [previousColumn, latestColumn],
          explanation: `Digit ${digit} matched across adjacent draws`
        });
      });
    });

    latest.forEach((digit, column) => {
      if (previous[column] !== digit) return;
      signals.push({
        digit,
        pattern: 'vertical',
        operation: 'repeat',
        targetColumn: column,
        sourceColumns: [column, column],
        explanation: `Digit ${digit} continued in Ball ${column + 1}`
      });
    });

    previous.forEach((digit, previousColumn) => {
      latest.forEach((latestDigit, latestColumn) => {
        const movement = latestColumn - previousColumn;
        const targetColumn = latestColumn + movement;
        if (digit !== latestDigit || Math.abs(movement) !== 1
            || targetColumn < 0 || targetColumn >= latest.length) return;
        signals.push({
          digit,
          pattern: 'sister',
          operation: movement < 0 ? 'left' : 'right',
          targetColumn,
          sourceColumns: [previousColumn, latestColumn],
          explanation: `Digit ${digit} continued its sister shift ${movement < 0 ? 'left' : 'right'}`
        });
      });
    });

    previous.forEach((digit, column) => {
      if (latest[column] === undefined) return;
      signals.push(...mathSignals(digit, latest[column], 'inline', column, [column, column]));
      [-1, 1].forEach(outputDelta => {
        const targetColumn = column + outputDelta;
        if (targetColumn < 0 || targetColumn >= latest.length) return;
        signals.push(...mathSignals(digit, latest[column], 'sisterOutput', targetColumn, [column, column]));
      });
    });

    previous.forEach((digit, previousColumn) => {
      [-1, 1].forEach(movement => {
        const latestColumn = previousColumn + movement;
        const targetColumn = latestColumn + movement;
        if (latest[latestColumn] === undefined || targetColumn < 0 || targetColumn >= latest.length) return;
        signals.push(...mathSignals(digit, latest[latestColumn], 'diagonal', targetColumn, [previousColumn, latestColumn]));
      });
    });
  }

  for (let leftColumn = 0; leftColumn < latest.length - 1; leftColumn += 1) {
    const rightColumn = leftColumn + 1;
    [leftColumn, rightColumn].forEach(targetColumn => {
      signals.push(...mathSignals(
        latest[leftColumn], latest[rightColumn], 'lPattern', targetColumn, [leftColumn, rightColumn]
      ));
    });
  }

  const unique = new Map();
  signals.forEach(signal => {
    const key = [signal.pattern, signal.operation, signal.digit, signal.targetColumn, signal.sourceColumns.join(',')].join(':');
    if (!unique.has(key)) unique.set(key, signal);
  });
  return [...unique.values()];
}

function reliabilityKey(signal) {
  return `${signal.pattern}:${signal.operation}`;
}

function buildReliability(draws) {
  const safeDraws = chronologicalDraws(draws);
  const stats = new Map();
  for (let targetIndex = 1; targetIndex < safeDraws.length; targetIndex += 1) {
    const history = safeDraws.slice(0, targetIndex);
    const actual = safeDraws[targetIndex].digits;
    projectNextPatternSignals(history).forEach(signal => {
      const key = reliabilityKey(signal);
      const item = stats.get(key) || { hits: 0, trials: 0 };
      item.trials += 1;
      if (actual[signal.targetColumn] === signal.digit) item.hits += 1;
      stats.set(key, item);
    });
  }
  return stats;
}

function scoreCurrentColumns(draws, limit = 3) {
  const safeDraws = chronologicalDraws(draws);
  const reliability = buildReliability(safeDraws);
  const byColumn = Array.from({ length: 5 }, () => new Map());

  projectNextPatternSignals(safeDraws).forEach(signal => {
    const definition = PATTERN_FAMILIES[signal.pattern];
    if (!definition || !Number.isInteger(signal.targetColumn)) return;
    const stats = reliability.get(reliabilityKey(signal)) || { hits: 0, trials: 0 };
    const smoothedReliability = (stats.hits + 1) / (stats.trials + 2);
    const candidates = byColumn[signal.targetColumn];
    const candidate = candidates.get(signal.digit) || { digit: signal.digit, familyMap: new Map(), signalCount: 0 };
    const family = candidate.familyMap.get(signal.pattern) || {
      key: signal.pattern,
      label: definition.label,
      reliability: 0,
      hits: 0,
      trials: 0,
      signalCount: 0,
      examples: []
    };
    family.signalCount += 1;
    if (smoothedReliability > family.reliability) {
      family.reliability = smoothedReliability;
      family.hits = stats.hits;
      family.trials = stats.trials;
    }
    if (signal.explanation && !family.examples.includes(signal.explanation) && family.examples.length < 2) {
      family.examples.push(signal.explanation);
    }
    candidate.signalCount += 1;
    candidate.familyMap.set(signal.pattern, family);
    candidates.set(signal.digit, candidate);
  });

  return byColumn.map((candidateMap, column) => {
    const candidates = [...candidateMap.values()].map(candidate => {
      const families = [...candidate.familyMap.values()]
        .sort((a, b) => b.reliability - a.reliability || a.label.localeCompare(b.label));
      return {
        digit: candidate.digit,
        rawScore: families.reduce((sum, family) => sum + family.reliability, 0),
        familyCount: families.length,
        signalCount: candidate.signalCount,
        families
      };
    }).sort((a, b) => b.rawScore - a.rawScore
      || b.familyCount - a.familyCount
      || b.signalCount - a.signalCount
      || a.digit - b.digit)
      .slice(0, Math.max(0, limit));
    const topScore = candidates[0]?.rawScore || 0;
    return {
      column,
      candidates: candidates.map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
        score: topScore ? Math.round((candidate.rawScore / topScore) * 100) : 0
      }))
    };
  });
}

/** Evaluate historical targets using only the draws that preceded each one. */
export function walkForwardPatternPerformance(draws = [], limit = 3) {
  const safeDraws = chronologicalDraws(draws);
  const rankStats = Array.from({ length: limit }, (_, index) => ({
    rank: index + 1,
    hits: 0,
    trials: 0,
    rate: null,
    sufficient: false
  }));
  const evaluations = [];

  for (let targetIndex = 2; targetIndex < safeDraws.length; targetIndex += 1) {
    const history = safeDraws.slice(0, targetIndex);
    const actual = safeDraws[targetIndex];
    const rankings = scoreCurrentColumns(history, limit);
    rankings.forEach(result => {
      result.candidates.forEach(candidate => {
        const stats = rankStats[candidate.rank - 1];
        const hit = actual.digits[result.column] === candidate.digit;
        stats.trials += 1;
        if (hit) stats.hits += 1;
        evaluations.push({
          targetDate: actual.date,
          column: result.column,
          rank: candidate.rank,
          digit: candidate.digit,
          actualDigit: actual.digits[result.column],
          hit
        });
      });
    });
  }

  rankStats.forEach(stats => {
    stats.rate = stats.trials ? stats.hits / stats.trials : null;
    stats.sufficient = stats.trials >= MIN_BACKTEST_TRIALS;
  });
  return { rankStats, evaluations };
}

/** Return three per-Ball recommendations with scores and backtest evidence. */
export function rankPatternRecommendationsByColumn(draws = [], limit = 3) {
  const safeDraws = chronologicalDraws(draws);
  if (!safeDraws.length) return [];
  const rankings = scoreCurrentColumns(safeDraws, limit);
  const { rankStats } = walkForwardPatternPerformance(safeDraws, limit);
  return rankings.map(result => ({
    column: result.column,
    windowSize: safeDraws.length,
    candidates: result.candidates.map(candidate => {
      const performance = rankStats[candidate.rank - 1] || { hits: 0, trials: 0, rate: null, sufficient: false };
      return {
        ...candidate,
        walkForwardHits: performance.hits,
        walkForwardTrials: performance.trials,
        walkForwardRate: performance.rate,
        walkForwardSufficient: performance.sufficient
      };
    })
  }));
}
