import { mathematicalSequenceRelationships, onesDigit } from './onesAnalysis.js';
import { buildDigitHeatTimeline } from './repeatSummary.js?v=6';
import {
  endingDistribution,
  normalizeDistribution,
  orderStatisticDistribution,
  shrinkDistribution,
  tensBandForNumber,
  tensDistribution
} from './orderStats.js?v=1';
import { V6_POLICY } from './v6Policy.js?v=1';
import {
  NEXT_DRAW_LIVE_POLICY,
  NEXT_DRAW_PROMOTION_POLICY,
  NEXT_DRAW_STUDY_POLICY,
  NEXT_DRAW_TRACKS,
  STUDY_SOURCE_KEYS
} from './nextDrawPolicy.js?v=2';
import { rankHistoricalSuccessors } from './futureWorkspace.js?v=11';
import { expandPivotPoolNumbers } from './pivotPools.js?v=2';

const MAX_RESEARCH_DRAWS = 50;
const MIN_STREAM_DRAWS = 4;
const MIN_BACKTEST_TRIALS = 25;
const SIGNAL_PRIOR_STRENGTH = 10;
const ENDING_PATTERN_WEIGHT = 0.2;
const ENDING_FREQUENCY_WEIGHT = 0.7;
const ENDING_STATE_WEIGHT = 0.1;
const NUMBER_STREAM_WEIGHT = 0.1;
const NUMBER_RECENCY_WEIGHT = 0.1;
const NUMBER_FREQUENCY_WEIGHT = 0.8;
const LINE_ENDING_WEIGHT = 0.7;
const LINE_NUMBER_WEIGHT = 0.3;
const SYSTEM_NUMBER_POOL_LIMIT = 15;
const MAX_STANDARD_ENDING_MULTIPLICITY = 2;
const SCORE_EPSILON = 1e-9;

export const NEXT_DRAW_ANALYZER_VERSION = 10;

export const PATTERN_FAMILIES = {
  repeat: { label: 'Adjacent repeat' },
  vertical: { label: 'Same-column run' },
  sister: { label: 'Sister shift' },
  knight: { label: 'Knight shift' },
  skipRow: { label: 'Skip-row run' },
  twin: { label: 'Twin endings' },
  consecutive: { label: 'Consecutive pair' },
  inline: { label: 'Inline math' },
  diagonal: { label: 'Diagonal math' },
  sisterOutput: { label: 'Sister output' },
  lPattern: { label: 'L pattern' },
  invertedL: { label: 'Inverted L pattern' }
};

export function feasibleRangeForColumn(column) {
  const safeColumn = Number(column);
  return { min: safeColumn + 1, max: 38 + safeColumn };
}

function chronologicalDraws(draws) {
  return (Array.isArray(draws) ? draws : [])
    .filter(draw => (
      typeof draw?.date === 'string'
      && draw.date.length > 0
      && Array.isArray(draw.numbers)
      && draw.numbers.length === 5
      && draw.numbers.every(number => Number.isInteger(Number(number)) && Number(number) >= 1 && Number(number) <= 42)
    ))
    .map(draw => {
      const numbers = draw.numbers.map(Number).sort((a, b) => a - b);
      return { ...draw, numbers, digits: numbers.map(onesDigit) };
    })
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

function signalDirection(signal) {
  const [first = signal.targetColumn, second = first] = signal.sourceColumns || [];
  if (signal.pattern === 'sisterOutput') return signal.targetColumn - first;
  if (signal.pattern === 'diagonal') return second - first;
  if (signal.pattern === 'lPattern') return signal.targetColumn - first;
  if (signal.pattern === 'invertedL') return signal.targetColumn - first;
  if (signal.pattern === 'repeat') return signal.targetColumn - first;
  if (signal.pattern === 'sister' || signal.pattern === 'knight') return signal.operation === 'left' ? -1 : 1;
  return 0;
}

/** Project active patterns into concrete next-draw Ball positions. */
export function projectNextPatternSignals(draws = []) {
  const safeDraws = chronologicalDraws(draws);
  if (!safeDraws.length) return [];
  const latest = safeDraws.at(-1).digits;
  const previous = safeDraws.at(-2)?.digits || [];
  const previousPrevious = safeDraws.at(-3)?.digits || [];
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

    previous.forEach((digit, previousColumn) => {
      latest.forEach((latestDigit, latestColumn) => {
        const movement = latestColumn - previousColumn;
        const targetColumn = latestColumn + movement;
        if (digit !== latestDigit || Math.abs(movement) !== 2
            || targetColumn < 0 || targetColumn >= latest.length) return;
        signals.push({
          digit,
          pattern: 'knight',
          operation: movement < 0 ? 'left' : 'right',
          targetColumn,
          sourceColumns: [previousColumn, latestColumn],
          explanation: `Digit ${digit} continued its two-Ball knight shift ${movement < 0 ? 'left' : 'right'}`
        });
      });
    });

    const endingColumns = new Map();
    latest.forEach((digit, column) => {
      const columns = endingColumns.get(digit) || [];
      columns.push(column);
      endingColumns.set(digit, columns);
    });
    endingColumns.forEach((columns, digit) => {
      if (columns.length < 2) return;
      columns.forEach(column => signals.push({
        digit,
        pattern: 'twin',
        operation: 'repeat',
        targetColumn: column,
        sourceColumns: [...columns],
        explanation: `Twin ending ${digit} occupied Balls ${columns.map(item => item + 1).join(' and ')}`
      }));
    });

    const latestNumbers = safeDraws.at(-1).numbers;
    for (let column = 0; column < latestNumbers.length - 1; column += 1) {
      if (latestNumbers[column + 1] !== latestNumbers[column] + 1) continue;
      [column, column + 1].forEach(targetColumn => signals.push({
        digit: latest[targetColumn],
        pattern: 'consecutive',
        operation: 'repeat',
        targetColumn,
        sourceColumns: [column, column + 1],
        explanation: `Consecutive pair ${latestNumbers[column]}–${latestNumbers[column + 1]}`
      }));
    }

    previous.forEach((digit, column) => {
      if (latest[column] === undefined) return;
      signals.push(...mathSignals(digit, latest[column], 'inline', column, [column, column]));
      [-1, 1].forEach(outputDelta => {
        const targetColumn = column + outputDelta;
        if (targetColumn < 0 || targetColumn >= latest.length) return;
        signals.push(...mathSignals(digit, latest[column], 'sisterOutput', targetColumn, [column, column]));
        signals.push(...mathSignals(digit, latest[column], 'invertedL', targetColumn, [column, column]));
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

  if (previousPrevious.length) {
    latest.forEach((digit, column) => {
      if (previousPrevious[column] !== digit || previous[column] === digit) return;
      signals.push({
        digit,
        pattern: 'skipRow',
        operation: 'repeat',
        targetColumn: column,
        sourceColumns: [column, column],
        explanation: `Digit ${digit} repeated in Ball ${column + 1} after one skipped draw`
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
    const direction = signalDirection(signal);
    const enriched = { ...signal, direction };
    const key = [signal.pattern, signal.operation, direction, signal.digit, signal.targetColumn, signal.sourceColumns.join(',')].join(':');
    if (!unique.has(key)) unique.set(key, enriched);
  });
  return [...unique.values()];
}

function calibrationKey(signal) {
  return [signal.pattern, signal.operation, signal.direction ?? signalDirection(signal), signal.targetColumn, signal.digit].join(':');
}

function baselineRates(draws) {
  return Array.from({ length: 5 }, (_, column) => {
    const counts = Array(10).fill(0);
    draws.forEach(draw => { counts[draw.digits[column]] += 1; });
    return counts.map(count => (count + 1) / (draws.length + 10));
  });
}

function normalizedScores(values = []) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return values.map(() => 50);
  return values.map(value => ((value - min) / (max - min)) * 100);
}

function labelsFromHeat(latest) {
  const labels = new Map(Array.from({ length: 10 }, (_, digit) => [digit, []]));
  if (!latest) return labels;
  ['hot', 'neutral', 'cold'].forEach(label => {
    latest[label].forEach(item => labels.get(item.digit).push(label));
  });
  latest.decliningDigits.forEach(digit => labels.get(digit).push('declining'));
  latest.emergingDigits.forEach(digit => labels.get(digit).push('emerging'));
  return labels;
}

function heatLabels(draws) {
  return labelsFromHeat(buildDigitHeatTimeline(draws).at(-1));
}

function stateScoresByColumn(draws) {
  const stats = Array.from({ length: 5 }, () => new Map());
  const baselines = baselineRates(draws);
  const timeline = buildDigitHeatTimeline(draws);
  for (let endIndex = 3; endIndex < draws.length - 1; endIndex += 1) {
    const labels = labelsFromHeat(timeline[endIndex]);
    const actual = draws[endIndex + 1].digits;
    for (let column = 0; column < 5; column += 1) {
      for (let digit = 0; digit < 10; digit += 1) {
        labels.get(digit).forEach(label => {
          const key = `${label}:${digit}`;
          const item = stats[column].get(key) || { hits: 0, trials: 0 };
          item.trials += 1;
          if (actual[column] === digit) item.hits += 1;
          stats[column].set(key, item);
        });
      }
    }
  }

  const currentLabels = heatLabels(draws);
  return Array.from({ length: 5 }, (_, column) => {
    const raw = Array.from({ length: 10 }, (_, digit) => {
      const labels = currentLabels.get(digit);
      const rates = labels.map(label => {
        const item = stats[column].get(`${label}:${digit}`) || { hits: 0, trials: 0 };
        const baseline = baselines[column]?.[digit] ?? 0.1;
        return (item.hits + (5 * baseline)) / (item.trials + 5);
      });
      return rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : 0;
    });
    const normalized = normalizedScores(raw);
    return normalized.map((score, digit) => ({ digit, score, labels: [...currentLabels.get(digit)] }));
  });
}

function frequencyScoresByColumn(draws) {
  return Array.from({ length: 5 }, (_, column) => {
    const counts = Array(10).fill(1);
    draws.forEach(draw => { counts[draw.digits[column]] += 1; });
    return normalizedScores(counts);
  });
}

function buildCalibration(draws) {
  const safeDraws = chronologicalDraws(draws);
  const baselines = baselineRates(safeDraws);
  const stats = new Map();
  for (let targetIndex = 1; targetIndex < safeDraws.length; targetIndex += 1) {
    const history = safeDraws.slice(0, targetIndex);
    const actual = safeDraws[targetIndex].digits;
    projectNextPatternSignals(history).forEach(signal => {
      const key = calibrationKey(signal);
      const item = stats.get(key) || { hits: 0, trials: 0 };
      item.trials += 1;
      if (actual[signal.targetColumn] === signal.digit) item.hits += 1;
      stats.set(key, item);
    });
  }
  return { baselines, stats };
}

function calibratedSignal(signal, calibration) {
  const stats = calibration.stats.get(calibrationKey(signal)) || { hits: 0, trials: 0 };
  const baselineRate = calibration.baselines[signal.targetColumn]?.[signal.digit] ?? 0.1;
  const posteriorRate = (stats.hits + (SIGNAL_PRIOR_STRENGTH * baselineRate))
    / (stats.trials + SIGNAL_PRIOR_STRENGTH);
  return {
    ...signal,
    reliabilityHits: stats.hits,
    reliabilityTrials: stats.trials,
    reliability: posteriorRate,
    baselineRate,
    posteriorRate,
    lift: Math.max(0, posteriorRate - baselineRate)
  };
}

/** Capture next-draw signals with Ball/digit/direction calibration. */
export function snapshotNextPatternSignals(draws = []) {
  const safeDraws = chronologicalDraws(draws);
  const calibration = buildCalibration(safeDraws);
  const latestDraw = safeDraws.at(-1);
  const previousDraw = safeDraws.at(-2);
  return projectNextPatternSignals(safeDraws).map(signal => ({
    ...calibratedSignal(signal, calibration),
    analyzerVersion: NEXT_DRAW_ANALYZER_VERSION,
    sourceDrawIds: signal.pattern === 'lPattern'
      ? [latestDraw?.id, latestDraw?.id].filter(Boolean)
      : [previousDraw?.id, latestDraw?.id].filter(Boolean)
  }));
}

function streamForColumn(draws, column) {
  if (draws.length < MIN_STREAM_DRAWS) return null;
  const { min, max } = feasibleRangeForColumn(column);
  const recentValues = draws.slice(-MIN_STREAM_DRAWS).map(draw => draw.numbers[column]);
  const deltas = recentValues.slice(1).map((value, index) => value - recentValues[index]);
  const averageDelta = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  const rawForecast = recentValues.at(-1) + averageDelta;
  const forecast = Math.max(min, Math.min(max, rawForecast));
  const numberCandidates = Array.from({ length: max - min + 1 }, (_, index) => min + index)
    .map(number => {
      const appearances = draws.reduce((count, draw) => count + (draw.numbers[column] === number ? 1 : 0), 0);
      const reverseIndex = [...draws].reverse().findIndex(draw => draw.numbers[column] === number);
      return {
        number,
        digit: onesDigit(number),
        distance: Math.abs(number - forecast),
        appearances,
        recencyGap: reverseIndex < 0 ? draws.length + 1 : reverseIndex
      };
    });
  for (let digit = 0; digit < 10; digit += 1) {
    const matching = numberCandidates.filter(item => item.digit === digit);
    const streamScores = normalizedScores(matching.map(item => -item.distance));
    const recencyScores = normalizedScores(matching.map(item => item.recencyGap));
    const frequencyScores = normalizedScores(matching.map(item => item.appearances));
    matching.forEach((item, index) => {
      item.streamScore = streamScores[index];
      item.recencyScore = recencyScores[index];
      item.numberFrequencyScore = frequencyScores[index];
      item.numberScore = (item.streamScore * NUMBER_STREAM_WEIGHT)
        + (item.recencyScore * NUMBER_RECENCY_WEIGHT)
        + (item.numberFrequencyScore * NUMBER_FREQUENCY_WEIGHT);
    });
  }
  return {
    recentValues,
    deltas,
    averageDelta,
    rawForecast,
    forecast,
    numberCandidates
  };
}

function compareCandidates(left, right) {
  return right.endingScore - left.endingScore
    || right.familyCount - left.familyCount
    || right.patternLift - left.patternLift
    || right.numberScore - left.numberScore
    || left.suggestedNumber - right.suggestedNumber
    || left.digit - right.digit;
}

function scoreHybridColumns(draws, limit = 3) {
  const safeDraws = chronologicalDraws(draws);
  if (safeDraws.length < MIN_STREAM_DRAWS) {
    return Array.from({ length: 5 }, (_, column) => ({
      column,
      available: false,
      unavailableReason: `At least ${MIN_STREAM_DRAWS} valid draws are required for the unused-number stream.`,
      windowSize: safeDraws.length,
      candidates: [],
      numberCandidates: [],
      stream: null
    }));
  }
  const calibration = buildCalibration(safeDraws);
  const projected = projectNextPatternSignals(safeDraws).map(signal => calibratedSignal(signal, calibration));
  const stateScores = stateScoresByColumn(safeDraws);
  const frequencyScores = frequencyScoresByColumn(safeDraws);

  return Array.from({ length: 5 }, (_, column) => {
    const stream = streamForColumn(safeDraws, column);
    if (!stream?.numberCandidates.length) {
      return {
        column,
        available: false,
        unavailableReason: `No feasible Ball ${column + 1} numbers are available.`,
        windowSize: safeDraws.length,
        candidates: [],
        numberCandidates: [],
        stream
      };
    }
    const signals = projected.filter(signal => signal.targetColumn === column);
    const grouped = new Map();
    stream.numberCandidates.forEach(item => {
      const prior = grouped.get(item.digit);
      if (!prior || item.numberScore > prior.numberScore
          || (item.numberScore === prior.numberScore && item.distance < prior.distance)
          || (item.numberScore === prior.numberScore && item.distance === prior.distance && item.number < prior.number)) {
        grouped.set(item.digit, item);
      }
    });

    const candidates = [...grouped.entries()].map(([digit, closest]) => {
      const digitSignals = signals.filter(signal => signal.digit === digit);
      const familyMap = new Map();
      digitSignals.forEach(signal => {
        if (signal.lift <= 0) return;
        const definition = PATTERN_FAMILIES[signal.pattern];
        if (!definition) return;
        const existing = familyMap.get(signal.pattern);
        if (!existing || signal.lift > existing.lift) {
          familyMap.set(signal.pattern, {
            key: signal.pattern,
            label: definition.label,
            reliability: signal.posteriorRate,
            posteriorRate: signal.posteriorRate,
            baselineRate: signal.baselineRate,
            lift: signal.lift,
            hits: signal.reliabilityHits,
            trials: signal.reliabilityTrials,
            signalCount: 1,
            direction: signal.direction,
            operation: signal.operation,
            examples: signal.explanation ? [signal.explanation] : []
          });
        } else if (signal.explanation && !existing.examples.includes(signal.explanation) && existing.examples.length < 2) {
          existing.examples.push(signal.explanation);
          existing.signalCount += 1;
        }
      });
      const families = [...familyMap.values()]
        .sort((a, b) => b.lift - a.lift || a.label.localeCompare(b.label));
      return {
        digit,
        suggestedNumber: closest.number,
        streamDistance: closest.distance,
        streamScore: closest.streamScore,
        numberScore: closest.numberScore,
        numberFrequencyScore: closest.numberFrequencyScore,
        numberAppearances: closest.appearances,
        numberRecencyGap: closest.recencyGap,
        numberRecencyScore: closest.recencyScore,
        patternLift: families.reduce((sum, family) => sum + family.lift, 0),
        familyCount: families.length,
        signalCount: families.reduce((sum, family) => sum + family.signalCount, 0),
        families,
        signals: digitSignals.filter(signal => signal.lift > 0)
      };
    });
    const topPatternLift = Math.max(0, ...candidates.map(candidate => candidate.patternLift));
    candidates.forEach(candidate => {
      candidate.patternScore = topPatternLift ? (candidate.patternLift / topPatternLift) * 100 : 0;
      candidate.frequencyScore = frequencyScores[column][candidate.digit];
      candidate.stateScore = stateScores[column][candidate.digit].score;
      candidate.stateLabels = [...stateScores[column][candidate.digit].labels];
      candidate.endingScore = (candidate.patternScore * ENDING_PATTERN_WEIGHT)
        + (candidate.frequencyScore * ENDING_FREQUENCY_WEIGHT)
        + (candidate.stateScore * ENDING_STATE_WEIGHT);
      candidate.combinedScore = candidate.endingScore;
      candidate.rawScore = candidate.patternLift;
      candidate.score = Math.round(candidate.endingScore);
      candidate.forecast = stream.forecast;
      candidate.recentValues = [...stream.recentValues];
      candidate.deltas = [...stream.deltas];
      candidate.averageDelta = stream.averageDelta;
      candidate.unusedWindow = safeDraws.length;
    });
    candidates.sort(compareCandidates);
    candidates.forEach((candidate, index) => { candidate.rank = index + 1; });

    const candidateByDigit = new Map(candidates.map(candidate => [candidate.digit, candidate]));
    const numberCandidates = stream.numberCandidates.map(item => {
      const digitCandidate = candidateByDigit.get(item.digit);
      const combinedScore = (digitCandidate.endingScore * LINE_ENDING_WEIGHT) + (item.numberScore * LINE_NUMBER_WEIGHT);
      return {
        ...item,
        combinedScore,
        endingScore: digitCandidate.endingScore,
        stateScore: digitCandidate.stateScore,
        stateLabels: digitCandidate.stateLabels,
        frequencyScore: digitCandidate.frequencyScore,
        patternScore: digitCandidate.patternScore,
        patternLift: digitCandidate.patternLift,
        familyCount: digitCandidate.familyCount,
        families: digitCandidate.families
      };
    }).sort((a, b) => b.combinedScore - a.combinedScore
      || b.familyCount - a.familyCount
      || b.patternLift - a.patternLift
      || b.numberScore - a.numberScore
      || a.distance - b.distance
      || a.number - b.number).slice(0, SYSTEM_NUMBER_POOL_LIMIT);

    return {
      column,
      available: true,
      unavailableReason: '',
      windowSize: safeDraws.length,
      candidates: candidates.slice(0, Math.max(0, limit)),
      allCandidates: candidates,
      numberCandidates,
      stream: {
        recentValues: stream.recentValues,
        deltas: stream.deltas,
        averageDelta: stream.averageDelta,
        rawForecast: stream.rawForecast,
        forecast: stream.forecast,
        candidateCount: stream.numberCandidates.length
      }
    };
  });
}

function compareLines(left, right) {
  if (!right) return -1;
  if (Math.abs(left.totalCombinedScore - right.totalCombinedScore) > SCORE_EPSILON) {
    return right.totalCombinedScore - left.totalCombinedScore;
  }
  if (Math.abs(left.totalEndingScore - right.totalEndingScore) > SCORE_EPSILON) {
    return right.totalEndingScore - left.totalEndingScore;
  }
  if (Math.abs(left.totalNumberScore - right.totalNumberScore) > SCORE_EPSILON) {
    return right.totalNumberScore - left.totalNumberScore;
  }
  for (let index = 0; index < 5; index += 1) {
    if (left.numbers[index] !== right.numbers[index]) return left.numbers[index] - right.numbers[index];
  }
  return 0;
}

function lineDistance(left, right) {
  return left.numbers.reduce((count, number, index) => count + (number === right.numbers[index] ? 0 : 1), 0);
}

function bestLine(columns, exclusions) {
  let best = null;
  const positions = [];
  const endingCounts = Array(10).fill(0);
  const previouslySelectedNumbers = new Set(exclusions.flatMap(line => line.numbers || []));
  const previouslySelectedDigitsByColumn = Array.from({ length: 5 }, (_, column) => new Set(
    exclusions.map(line => line.positions?.[column]?.digit ?? line.digits?.[column]).filter(Number.isInteger)
  ));
  const visit = (column, previousNumber) => {
    if (column === 5) {
      const candidate = {
        numbers: positions.map(item => item.number),
        digits: positions.map(item => item.digit),
        positions: positions.map(item => ({ ...item })),
        totalCombinedScore: positions.reduce((sum, item) => sum + item.combinedScore, 0),
        totalEndingScore: positions.reduce((sum, item) => sum + item.endingScore, 0),
        totalNumberScore: positions.reduce((sum, item) => sum + item.numberScore, 0),
        totalPatternScore: positions.reduce((sum, item) => sum + item.patternScore, 0),
        totalStreamScore: positions.reduce((sum, item) => sum + item.streamScore, 0)
      };
      if (exclusions.some(line => lineDistance(candidate, line) < 2)) return;
      if (!best || compareLines(candidate, best) < 0) best = candidate;
      return;
    }
    columns[column].numberCandidates.forEach(item => {
      if (item.number <= previousNumber) return;
      if (previouslySelectedNumbers.has(item.number)) return;
      if (previouslySelectedDigitsByColumn[column].has(item.digit)) return;
      if (endingCounts[item.digit] >= MAX_STANDARD_ENDING_MULTIPLICITY) return;
      positions.push(item);
      endingCounts[item.digit] += 1;
      visit(column + 1, item.number);
      endingCounts[item.digit] -= 1;
      positions.pop();
    });
  };
  visit(0, 0);
  return best;
}

export function buildOptimizedSystemLinesV5(columns = [], limit = 3) {
  const validColumns = Array.isArray(columns) && columns.length === 5
    && columns.every(column => column.available && column.numberCandidates?.length);
  if (!validColumns) {
    return Array.from({ length: limit }, (_, index) => ({
      rank: index + 1,
      available: false,
      unavailableReason: 'A buildable line requires sufficient history and a feasible number pool in every Ball position.',
      numbers: [],
      digits: [],
      positions: []
    }));
  }
  const selected = [];
  for (let rank = 1; rank <= limit; rank += 1) {
    const line = bestLine(columns, selected.filter(item => item.available));
    if (!line) {
      selected.push({
        rank,
        available: false,
        unavailableReason: 'No additional increasing line could be built without reusing a number or Ball-position ending from an earlier recommendation.',
        numbers: [],
        digits: [],
        positions: []
      });
      continue;
    }
    selected.push({
      ...line,
      rank,
      available: true,
      unavailableReason: '',
      score: Math.round(line.totalCombinedScore / 5),
      endingScore: Math.round(line.totalEndingScore / 5),
      numberScore: Math.round(line.totalNumberScore / 5),
      patternScore: Math.round(line.totalPatternScore / 5),
      streamScore: Math.round(line.totalStreamScore / 5)
    });
  }
  return selected;
}

/** Evaluate hybrid ranks using only drawings preceding each historical target. */
export function walkForwardPatternPerformanceV5(draws = [], limit = 3) {
  const safeDraws = chronologicalDraws(draws);
  const columnRankStats = Array.from({ length: 5 }, (_, column) => Array.from({ length: limit }, (_, index) => ({
    column,
    rank: index + 1,
    endingHits: 0,
    numberHits: 0,
    hits: 0,
    trials: 0,
    endingRate: null,
    numberRate: null,
    rate: null,
    sufficient: false
  })));
  const evaluations = [];
  for (let targetIndex = MIN_STREAM_DRAWS; targetIndex < safeDraws.length; targetIndex += 1) {
    const history = safeDraws.slice(0, targetIndex);
    const actual = safeDraws[targetIndex];
    const columns = scoreHybridColumns(history, limit);
    columns.forEach(result => {
      result.candidates.forEach(candidate => {
        const stats = columnRankStats[result.column][candidate.rank - 1];
        const endingHit = actual.digits[result.column] === candidate.digit;
        const numberHit = actual.numbers[result.column] === candidate.suggestedNumber;
        stats.trials += 1;
        if (endingHit) stats.endingHits += 1;
        if (numberHit) stats.numberHits += 1;
        stats.hits = stats.endingHits;
        evaluations.push({
          targetDate: actual.date,
          column: result.column,
          rank: candidate.rank,
          digit: candidate.digit,
          suggestedNumber: candidate.suggestedNumber,
          actualDigit: actual.digits[result.column],
          actualNumber: actual.numbers[result.column],
          endingHit,
          numberHit,
          hit: endingHit
        });
      });
    });
  }
  columnRankStats.flat().forEach(stats => {
    stats.endingRate = stats.trials ? stats.endingHits / stats.trials : null;
    stats.numberRate = stats.trials ? stats.numberHits / stats.trials : null;
    stats.rate = stats.endingRate;
    stats.sufficient = stats.trials >= MIN_BACKTEST_TRIALS;
  });
  const rankStats = Array.from({ length: limit }, (_, index) => {
    const members = columnRankStats.map(column => column[index]);
    const trials = members.reduce((sum, item) => sum + item.trials, 0);
    const hits = members.reduce((sum, item) => sum + item.endingHits, 0);
    return {
      rank: index + 1,
      hits,
      trials,
      rate: trials ? hits / trials : null,
      sufficient: members.every(item => item.sufficient)
    };
  });
  return { rankStats, columnRankStats, evaluations };
}

export function analyzeNextDrawBoardV5(draws = [], options = {}) {
  const safeDraws = chronologicalDraws(draws);
  const limit = Number.isInteger(options.limit) ? Math.max(0, options.limit) : 3;
  const columns = scoreHybridColumns(safeDraws, limit);
  const lines = buildOptimizedSystemLinesV5(columns, limit);
  if (options.includeWalkForward !== false && safeDraws.length >= MIN_STREAM_DRAWS) {
    const performance = walkForwardPatternPerformanceV5(safeDraws, limit);
    columns.forEach(result => {
      result.candidates.forEach(candidate => {
        const stats = performance.columnRankStats[result.column]?.[candidate.rank - 1]
          || { endingHits: 0, numberHits: 0, trials: 0, endingRate: null, numberRate: null, sufficient: false };
        candidate.walkForwardHits = stats.endingHits;
        candidate.walkForwardNumberHits = stats.numberHits;
        candidate.walkForwardTrials = stats.trials;
        candidate.walkForwardRate = stats.endingRate;
        candidate.walkForwardNumberRate = stats.numberRate;
        candidate.walkForwardSufficient = stats.sufficient;
      });
    });
  }
  return {
    version: 5,
    windowSize: safeDraws.length,
    columns,
    lines
  };
}

function endingFromNumbers(numberDistribution) {
  const result = Array(10).fill(0);
  numberDistribution.forEach((probability, index) => { result[(index + 1) % 10] += probability; });
  return result;
}

function tensFromNumbers(numberDistribution) {
  const result = Array(5).fill(0);
  numberDistribution.forEach((probability, index) => {
    result[tensBandForNumber(index + 1)] += probability;
  });
  return result;
}

function recencyEndingDistribution(draws, column, prior, policy) {
  const counts = Array(10).fill(0);
  const halfLife = Math.max(1, Number(policy.recencyHalfLife) || 12);
  [...draws].reverse().forEach((draw, age) => {
    counts[draw.digits[column]] += 0.5 ** (age / halfLife);
  });
  return shrinkDistribution(prior, counts, Math.max(0, Number(policy.priorStrength) || 10));
}

function logarithmicOpinionPool(components) {
  const safe = components.filter(component => component.weight > 0 && Array.isArray(component.distribution));
  if (!safe.length) return [];
  const totalWeight = safe.reduce((sum, component) => sum + component.weight, 0);
  return normalizeDistribution(safe[0].distribution.map((_, digit) => Math.exp(
    safe.reduce((sum, component) => (
      sum + ((component.weight / totalWeight) * Math.log(Math.max(1e-12, component.distribution[digit] || 0)))
    ), 0)
  )));
}

function deduplicateV6Signals(signals = []) {
  const verticalKeys = new Set(signals.filter(signal => signal.pattern === 'vertical').map(signal => (
    `${signal.targetColumn}:${signal.digit}:${signal.sourceColumns?.join(',')}`
  )));
  const retained = new Map();
  signals.forEach(signal => {
    const overlapKey = `${signal.targetColumn}:${signal.digit}:${signal.sourceColumns?.join(',')}`;
    if (signal.pattern === 'repeat' && verticalKeys.has(overlapKey)) return;
    const isMath = ['inline', 'diagonal', 'sisterOutput', 'lPattern'].includes(signal.pattern);
    const key = isMath
      ? `math:${overlapKey}`
      : `${signal.pattern}:${signal.operation}:${overlapKey}`;
    const existing = retained.get(key);
    if (!existing || signal.lift > existing.lift
        || (signal.lift === existing.lift && `${signal.pattern}:${signal.operation}`.localeCompare(`${existing.pattern}:${existing.operation}`) < 0)) {
      retained.set(key, signal);
    }
  });
  return [...retained.values()];
}

function v6PatternDistribution(draws, column, calibration) {
  const calibrated = projectNextPatternSignals(draws)
    .filter(signal => signal.targetColumn === column)
    .map(signal => calibratedSignal(signal, calibration));
  const signals = deduplicateV6Signals(calibrated);
  const mass = Array(10).fill(0.1);
  signals.forEach(signal => { mass[signal.digit] += Math.max(0, signal.lift); });
  return { distribution: normalizeDistribution(mass), signals };
}

function topDigit(distribution = []) {
  let digit = 0;
  let probability = Number(distribution[0]) || 0;
  for (let index = 1; index < distribution.length; index += 1) {
    const value = Number(distribution[index]) || 0;
    if (value > probability) {
      digit = index;
      probability = value;
    }
  }
  return { digit, probability };
}

function v6StateDistributions(draws) {
  const timeline = buildDigitHeatTimeline(draws);
  const stats = Array.from({ length: 5 }, () => new Map());
  for (let endIndex = 3; endIndex < draws.length - 1; endIndex += 1) {
    const labels = labelsFromHeat(timeline[endIndex]);
    const actual = draws[endIndex + 1].digits;
    for (let column = 0; column < 5; column += 1) {
      for (let digit = 0; digit < 10; digit += 1) {
        labels.get(digit).forEach(label => {
          const key = `${label}:${digit}`;
          const item = stats[column].get(key) || { hits: 0, trials: 0 };
          item.trials += 1;
          if (actual[column] === digit) item.hits += 1;
          stats[column].set(key, item);
        });
      }
    }
  }
  const currentLabels = labelsFromHeat(timeline.at(-1));
  return Array.from({ length: 5 }, (_, column) => {
    const prior = endingDistribution(column);
    const raw = Array.from({ length: 10 }, (_, digit) => {
      const labels = currentLabels.get(digit) || [];
      if (!labels.length) return prior[digit];
      const posteriors = labels.map(label => {
        const item = stats[column].get(`${label}:${digit}`) || { hits: 0, trials: 0 };
        return (item.hits + (5 * prior[digit])) / (item.trials + 5);
      });
      return posteriors.reduce((sum, value) => sum + value, 0) / posteriors.length;
    });
    return { distribution: normalizeDistribution(raw), labels: currentLabels };
  });
}

function v6ColumnModels(draws, policy = V6_POLICY) {
  const safeDraws = chronologicalDraws(draws);
  const calibration = buildCalibration(safeDraws);
  const states = v6StateDistributions(safeDraws);
  return Array.from({ length: 5 }, (_, column) => {
    const combo = orderStatisticDistribution(column);
    const exactCounts = Array(42).fill(0);
    safeDraws.forEach(draw => { exactCounts[draw.numbers[column] - 1] += 1; });
    const empirical = shrinkDistribution(combo, exactCounts, policy.priorStrength);
    const comboEnding = endingDistribution(column);
    const ebEnding = endingFromNumbers(empirical);
    const historyEnding = recencyEndingDistribution(safeDraws, column, comboEnding, NEXT_DRAW_STUDY_POLICY);
    const pattern = v6PatternDistribution(safeDraws, column, calibration);
    const state = states[column];
    const evidencePolicy = policy.kind === 'evidence';
    const patternWeight = ['challenger', 'evidence'].includes(policy.kind) ? Math.max(0, policy.patternWeight || 0) : 0;
    const stateWeight = ['challenger', 'evidence'].includes(policy.kind) ? Math.max(0, policy.stateWeight || 0) : 0;
    const learnedWeight = policy.kind === 'challenger' ? Math.min(0.3, patternWeight + stateWeight) : 0;
    const isControl = policy.kind === 'combo' || policy.kind === 'control';
    const baseNumbers = isControl ? combo : empirical;
    const baseEnding = isControl ? comboEnding : ebEnding;
    const mixedEnding = evidencePolicy
      ? logarithmicOpinionPool([
        { name: 'combo', weight: Math.max(0, policy.comboWeight || 0), distribution: comboEnding },
        { name: 'history', weight: Math.max(0, policy.historyWeight || 0), distribution: historyEnding },
        { name: 'pattern', weight: patternWeight, distribution: pattern.distribution },
        { name: 'hncde', weight: stateWeight, distribution: state.distribution }
      ])
      : normalizeDistribution(baseEnding.map((probability, digit) => (
        ((1 - learnedWeight) * probability)
        + (patternWeight * pattern.distribution[digit])
        + (stateWeight * state.distribution[digit])
      )));
    const reweighted = normalizeDistribution(baseNumbers.map((probability, index) => {
      const digit = (index + 1) % 10;
      return baseEnding[digit] > 0 ? probability * (mixedEnding[digit] / baseEnding[digit]) : 0;
    }));
    const model = evidencePolicy || learnedWeight ? reweighted : baseNumbers;
    const sourceTops = {
      combo: topDigit(comboEnding),
      history: topDigit(historyEnding),
      pattern: topDigit(pattern.distribution),
      hncde: topDigit(state.distribution)
    };
    return {
      column,
      combo,
      empirical,
      model,
      comboEnding,
      ebEnding,
      historyEnding,
      modelEnding: endingFromNumbers(model),
      modelTens: tensFromNumbers(model),
      comboTens: tensDistribution(column),
      patternDistribution: pattern.distribution,
      stateDistribution: state.distribution,
      stateLabels: state.labels,
      signals: pattern.signals,
      sourceTops,
      optimizationTarget: policy.kind === 'challenger' || policy.kind === 'eb50' ? 'exact' : 'ending',
      componentWeights: {
        combo: evidencePolicy ? policy.comboWeight : (isControl ? 1 : 1 - learnedWeight),
        history: evidencePolicy ? policy.historyWeight : 0,
        pattern: patternWeight,
        hncde: stateWeight
      }
    };
  });
}

function v6FamiliesForCandidate(model, digit) {
  const familyMap = new Map();
  model.signals.filter(signal => signal.digit === digit && signal.lift > 0).forEach(signal => {
    const definition = PATTERN_FAMILIES[signal.pattern];
    if (!definition) return;
    const existing = familyMap.get(signal.pattern);
    if (!existing || signal.lift > existing.lift) {
      familyMap.set(signal.pattern, {
        key: signal.pattern,
        label: definition.label,
        reliability: signal.posteriorRate,
        posteriorRate: signal.posteriorRate,
        baselineRate: signal.baselineRate,
        lift: signal.lift,
        hits: signal.reliabilityHits,
        trials: signal.reliabilityTrials,
        signalCount: 1,
        direction: signal.direction,
        operation: signal.operation,
        examples: signal.explanation ? [signal.explanation] : []
      });
    }
  });
  return [...familyMap.values()].sort((a, b) => b.lift - a.lift || a.label.localeCompare(b.label));
}

export function scoreNextDrawColumnsV6(draws, limit = 3, policy = NEXT_DRAW_LIVE_POLICY) {
  const safeDraws = chronologicalDraws(draws).slice(-50);
  if (!safeDraws.length) return [];
  const models = v6ColumnModels(safeDraws, policy);
  return models.map(model => {
    const allNumbers = model.model.map((modelProbability, index) => {
      const number = index + 1;
      const digit = number % 10;
      const families = v6FamiliesForCandidate(model, digit);
      const numberAppearances = safeDraws.reduce((count, draw) => count + (draw.numbers[model.column] === number ? 1 : 0), 0);
      return {
        number,
        suggestedNumber: number,
        digit,
        comboProbability: model.combo[index],
        comboEndingProbability: model.comboEnding[digit],
        empiricalProbability: model.empirical[index],
        modelProbability,
        endingProbability: model.modelEnding[digit],
        tensProbability: model.modelTens[tensBandForNumber(number)],
        patternProbability: model.patternDistribution[digit],
        stateProbability: model.stateDistribution[digit],
        historyProbability: model.historyEnding[digit],
        combinedScore: modelProbability * 100,
        endingScore: model.modelEnding[digit] * 100,
        numberScore: modelProbability * 100,
        frequencyScore: model.ebEnding[digit] * 100,
        patternScore: model.patternDistribution[digit] * 100,
        stateScore: model.stateDistribution[digit] * 100,
        stateLabels: [...(model.stateLabels.get(digit) || [])],
        streamScore: 0,
        streamDistance: 0,
        numberAppearances,
        unusedWindow: safeDraws.length,
        patternLift: families.reduce((sum, family) => sum + family.lift, 0),
        familyCount: families.length,
        signalCount: families.reduce((sum, family) => sum + family.signalCount, 0),
        families
      };
    }).filter(item => item.modelProbability > 0)
      .sort((a, b) => model.optimizationTarget === 'ending'
        ? b.endingProbability - a.endingProbability || b.modelProbability - a.modelProbability || a.number - b.number
        : b.modelProbability - a.modelProbability || b.endingProbability - a.endingProbability || a.number - b.number);
    const byDigit = new Map();
    allNumbers.forEach(item => {
      if (!byDigit.has(item.digit)) byDigit.set(item.digit, item);
    });
    const pool = model.optimizationTarget === 'ending'
      ? [...byDigit.values()].slice(0, 5)
      : [...byDigit.values(), ...allNumbers];
    const seenNumbers = new Set();
    const numberCandidates = pool.filter(item => {
      if (seenNumbers.has(item.number)) return false;
      seenNumbers.add(item.number);
      return true;
    }).slice(0, SYSTEM_NUMBER_POOL_LIMIT);
    const allCandidates = [...byDigit.values()].sort((a, b) => (
      b.endingProbability - a.endingProbability
      || b.modelProbability - a.modelProbability
      || a.digit - b.digit
    ));
    allCandidates.forEach((candidate, index) => { candidate.rank = index + 1; });
    return {
      column: model.column,
      available: numberCandidates.length >= 3,
      unavailableReason: numberCandidates.length >= 3 ? '' : `No feasible Ball ${model.column + 1} probability pool is available.`,
      windowSize: safeDraws.length,
      candidates: allCandidates.slice(0, Math.max(0, limit)),
      allCandidates,
      numberCandidates,
      optimizationTarget: model.optimizationTarget,
      componentWeights: model.componentWeights,
      sourceTops: model.sourceTops,
      stream: null
    };
  });
}

function comparePortfolio(left, right, optimizationTarget = 'exact') {
  if (!right) return -1;
  if (optimizationTarget === 'ending' && Math.abs(left.expectedEndingHits - right.expectedEndingHits) > SCORE_EPSILON) {
    return right.expectedEndingHits - left.expectedEndingHits;
  }
  if (Math.abs(left.expectedExactHits - right.expectedExactHits) > SCORE_EPSILON) {
    return right.expectedExactHits - left.expectedExactHits;
  }
  if (optimizationTarget !== 'ending' && Math.abs(left.expectedEndingHits - right.expectedEndingHits) > SCORE_EPSILON) {
    return right.expectedEndingHits - left.expectedEndingHits;
  }
  if (Math.abs(left.expectedTensHits - right.expectedTensHits) > SCORE_EPSILON) {
    return right.expectedTensHits - left.expectedTensHits;
  }
  const leftNumbers = left.rows.flatMap(row => row.map(item => item.number));
  const rightNumbers = right.rows.flatMap(row => row.map(item => item.number));
  for (let index = 0; index < leftNumbers.length; index += 1) {
    if (leftNumbers[index] !== rightNumbers[index]) return leftNumbers[index] - rightNumbers[index];
  }
  return 0;
}

function columnAssignments(candidates, firstColumn = false, optimizationTarget = 'exact') {
  const assignments = [];
  for (let left = 0; left < candidates.length; left += 1) {
    for (let middle = 0; middle < candidates.length; middle += 1) {
      if (middle === left) continue;
      for (let right = 0; right < candidates.length; right += 1) {
        if (right === left || right === middle) continue;
        const items = [candidates[left], candidates[middle], candidates[right]];
        if (new Set(items.map(item => item.digit)).size !== 3) continue;
        if (firstColumn && !(items[0].number < items[1].number && items[1].number < items[2].number)) continue;
        assignments.push({
          items,
          exact: items.reduce((sum, item) => sum + item.modelProbability, 0),
          ending: items.reduce((sum, item) => sum + item.endingProbability, 0),
          tens: items.reduce((sum, item) => sum + item.tensProbability, 0)
        });
      }
    }
  }
  return assignments.sort((a, b) => (optimizationTarget === 'ending'
    ? b.ending - a.ending || b.exact - a.exact
    : b.exact - a.exact || b.ending - a.ending) || b.tens - a.tens
    || a.items[0].number - b.items[0].number || a.items[1].number - b.items[1].number || a.items[2].number - b.items[2].number);
}

export function buildOptimizedSystemLines(columns = [], limit = 3) {
  const requested = Math.min(3, Math.max(0, Number(limit) || 0));
  const valid = requested === 3 && Array.isArray(columns) && columns.length === 5
    && columns.every(column => column.available !== false && column.numberCandidates?.length >= 3);
  if (!valid) return buildOptimizedSystemLinesV5(columns, limit);
  const optimizationTarget = columns.every(column => column.optimizationTarget === 'ending') ? 'ending' : 'exact';
  const normalizedColumns = columns.map(column => ({
    ...column,
    numberCandidates: column.numberCandidates.map(item => ({
      ...item,
      modelProbability: Number.isFinite(item.modelProbability) ? item.modelProbability : (item.combinedScore || 0) / 100,
      endingProbability: Number.isFinite(item.endingProbability) ? item.endingProbability : (item.endingScore || 0) / 100,
      tensProbability: Number.isFinite(item.tensProbability) ? item.tensProbability : (item.numberScore || 0) / 100
    }))
  }));
  const assignments = normalizedColumns.map((column, index) => columnAssignments(
    column.numberCandidates,
    index === 0,
    optimizationTarget
  ));
  const maximumRemaining = Array(6).fill(0);
  for (let column = 4; column >= 0; column -= 1) {
    maximumRemaining[column] = maximumRemaining[column + 1]
      + ((optimizationTarget === 'ending' ? assignments[column][0]?.ending : assignments[column][0]?.exact) || 0);
  }
  const rows = [[], [], []];
  const previous = [0, 0, 0];
  const endingCounts = Array.from({ length: 3 }, () => Array(10).fill(0));
  let best = null;
  const visit = (column, usedMask, exact, ending, tens) => {
    const accumulated = optimizationTarget === 'ending' ? ending : exact;
    const bestValue = optimizationTarget === 'ending' ? best?.expectedEndingHits : best?.expectedExactHits;
    if (best && accumulated + maximumRemaining[column] < bestValue - SCORE_EPSILON) return;
    if (column === 5) {
      const candidate = { rows: rows.map(row => [...row]), expectedExactHits: exact, expectedEndingHits: ending, expectedTensHits: tens };
      if (!best || comparePortfolio(candidate, best, optimizationTarget) < 0) best = candidate;
      return;
    }
    for (const assignment of assignments[column]) {
      let nextMask = usedMask;
      let allowed = true;
      for (let row = 0; row < 3; row += 1) {
        const item = assignment.items[row];
        const bit = 1n << BigInt(item.number - 1);
        if (item.number <= previous[row] || (nextMask & bit) !== 0n || endingCounts[row][item.digit] >= MAX_STANDARD_ENDING_MULTIPLICITY) {
          allowed = false;
          break;
        }
        nextMask |= bit;
      }
      if (!allowed) continue;
      const oldPrevious = [...previous];
      assignment.items.forEach((item, row) => {
        rows[row].push(item);
        previous[row] = item.number;
        endingCounts[row][item.digit] += 1;
      });
      visit(column + 1, nextMask, exact + assignment.exact, ending + assignment.ending, tens + assignment.tens);
      assignment.items.forEach((item, row) => {
        rows[row].pop();
        previous[row] = oldPrevious[row];
        endingCounts[row][item.digit] -= 1;
      });
    }
  };
  visit(0, 0n, 0, 0, 0);
  if (!best) return Array.from({ length: requested }, (_, index) => ({
    rank: index + 1,
    available: false,
    unavailableReason: 'No joint three-line portfolio satisfies the increasing-number, unique-number, and ending-diversity constraints.',
    numbers: [],
    digits: [],
    positions: []
  }));
  return best.rows.map(items => ({
    available: true,
    unavailableReason: '',
    positions: items.map(item => ({ ...item })),
    numbers: items.map(item => item.number),
    digits: items.map(item => item.digit),
    expectedExactHits: items.reduce((sum, item) => sum + item.modelProbability, 0),
    expectedEndingHits: items.reduce((sum, item) => sum + item.endingProbability, 0),
    expectedTensHits: items.reduce((sum, item) => sum + item.tensProbability, 0)
  })).sort((a, b) => (optimizationTarget === 'ending'
    ? b.expectedEndingHits - a.expectedEndingHits || b.expectedExactHits - a.expectedExactHits
    : b.expectedExactHits - a.expectedExactHits || b.expectedEndingHits - a.expectedEndingHits)
    || b.expectedTensHits - a.expectedTensHits
    || a.numbers.join(',').localeCompare(b.numbers.join(',')))
    .map((line, index) => ({
      ...line,
      rank: index + 1,
      score: Math.round((line.expectedExactHits / 5) * 100),
      endingScore: Math.round((line.expectedEndingHits / 5) * 100),
      numberScore: Math.round((line.expectedExactHits / 5) * 100),
      tensScore: Math.round((line.expectedTensHits / 5) * 100),
      patternScore: 0,
      streamScore: 0,
      optimizationTarget
    }));
}

function stableSeed(value = '') {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash || 0x5ca5_0009;
}

function seededRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Build the reproducible Blue control with three lines and 15 unique numbers. */
export function buildUniformControlLines(draws = [], columns = []) {
  const safeDraws = chronologicalDraws(draws);
  const latest = safeDraws.at(-1);
  if (!latest || !Array.isArray(columns) || columns.length !== 5) return [];
  const seedMaterial = `${latest.date}|${latest.numbers.join(',')}|v${NEXT_DRAW_ANALYZER_VERSION}`;
  const random = seededRandom(stableSeed(seedMaterial));
  const available = Array.from({ length: 42 }, (_, index) => index + 1);
  for (let index = available.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [available[index], available[swap]] = [available[swap], available[index]];
  }
  return Array.from({ length: 3 }, (_, rankIndex) => {
    const numbers = available.slice(rankIndex * 5, (rankIndex + 1) * 5).sort((a, b) => a - b);
    const positions = numbers.map((number, column) => {
      const digit = number % 10;
      const evidence = columns[column].allCandidates.find(candidate => candidate.digit === digit) || {};
      const exactProbability = orderStatisticDistribution(column)[number - 1] || 0;
      return {
        ...evidence,
        number,
        suggestedNumber: number,
        digit,
        modelProbability: exactProbability,
        unorderedProbability: 5 / 42,
        endingProbability: endingDistribution(column)[digit],
        controlSeed: stableSeed(seedMaterial)
      };
    });
    return {
      rank: rankIndex + 1,
      available: true,
      unavailableReason: '',
      sourceTrack: 'control',
      controlSeed: stableSeed(seedMaterial),
      numbers,
      digits: numbers.map(number => number % 10),
      positions,
      expectedUnorderedHits: 25 / 42,
      expectedExactHits: positions.reduce((sum, item) => sum + item.modelProbability, 0),
      expectedEndingHits: positions.reduce((sum, item) => sum + item.endingProbability, 0),
      expectedTensHits: positions.reduce((sum, item) => sum + (item.tensProbability || 0), 0),
      score: Math.round((5 / 42) * 100),
      endingScore: Math.round((positions.reduce((sum, item) => sum + item.endingProbability, 0) / 5) * 100),
      numberScore: Math.round((5 / 42) * 100),
      tensScore: Math.round((positions.reduce((sum, item) => sum + (item.tensProbability || 0), 0) / 5) * 100),
      patternScore: 0,
      streamScore: 0,
      optimizationTarget: 'unordered-control'
    };
  });
}

function topDistributionItems(distribution = [], limit = 3) {
  return [...distribution.keys()]
    .sort((left, right) => distribution[right] - distribution[left] || left - right)
    .slice(0, limit)
    .map(digit => ({ digit, probability: distribution[digit] || 0 }));
}

function hncdeSequenceForecasts(draws = []) {
  const safeDraws = chronologicalDraws(draws);
  if (safeDraws.length < 3) {
    return Array.from({ length: 5 }, (_, column) => ({
      column,
      distribution: endingDistribution(column),
      trials: 0,
      sequence: 'insufficient-history'
    }));
  }
  const timeline = buildDigitHeatTimeline(safeDraws);
  const tierAt = (index, digit) => timeline[index]?.items.find(item => item.digit === digit)?.tier || 'neutral';
  return Array.from({ length: 5 }, (_, column) => {
    const prior = endingDistribution(column);
    const currentSequence = Array.from({ length: 10 }, (_, digit) => (
      `${tierAt(timeline.length - 2, digit)}>${tierAt(timeline.length - 1, digit)}`
    ));
    const stats = Array.from({ length: 10 }, () => ({ hits: 0, trials: 0 }));
    for (let targetIndex = 2; targetIndex < safeDraws.length; targetIndex += 1) {
      for (let digit = 0; digit < 10; digit += 1) {
        const sequence = `${tierAt(targetIndex - 2, digit)}>${tierAt(targetIndex - 1, digit)}`;
        if (sequence !== currentSequence[digit]) continue;
        stats[digit].trials += 1;
        if (safeDraws[targetIndex].digits[column] === digit) stats[digit].hits += 1;
      }
    }
    const raw = stats.map((item, digit) => (
      (item.hits + (SIGNAL_PRIOR_STRENGTH * prior[digit])) / (item.trials + SIGNAL_PRIOR_STRENGTH)
    ));
    return {
      column,
      distribution: normalizeDistribution(raw),
      trials: Math.min(...stats.map(item => item.trials)),
      trialsByDigit: stats.map(item => item.trials),
      sequenceByDigit: currentSequence
    };
  });
}

function normalizedFeature(values = []) {
  const total = values.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  return total ? values.map(value => Math.max(0, Number(value) || 0) / total) : values.map(() => 0);
}

/** Prospective Green-track pivot endings expanded into position-feasible full numbers. */
export function buildPivotNumberEvidence(draws = [], columns = [], mode = NEXT_DRAW_PROMOTION_POLICY.pivotMode) {
  const safeDraws = chronologicalDraws(draws);
  const source = safeDraws.at(-1);
  if (!source || !Array.isArray(columns) || columns.length !== 5) {
    return { valid: false, mode, sourceDrawId: null, sourceDate: null, pivots: [], digits: [], columns: [] };
  }
  const expandedColumns = Array.from({ length: 5 }, (_, column) => {
    const expanded = expandPivotPoolNumbers(source.numbers, mode, column);
    const componentByDigit = new Map(columns[column].allCandidates.map(candidate => [candidate.digit, candidate]));
    const raw = expanded.numbers.map(item => {
      const component = componentByDigit.get(item.digit) || {};
      const positionAppearances = safeDraws.reduce((count, draw) => count + (draw.numbers[column] === item.number ? 1 : 0), 0);
      const unorderedAppearances = safeDraws.reduce((count, draw) => count + (draw.numbers.includes(item.number) ? 1 : 0), 0);
      const reverseIndex = [...safeDraws].reverse().findIndex(draw => draw.numbers.includes(item.number));
      return {
        ...item,
        positionAppearances,
        unorderedAppearances,
        recencyGap: reverseIndex < 0 ? safeDraws.length + 1 : reverseIndex,
        temporalProbability: component.historyProbability || 0,
        structureProbability: component.patternProbability || 0,
        hncdeProbability: component.stateProbability || 0,
        controlEndingProbability: component.comboEndingProbability || endingDistribution(column)[item.digit]
      };
    });
    const features = [
      normalizedFeature(raw.map(item => item.positionAppearances + 1)),
      normalizedFeature(raw.map(item => item.unorderedAppearances + 1)),
      normalizedFeature(raw.map(item => 1 / (item.recencyGap + 1))),
      normalizedFeature(raw.map(item => item.temporalProbability)),
      normalizedFeature(raw.map(item => item.structureProbability)),
      normalizedFeature(raw.map(item => item.hncdeProbability))
    ];
    const candidates = raw.map((item, index) => {
      const studyScore = features.reduce((sum, feature) => sum + (feature[index] || 0), 0) / features.length;
      const supportingTracks = ['structure'];
      if (item.temporalProbability > item.controlEndingProbability) supportingTracks.push('temporal');
      if (item.hncdeProbability > item.controlEndingProbability) supportingTracks.push('hncde');
      return { ...item, studyScore, supportingTracks };
    }).sort((left, right) => right.studyScore - left.studyScore || left.number - right.number);
    return { column, digits: expanded.digits, candidates };
  });
  const reference = expandPivotPoolNumbers(source.numbers, mode);
  return {
    valid: reference.valid,
    mode: reference.mode,
    sourceDrawId: String(source.id || source.date),
    sourceDate: source.date,
    pivots: reference.pivots,
    digits: reference.digits,
    equations: reference.candidates.flatMap(candidate => candidate.evidence.map(item => item.explanation)),
    columns: expandedColumns
  };
}

/** Build the four independently visible v9 evidence tracks. */
export function buildNextDrawTrackForecasts(draws = [], columns = [], pivotMode = NEXT_DRAW_PROMOTION_POLICY.pivotMode) {
  const safeDraws = chronologicalDraws(draws);
  if (!safeDraws.length || !Array.isArray(columns) || columns.length !== 5) return [];
  const successors = rankHistoricalSuccessors(safeDraws);
  const hncdeSequences = hncdeSequenceForecasts(safeDraws);
  const pivotEvidence = buildPivotNumberEvidence(safeDraws, columns, pivotMode);
  return NEXT_DRAW_TRACKS.map(definition => {
    const trackColumns = columns.map((columnResult, column) => {
      const byDigit = [...columnResult.allCandidates].sort((a, b) => a.digit - b.digit);
      let distribution;
      if (definition.key === 'control') distribution = byDigit.map(item => item.comboEndingProbability);
      else if (definition.key === 'temporal') distribution = byDigit.map(item => item.historyProbability);
      else if (definition.key === 'hncde') distribution = hncdeSequences[column].distribution;
      else {
        const pivotDigits = new Set(pivotEvidence.columns[column]?.digits || []);
        const pivotMass = pivotDigits.size ? 1 / pivotDigits.size : 0;
        distribution = normalizeDistribution(byDigit.map(item => (
          (0.75 * item.patternProbability) + (0.25 * (pivotDigits.has(item.digit) ? pivotMass : 0))
        )));
      }
      const pivotColumn = pivotEvidence.columns[column];
      return {
        column,
        distribution,
        topDigits: topDistributionItems(distribution),
        successorCandidates: definition.key === 'temporal' ? successors[column]?.candidates || [] : [],
        hncdeSequence: definition.key === 'hncde' ? hncdeSequences[column] : null,
        fullNumberCandidates: definition.key === 'structure'
          ? (pivotColumn?.candidates || []).slice(0, 8)
          : []
      };
    });
    const active = NEXT_DRAW_PROMOTION_POLICY.activeTrack === definition.key;
    return {
      ...definition,
      status: definition.key === 'control' ? 'control' : (active ? 'promoted' : 'study'),
      sampleSize: safeDraws.length,
      evidenceId: definition.key === 'control'
        ? NEXT_DRAW_LIVE_POLICY.evidenceId
        : `${NEXT_DRAW_PROMOTION_POLICY.reportId}:${definition.key}`,
      columns: trackColumns,
      pivotEvidence: definition.key === 'structure' ? pivotEvidence : null
    };
  });
}

export function walkForwardPatternPerformance(draws = [], limit = 3, policy = NEXT_DRAW_LIVE_POLICY) {
  const safeDraws = chronologicalDraws(draws);
  const byCandidate = new Map();
  const evaluations = [];
  for (let targetIndex = MIN_STREAM_DRAWS; targetIndex < safeDraws.length; targetIndex += 1) {
    const history = safeDraws.slice(0, targetIndex);
    const actual = safeDraws[targetIndex];
    scoreNextDrawColumnsV6(history, limit, policy).forEach(result => {
      result.candidates.forEach(candidate => {
        const key = `${result.column}:${candidate.digit}:${candidate.suggestedNumber}:${policy.kind}`;
        const stats = byCandidate.get(key) || { column: result.column, digit: candidate.digit, number: candidate.suggestedNumber, policy: policy.kind, endingHits: 0, numberHits: 0, trials: 0 };
        const endingHit = actual.digits[result.column] === candidate.digit;
        const numberHit = actual.numbers[result.column] === candidate.suggestedNumber;
        stats.trials += 1;
        if (endingHit) stats.endingHits += 1;
        if (numberHit) stats.numberHits += 1;
        byCandidate.set(key, stats);
        evaluations.push({ targetDate: actual.date, column: result.column, digit: candidate.digit, suggestedNumber: candidate.suggestedNumber, policy: policy.kind, endingHit, numberHit });
      });
    });
  }
  const candidateStats = [...byCandidate.values()].map(stats => ({
    ...stats,
    endingRate: stats.trials ? stats.endingHits / stats.trials : null,
    numberRate: stats.trials ? stats.numberHits / stats.trials : null,
    sufficient: stats.trials >= MIN_BACKTEST_TRIALS
  }));
  return { candidateStats, evaluations };
}

export function analyzeNextDrawBoard(draws = [], options = {}) {
  const safeDraws = chronologicalDraws(draws);
  const limit = Number.isInteger(options.limit) ? Math.max(0, options.limit) : 3;
  const policy = options.policy || NEXT_DRAW_LIVE_POLICY;
  const columns = scoreNextDrawColumnsV6(safeDraws, limit, policy);
  const lines = policy.kind === 'control'
    ? buildUniformControlLines(safeDraws, columns).slice(0, limit)
    : buildOptimizedSystemLines(columns, limit);
  if (options.includeWalkForward !== false && safeDraws.length >= MIN_STREAM_DRAWS) {
    const performance = walkForwardPatternPerformance(safeDraws, limit, policy);
    const statsByKey = new Map(performance.candidateStats.map(stats => [
      `${stats.column}:${stats.digit}:${stats.number}:${stats.policy}`, stats
    ]));
    columns.forEach(result => {
      result.allCandidates.forEach(candidate => {
        const stats = statsByKey.get(`${result.column}:${candidate.digit}:${candidate.suggestedNumber}:${policy.kind}`)
          || { endingHits: 0, numberHits: 0, trials: 0, endingRate: null, numberRate: null, sufficient: false };
        candidate.walkForwardHits = stats.endingHits;
        candidate.walkForwardNumberHits = stats.numberHits;
        candidate.walkForwardTrials = stats.trials;
        candidate.walkForwardRate = stats.endingRate;
        candidate.walkForwardNumberRate = stats.numberRate;
        candidate.walkForwardSufficient = stats.sufficient;
      });
    });
  }
  const pivotMode = ['low', 'high', 'both'].includes(options.pivotMode)
    ? options.pivotMode
    : NEXT_DRAW_PROMOTION_POLICY.pivotMode;
  const trackForecasts = buildNextDrawTrackForecasts(safeDraws, columns, pivotMode);
  const trackBySource = new Map(trackForecasts.map(track => [track.sourceKey, track]));
  const sourceForecasts = columns.map(result => ({
    column: result.column,
    ...Object.fromEntries(STUDY_SOURCE_KEYS.map(key => {
      const top = trackBySource.get(key)?.columns?.[result.column]?.topDigits?.[0];
      return [key, top || { digit: 0, probability: 0 }];
    }))
  }));
  return {
    version: NEXT_DRAW_ANALYZER_VERSION,
    windowSize: safeDraws.length,
    policy: { ...policy },
    studyPolicy: { ...NEXT_DRAW_STUDY_POLICY },
    targetAfterDate: safeDraws.at(-1)?.date || null,
    columns,
    lines,
    trackForecasts,
    promotionPolicy: { ...NEXT_DRAW_PROMOTION_POLICY, pivotMode },
    sourceForecasts,
    portfolio: {
      expectedUnorderedHits: lines.filter(line => line.available).reduce((sum, line) => sum + (line.expectedUnorderedHits || 0), 0),
      uniqueNumberCount: new Set(lines.filter(line => line.available).flatMap(line => line.numbers)).size,
      expectedExactHits: lines.filter(line => line.available).reduce((sum, line) => sum + (line.expectedExactHits || 0), 0),
      expectedEndingHits: lines.filter(line => line.available).reduce((sum, line) => sum + (line.expectedEndingHits || 0), 0),
      expectedTensHits: lines.filter(line => line.available).reduce((sum, line) => sum + (line.expectedTensHits || 0), 0)
    }
  };
}

/** Compatibility wrapper returning the five Ball-column results. */
export function rankPatternRecommendationsByColumn(draws = [], limit = 3) {
  const safeDraws = chronologicalDraws(draws);
  if (!safeDraws.length) return [];
  return analyzeNextDrawBoard(safeDraws, { limit }).columns;
}

/** Compatibility wrapper returning the five Ball-column results. */
