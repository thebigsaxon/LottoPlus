/** Online winning-pivot estimates. Every forecast precedes its target result. */
import { buildPivotCandidatePool, evaluateWinningPivotPair } from './pivotPools.js?v=2';

export const AUTO_PIVOT_VERSION = 1;
const WARMUP_PAIRS = 90;
const VALIDATION_PAIRS = 240;
const MIN_VALIDATION = 120;
const PRIOR = 24;
const MASS = [4, 5, 5, 4, 4, 4, 4, 4, 4, 4];
const countNumbers = digits => digits.reduce((sum, digit) => sum + MASS[digit], 0);
const mean = values => values.length ? values.reduce((sum, x) => sum + x, 0) / values.length : 0;
const cache = new Map();

export function cleanPivotHistory(draws = [], throughDate = '') {
  const dates = new Map();
  for (const draw of Array.isArray(draws) ? draws : []) {
    if (!draw || draw.preview || !/^\d{4}-\d{2}-\d{2}$/.test(draw.date || '') || (throughDate && draw.date > throughDate)) continue;
    const timestamp = Date.parse(`${draw.date}T00:00:00Z`);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== draw.date) continue;
    const numbers = Array.isArray(draw.numbers) ? draw.numbers.map(Number) : [];
    if (numbers.length !== 5 || new Set(numbers).size !== 5 || !numbers.every(n => Number.isInteger(n) && n >= 1 && n <= 42)) continue;
    dates.set(draw.date, { id: String(draw.id || draw.date), date: draw.date, numbers: numbers.sort((a, b) => a - b) });
  }
  return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function interval(values) {
  const average = mean(values);
  const variance = values.length > 1 ? values.reduce((sum, x) => sum + (x - average) ** 2, 0) / (values.length - 1) : 0;
  const margin = values.length > 1 ? 1.96 * Math.sqrt(variance / values.length) : 0;
  return { mean: average, lower: average - margin, upper: average + margin };
}

function probability(stats, key, prior, strength = PRIOR) {
  const entry = stats.get(key) || { wins: 0, trials: 0 };
  return { probability: (entry.wins + strength * prior) / (entry.trials + strength), trials: entry.trials };
}
function observe(stats, key, winner) {
  const entry = stats.get(key) || { wins: 0, trials: 0 };
  entry.trials += 1;
  entry.wins += Number(winner);
  stats.set(key, entry);
}
function rank(candidates, key) {
  return [...candidates].sort((a, b) => b[key] - a[key] || a.numberCount - b.numberCount || a.digit - b.digit);
}
function features(candidate, source, winners) {
  const digits = source.numbers.map(n => n % 10);
  const digit = candidate.digit;
  const role = digit === Math.max(...digits) ? 'high' : digit === Math.min(...digits) ? 'low' : 'middle';
  let gap = 0;
  while (gap < winners.length && !winners[winners.length - 1 - gap].includes(digit)) gap += 1;
  const gapBucket = gap < 4 ? gap : gap < 7 ? '4-6' : '7+';
  const signature = lag => (winners.at(-lag) || []).join(',') || 'none';
  return [
    `digit:${digit}`,
    `role:${role}:copies:${digits.filter(d => d === digit).length}`,
    `transition:${signature(1)}:${digit}`,
    `lag2:${signature(2)}:${digit}`,
    `loop:${signature(2)}>${signature(1)}:${digit}`,
    `return:${digit}:${gapBucket}`
  ];
}
function forecast(source, state) {
  const pools = [...new Set(source.numbers.map(n => n % 10))].map(digit => buildPivotCandidatePool(source.numbers, digit));
  const widths = pools.map(pool => countNumbers(pool.digits));
  const candidates = pools.map((pool, index) => {
    const numberCount = widths[index];
    const relativeWidth = numberCount === Math.max(...widths) ? 'widest' : numberCount === Math.min(...widths) ? 'narrowest' : 'middle';
    const widthKey = `width:${Math.floor(numberCount / 4)}:${relativeWidth}:candidates:${pools.length}`;
    const widthPrior = probability(state.stats, `size:${Math.floor(numberCount / 4)}`, 0.5, 12);
    const baseline = probability(state.stats, widthKey, widthPrior.probability);
    const keys = features(pool, source, state.winners);
    const evidence = keys.map(key => ({ key, ...probability(state.stats, key, baseline.probability) }));
    // Fixed blend, not tuned after inspecting the evaluation results.
    const patternProbability = 0.5 * baseline.probability + 0.5 * mean(evidence.map(item => item.probability));
    return { digit: pool.digit, digits: pool.digits, numberCount, widthKey, keys, evidence,
      baselineProbability: baseline.probability, patternProbability, trials: baseline.trials };
  });
  const baseline = rank(candidates, 'baselineProbability')[0];
  const patternRank = rank(candidates, 'patternProbability');
  const pattern = patternRank[0];
  const second = patternRank[1];
  const union = second ? [...new Set([...pattern.digits, ...second.digits])].sort((a, b) => a - b) : pattern.digits;
  const pairEligible = Boolean(second && pattern.patternProbability - second.patternProbability <= 0.05
    && countNumbers(union) <= 30 && countNumbers(union) >= pattern.numberCount + 2);
  return { candidates, baseline, pattern, high: candidates.find(c => c.digit === Math.max(...candidates.map(item => item.digit))),
    pair: pairEligible ? [pattern.digit, second.digit] : [pattern.digit], pairDigits: pairEligible ? union : pattern.digits };
}
function audit(records) {
  const sample = records.slice(-VALIDATION_PAIRS);
  const brierGain = interval(sample.map(r => r.baselineBrier - r.patternBrier));
  const coverageGain = interval(sample.map(r => r.patternResidual - r.baselineResidual));
  const pairRecords = sample.filter(r => r.pairEligible);
  const pairGain = interval(pairRecords.map(r => r.pairResidual - r.patternResidual));
  const patternsPromoted = sample.length >= MIN_VALIDATION && brierGain.lower > 0 && coverageGain.lower > 0;
  const pairPromoted = patternsPromoted && pairRecords.length >= MIN_VALIDATION && pairGain.lower > 0;
  return { trials: sample.length, from: sample[0]?.date || '', through: sample.at(-1)?.date || '',
    patternsPromoted, pairPromoted, brierGain, coverageGain, pairTrials: pairRecords.length, pairGain,
    baselineBrier: mean(sample.map(r => r.baselineBrier)), patternBrier: mean(sample.map(r => r.patternBrier)),
    baselineWinRate: mean(sample.map(r => r.baselineWinner)), patternWinRate: mean(sample.map(r => r.patternWinner)),
    highWinRate: mean(sample.map(r => r.highWinner)) };
}

/** Probability means "among pivots with most pool hits next draw", including ties. */
export function analyzeAutomaticPivot(draws = []) {
  const history = cleanPivotHistory(draws);
  const cacheKey = history.map(d => `${d.date}:${d.numbers.join(',')}`).join('|');
  if (cache.has(cacheKey)) return structuredClone(cache.get(cacheKey));
  if (!history.length) return null;
  const state = { stats: new Map(), winners: [] };
  const records = [];
  let completedPairs = 0;
  let lastForecast;
  for (let i = 0; i < history.length; i += 1) {
    const source = history[i];
    const prediction = forecast(source, state);
    lastForecast = prediction;
    const target = history[i + 1];
    if (!target) break;
    // Ignore gaps: an unobserved next draw cannot supply a training label.
    const gapDays = (Date.parse(`${target.date}T00:00:00Z`) - Date.parse(`${source.date}T00:00:00Z`)) / 86400000;
    if (gapDays !== 1) { state.winners = []; continue; }
    const evaluation = evaluateWinningPivotPair(source, target);
    const winners = evaluation.winners.map(c => c.digit);
    const targetDigits = target.numbers.map(n => n % 10);
    const residual = digits => targetDigits.filter(d => digits.includes(d)).length - 5 * countNumbers(digits) / 42;
    if (completedPairs >= WARMUP_PAIRS) {
      records.push({ date: target.date,
        baselineBrier: mean(prediction.candidates.map(c => (c.baselineProbability - Number(winners.includes(c.digit))) ** 2)),
        patternBrier: mean(prediction.candidates.map(c => (c.patternProbability - Number(winners.includes(c.digit))) ** 2)),
        baselineResidual: residual(prediction.baseline.digits), patternResidual: residual(prediction.pattern.digits),
        pairResidual: residual(prediction.pairDigits), pairEligible: prediction.pair.length === 2,
        baselineWinner: Number(winners.includes(prediction.baseline.digit)),
        patternWinner: Number(winners.includes(prediction.pattern.digit)), highWinner: Number(winners.includes(prediction.high.digit)) });
    }
    for (const candidate of prediction.candidates) {
      const winner = winners.includes(candidate.digit);
      for (const key of [candidate.widthKey, `size:${Math.floor(candidate.numberCount / 4)}`, ...candidate.keys]) observe(state.stats, key, winner);
    }
    state.winners.push(winners);
    completedPairs += 1;
  }
  const validation = audit(records);
  const key = validation.patternsPromoted ? 'patternProbability' : 'baselineProbability';
  const ranked = rank(lastForecast.candidates, key);
  const pivots = validation.pairPromoted && lastForecast.pair.length === 2 ? lastForecast.pair : [ranked[0].digit];
  const source = history.at(-1);
  const poolDigits = buildAutomaticPool(source.numbers, pivots).digits;
  const result = {
    version: AUTO_PIVOT_VERSION, sourceDate: source.date, sourceNumbers: [...source.numbers], historyStart: history[0].date,
    historyDraws: history.length, completedPairs,
    poolNumbers: Array.from({ length: 42 }, (_, i) => i + 1).filter(n => poolDigits.includes(n % 10)),
    pivots, method: validation.patternsPromoted ? 'patterns' : 'historical-baseline', validation,
    reason: validation.patternsPromoted
      ? 'Transitions and recurrence improved prior walk-forward forecasts beyond the pool-size baseline.'
      : validation.trials < MIN_VALIDATION
        ? 'Not enough prior validation draws for pattern selection; using the historical pool-size estimate.'
        : 'Patterns have not shown a reliable advantage; using the historical pool-size estimate.',
    candidates: ranked.map(c => ({ digit: c.digit, probability: c[key], patternProbability: c.patternProbability,
      baselineProbability: c.baselineProbability, poolSize: c.numberCount, trials: c.trials,
      evidence: c.evidence.map(({ key, probability, trials }) => ({ key, probability, trials })) })),
    recentWinners: history.length > 1 ? state.winners.slice(-8) : []
  };
  cache.set(cacheKey, result);
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  return structuredClone(result);
}

export function buildAutomaticPool(numbers, pivots) {
  const pools = pivots.map(digit => buildPivotCandidatePool(numbers, digit));
  const equations = pools.flatMap(pool => pool.candidates.flatMap(c => c.evidence));
  const digits = [...new Set(pools.flatMap(pool => pool.digits))].sort((a, b) => a - b);
  return { valid: digits.length > 0, pivots: [...pivots], digits, width: digits.length, equations,
    candidates: digits.map(digit => ({ digit, evidence: equations.filter(e => e.result === digit) })) };
}

/** Compact, durable provenance; never retrain a stored decision on later results. */
export function sanitizeAutomaticSelection(value) {
  if (!value || typeof value !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(value.sourceDate || '')) return null;
  const digits = items => [...new Set((Array.isArray(items) ? items : []).filter(n => Number.isInteger(n) && n >= 0 && n <= 9))];
  const count = n => Math.max(0, Math.floor(Number(n) || 0));
  const chance = n => Math.max(0, Math.min(1, Number(n) || 0));
  return { version: count(value.version), sourceDate: value.sourceDate,
    sourceNumbers: cleanPivotHistory([{ date: value.sourceDate, numbers: value.sourceNumbers }])[0]?.numbers || [],
    historyStart: String(value.historyStart || '').slice(0, 10), historyDraws: count(value.historyDraws), completedPairs: count(value.completedPairs),
    poolNumbers: [...new Set((Array.isArray(value.poolNumbers) ? value.poolNumbers : []).filter(n => Number.isInteger(n) && n >= 1 && n <= 42))].sort((a, b) => a - b),
    pivots: digits(value.pivots).slice(0, 2), method: value.method === 'patterns' ? 'patterns' : 'historical-baseline',
    reason: String(value.reason || '').slice(0, 500),
    validation: { trials: count(value.validation?.trials), through: String(value.validation?.through || '').slice(0, 10),
      patternsPromoted: value.validation?.patternsPromoted === true, pairPromoted: value.validation?.pairPromoted === true },
    candidates: (Array.isArray(value.candidates) ? value.candidates : []).filter(c => digits([c?.digit]).length).slice(0, 10)
      .map(c => ({ digit: c.digit, probability: chance(c.probability), poolSize: Math.min(42, count(c.poolSize)), trials: count(c.trials) })) };
}

export function scoreAutomaticPivot(selection, target) {
  const saved = sanitizeAutomaticSelection(selection);
  if (!saved?.sourceNumbers.length || !target || target.date <= saved.sourceDate) return null;
  const evaluation = evaluateWinningPivotPair({ date: saved.sourceDate, numbers: saved.sourceNumbers }, target);
  if (!evaluation.valid) return null;
  const pool = buildAutomaticPool(saved.sourceNumbers, saved.pivots).digits;
  return { winningPivots: evaluation.winners.map(c => c.digit),
    pickedWinningPivot: evaluation.winners.some(c => saved.pivots.includes(c.digit)),
    matchedNumbers: target.numbers.filter(n => saved.poolNumbers.length ? saved.poolNumbers.includes(n) : pool.includes(n % 10)) };
}
