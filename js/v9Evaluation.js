import { analyzeNextDrawBoard } from './patternRecommendations.js?v=12';
import { pairedBootstrap } from './v6Evaluation.js?v=1';

export const V9_WINDOWS = Object.freeze([25, 50, 100, 'expanding']);
export const V9_TRACK_KEYS = Object.freeze(['temporal', 'structure', 'hncde', 'combined']);
export const V9_PIVOT_MODES = Object.freeze(['low', 'high', 'both']);
export const V9_COMBINATION_WEIGHTS = Object.freeze([
  Object.freeze({ label: 'balanced', temporal: 1 / 3, structure: 1 / 3, hncde: 1 / 3 }),
  Object.freeze({ label: 'temporal-heavy', temporal: 0.5, structure: 0.25, hncde: 0.25 }),
  Object.freeze({ label: 'structure-heavy', temporal: 0.25, structure: 0.5, hncde: 0.25 }),
  Object.freeze({ label: 'hncde-heavy', temporal: 0.25, structure: 0.25, hncde: 0.5 })
]);

export function v9ChronologicalSplit(draws = []) {
  const ordered = [...draws].sort((left, right) => left.date.localeCompare(right.date));
  return {
    ordered,
    train: { start: 25, end: Math.floor(ordered.length * 0.6) },
    validation: { start: Math.floor(ordered.length * 0.6), end: Math.floor(ordered.length * 0.8) },
    test: { start: Math.floor(ordered.length * 0.8), end: ordered.length }
  };
}

function normalizeInclusionScores(values = []) {
  const positive = values.map(value => Math.max(1e-9, Number(value) || 0));
  const total = positive.reduce((sum, value) => sum + value, 0);
  return positive.map(value => (value / total) * 5);
}

export function trackNumberProbabilities(history = [], analysis, trackKey, combinationWeights = V9_COMBINATION_WEIGHTS[0]) {
  const trackByKey = new Map((analysis?.trackForecasts || []).map(track => [track.key, track]));
  const weightedTracks = trackKey === 'combined'
    ? ['temporal', 'structure', 'hncde'].map(key => ({
      key,
      track: trackByKey.get(key),
      weight: Math.max(0, Number(combinationWeights?.[key]) || 0)
    })).filter(item => item.track && item.weight > 0)
    : [{ key: trackKey, track: trackByKey.get(trackKey), weight: 1 }].filter(item => item.track);
  const totalTrackWeight = weightedTracks.reduce((sum, item) => sum + item.weight, 0) || 1;
  const pivotByColumn = new Map((trackByKey.get('structure')?.pivotEvidence?.columns || [])
    .map(item => [item.column, new Map((item.candidates || []).map(candidate => [candidate.number, candidate.studyScore]))]));
  const raw = Array.from({ length: 42 }, (_, index) => {
    const number = index + 1;
    const appearances = history.reduce((count, draw) => count + (draw.numbers.includes(number) ? 1 : 0), 0);
    const base = (appearances + 5) / (history.length + 42);
    const positional = weightedTracks.flatMap(item => item.track.columns
      .filter(column => number >= column.column + 1 && number <= 38 + column.column)
      .map(column => ({ probability: column.distribution[number % 10] || 0, weight: item.weight })));
    const positionalScore = positional.reduce((sum, item) => sum + (item.probability * item.weight), 0)
      / totalTrackWeight;
    const structureWeight = trackKey === 'structure' ? 1
      : trackKey === 'combined' ? Math.max(0, Number(combinationWeights?.structure) || 0) / totalTrackWeight : 0;
    const pivot = trackKey === 'structure' || trackKey === 'combined'
      ? Math.max(0, ...[...pivotByColumn.values()].map(values => values.get(number) || 0))
      : 0;
    return base + positionalScore + (pivot * structureWeight);
  });
  return normalizeInclusionScores(raw);
}

function balanceSelectedNumbers(selected, probabilities) {
  const rows = [[], [], []];
  const totals = [0, 0, 0];
  selected.forEach(number => {
    const eligible = [0, 1, 2].filter(row => rows[row].length < 5)
      .sort((left, right) => totals[left] - totals[right] || left - right);
    const row = eligible[0];
    rows[row].push(number);
    totals[row] += probabilities[number - 1];
  });
  return rows.map((numbers, index) => ({
    rank: index + 1,
    available: true,
    numbers: numbers.sort((left, right) => left - right),
    digits: numbers.map(number => number % 10),
    support: totals[index]
  }));
}

export function buildTrackPortfolio(history = [], analysis, trackKey, combinationWeights = V9_COMBINATION_WEIGHTS[0]) {
  if (trackKey === 'control') {
    return { lines: analysis.lines, probabilities: Array(42).fill(5 / 42) };
  }
  const probabilities = trackNumberProbabilities(history, analysis, trackKey, combinationWeights);
  const selected = [...probabilities.keys()]
    .sort((left, right) => probabilities[right] - probabilities[left] || left - right)
    .slice(0, 15)
    .map(index => index + 1);
  return { lines: balanceSelectedNumbers(selected, probabilities), probabilities };
}

export function scoreTicketPortfolio(lines = [], actualNumbers = [], probabilities = []) {
  const winning = new Set(actualNumbers);
  const hits = lines.map(line => line.numbers.filter(number => winning.has(number)).length);
  const selected = new Set(lines.flatMap(line => line.numbers));
  const brier = probabilities.length === 42
    ? probabilities.reduce((sum, probability, index) => (
      sum + (probability - (winning.has(index + 1) ? 1 : 0)) ** 2
    ), 0) / 42
    : null;
  return {
    meanHitsPerLine: hits.reduce((sum, value) => sum + value, 0) / Math.max(1, hits.length),
    matchTwoRate: hits.filter(value => value >= 2).length / Math.max(1, hits.length),
    matchThreeRate: hits.filter(value => value >= 3).length / Math.max(1, hits.length),
    matchFourRate: hits.filter(value => value >= 4).length / Math.max(1, hits.length),
    matchFiveRate: hits.filter(value => value >= 5).length / Math.max(1, hits.length),
    portfolioCoverage: actualNumbers.filter(number => selected.has(number)).length,
    bestLineHits: Math.max(0, ...hits),
    brier
  };
}

function finish(records) {
  const keys = ['meanHitsPerLine', 'matchTwoRate', 'matchThreeRate', 'matchFourRate', 'matchFiveRate', 'portfolioCoverage', 'bestLineHits', 'brier'];
  return {
    draws: records.length,
    ...Object.fromEntries(keys.map(key => [key, records.length
      ? records.reduce((sum, record) => sum + (record[key] || 0), 0) / records.length
      : 0])),
    perDraw: records
  };
}

export function evaluateV9Arm(draws, range, trackKey, window, options = {}) {
  const records = [];
  for (let target = range.start; target < range.end; target += 1) {
    const size = window === 'expanding' ? target : Number(window);
    const history = draws.slice(Math.max(0, target - size), target);
    if (history.length < 4) continue;
    const pivotMode = V9_PIVOT_MODES.includes(options.pivotMode) ? options.pivotMode : 'high';
    const cacheKey = `${target}:${window}:${pivotMode}`;
    const analysis = options.analysisCache?.get(cacheKey)
      || analyzeNextDrawBoard(history, { includeWalkForward: false, pivotMode });
    options.analysisCache?.set(cacheKey, analysis);
    const portfolio = buildTrackPortfolio(history, analysis, trackKey, options.combinationWeights);
    records.push({
      date: draws[target].date,
      ...scoreTicketPortfolio(portfolio.lines, draws[target].numbers, portfolio.probabilities)
    });
  }
  return finish(records);
}

export function compareV9TicketOutcomes(challenger, control) {
  const controlByDate = new Map(control.perDraw.map(item => [item.date, item]));
  const paired = challenger.perDraw.filter(item => controlByDate.has(item.date));
  const hitDifferences = paired.map(item => item.meanHitsPerLine - controlByDate.get(item.date).meanHitsPerLine);
  const confidence = pairedBootstrap(hitDifferences, { denominator: 1 });
  const matchTwoLift = paired.length ? paired.reduce((sum, item) => (
    sum + item.matchTwoRate - controlByDate.get(item.date).matchTwoRate
  ), 0) / paired.length : 0;
  const matchThreeLift = paired.length ? paired.reduce((sum, item) => (
    sum + item.matchThreeRate - controlByDate.get(item.date).matchThreeRate
  ), 0) / paired.length : 0;
  const brierLift = paired.length ? paired.reduce((sum, item) => (
    sum + controlByDate.get(item.date).brier - item.brier
  ), 0) / paired.length : 0;
  return {
    draws: paired.length,
    meanHitLift: confidence.mean,
    confidence,
    matchTwoLift,
    matchThreeLift,
    brierLift,
    passed: confidence.lower > 0 && matchTwoLift >= 0 && matchThreeLift >= 0 && brierLift >= 0
  };
}
