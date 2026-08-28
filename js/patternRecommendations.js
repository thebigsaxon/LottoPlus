import { mathematicalSequenceRelationships, onesDigit } from './onesAnalysis.js';
import { buildDigitHeatTimeline } from './repeatSummary.js?v=4';

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

export const NEXT_DRAW_ANALYZER_VERSION = 5;

export const PATTERN_FAMILIES = {
  repeat: { label: 'Adjacent repeat' },
  vertical: { label: 'Same-column run' },
  sister: { label: 'Sister shift' },
  inline: { label: 'Inline math' },
  diagonal: { label: 'Diagonal math' },
  sisterOutput: { label: 'Sister output' },
  lPattern: { label: 'L pattern' }
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
  if (signal.pattern === 'repeat') return signal.targetColumn - first;
  if (signal.pattern === 'sister') return signal.operation === 'left' ? -1 : 1;
  return 0;
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

export function buildOptimizedSystemLines(columns = [], limit = 3) {
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
export function walkForwardPatternPerformance(draws = [], limit = 3) {
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

export function analyzeNextDrawBoard(draws = [], options = {}) {
  const safeDraws = chronologicalDraws(draws);
  const limit = Number.isInteger(options.limit) ? Math.max(0, options.limit) : 3;
  const columns = scoreHybridColumns(safeDraws, limit);
  const lines = buildOptimizedSystemLines(columns, limit);
  if (options.includeWalkForward !== false && safeDraws.length >= MIN_STREAM_DRAWS) {
    const performance = walkForwardPatternPerformance(safeDraws, limit);
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
    version: NEXT_DRAW_ANALYZER_VERSION,
    windowSize: safeDraws.length,
    columns,
    lines
  };
}

/** Compatibility wrapper returning the five Ball-column results. */
export function rankPatternRecommendationsByColumn(draws = [], limit = 3) {
  const safeDraws = chronologicalDraws(draws);
  if (!safeDraws.length) return [];
  return analyzeNextDrawBoard(safeDraws, { limit }).columns;
}
