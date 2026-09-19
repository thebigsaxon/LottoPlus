/** Experimental deterministic full-number selector; does not change live tickets. */
import { analyzeAutomaticPivot, buildAutomaticPool, cleanPivotHistory } from './automaticPivot.js';
import { analyzePatternLanguage } from './patternLanguage.js';

export const POOL_REDUCTION_RULES = Object.freeze({
  version: 1,
  sizes: Object.freeze([20, 18, 16]),
  weights: Object.freeze({ pivot: 1 / 3, language: 1 / 3, history: 1 / 3 }),
  historyPrior: 84,
  primarySupport: 1,
  companionSupport: 0.5,
  balanceMinimumFraction: 0.4,
  balancePenalty: 0.03,
  endingPenalty: 0.025,
  bandPenalty: 0.015,
  optimization: 'Five per parity/range quadrant seed, improving one-number swaps, then least-loss nested deletions; deterministic local optimum, not an exhaustive global optimum.',
  scoreMeaning: 'Relative experimental support, not calibrated winning probabilities. Fixed rules before the 20-draw replay; not fitted to its results.'
});
const NUMBERS = Array.from({ length: 42 }, (_, i) => i + 1);
const BAND_SIZES = [9, 10, 10, 10, 3];
const sum = xs => xs.reduce((a, b) => a + b, 0);
const normalized = xs => { const total = sum(xs); return xs.map(x => total ? x / total : 1 / 42); };
const sorted = xs => [...xs].sort((a, b) => a - b);
const odd = n => n % 2;
const low = n => Number(n <= 21);
const quadrant = n => 2 * odd(n) + low(n);
const band = n => Math.floor(n / 10);

/** A date-based tie break rotates equal scores without using future results or RNG. */
export function tieKey(number, sourceDate) {
  let value = 2166136261;
  for (const ch of `${sourceDate}:${number}`) value = Math.imul(value ^ ch.charCodeAt(0), 16777619) >>> 0;
  return value;
}

export function poolShape(numbers) {
  const endings = Array(10).fill(0), bands = Array(5).fill(0);
  numbers.forEach(n => { endings[n % 10]++; bands[band(n)]++; });
  return { odd: sum(numbers.map(odd)), even: numbers.length - sum(numbers.map(odd)),
    low: sum(numbers.map(low)), high: numbers.length - sum(numbers.map(low)), endings, bands };
}
export function balancedPool(numbers) {
  const minimum = Math.floor(numbers.length * POOL_REDUCTION_RULES.balanceMinimumFraction);
  const shape = poolShape(numbers);
  return [shape.odd, shape.even, shape.low, shape.high].every(n => n >= minimum);
}
function objective(numbers, scores) {
  const k = numbers.length, shape = poolShape(numbers);
  return sum(numbers.map(n => scores[n - 1]))
    - POOL_REDUCTION_RULES.balancePenalty * ((shape.odd - k / 2) ** 2 + (shape.low - k / 2) ** 2)
    - POOL_REDUCTION_RULES.endingPenalty * sum(shape.endings.map(count => Math.max(0, count - 2) ** 2))
    - POOL_REDUCTION_RULES.bandPenalty * sum(shape.bands.map((count, i) => (count - k * BAND_SIZES[i] / 42) ** 2));
}

/** Exactly 20, then nested 18/16. Constraints apply to pools, not individual tickets. */
export function selectNestedPools(scores, sourceDate) {
  if (!Array.isArray(scores) || scores.length !== 42 || !scores.every(Number.isFinite)) throw new Error('42 finite scores required');
  const order = (a, b) => scores[b - 1] - scores[a - 1] || tieKey(a, sourceDate) - tieKey(b, sourceDate) || a - b;
  let chosen = [0, 1, 2, 3].flatMap(q => NUMBERS.filter(n => quadrant(n) === q).sort(order).slice(0, 5));
  // Strict objective improvement prevents cycles. Enumeration order resolves tied swaps.
  while (true) {
    const current = objective(chosen, scores);
    let best = current, replacement = null;
    for (const remove of [...chosen].sort(order)) {
      for (const add of NUMBERS.filter(n => !chosen.includes(n)).sort(order)) {
        const next = chosen.filter(n => n !== remove).concat(add);
        if (!balancedPool(next)) continue;
        const value = objective(next, scores);
        if (value > best + 1e-12) { best = value; replacement = next; }
      }
    }
    if (!replacement) break;
    chosen = replacement;
  }
  const pools = { 20: sorted(chosen) }, removals = [];
  while (chosen.length > 16) {
    const before = objective(chosen, scores);
    const candidates = chosen.map(number => ({ number, remaining: chosen.filter(n => n !== number) }))
      .filter(item => balancedPool(item.remaining))
      .map(item => ({ ...item, objective: objective(item.remaining, scores) }))
      .sort((a, b) => b.objective - a.objective || tieKey(a.number, sourceDate) - tieKey(b.number, sourceDate) || a.number - b.number);
    if (!candidates.length) throw new Error('Nested balance constraints have no feasible removal');
    const removed = candidates[0];
    chosen = removed.remaining;
    removals.push({ number: removed.number, fromSize: chosen.length + 1, toSize: chosen.length,
      objectiveLoss: before - removed.objective });
    if (POOL_REDUCTION_RULES.sizes.includes(chosen.length)) pools[chosen.length] = sorted(chosen);
  }
  return { pools, removals, shapes: Object.fromEntries(Object.entries(pools).map(([k, pool]) => [k, poolShape(pool)])) };
}

function syntheticPool(numbers, pivot) {
  return sorted(new Set(numbers.flatMap(n => [(pivot + n % 10) % 10, (10 - Math.abs(pivot - n % 10)) % 10])));
}
function pivotEvidence(history) {
  const source = history.at(-1), selection = analyzeAutomaticPivot(history);
  const primary = buildAutomaticPool(source.numbers, selection.pivots).digits;
  const allEven = source.numbers.every(n => n % 2 === 0), allOdd = source.numbers.every(n => n % 2 === 1);
  let companion = null, digits = [];
  if (allEven || allOdd) {
    companion = allEven ? 1 : 0;
    digits = syntheticPool(source.numbers, companion);
  } else if (primary.length && new Set(primary.map(n => n % 2)).size === 1) {
    // Mixed rows can also produce one-parity pools. Add an actual opposite-parity pivot.
    companion = sorted(new Set(source.numbers.map(n => n % 10)))
      .find(digit => digit % 2 !== selection.pivots[0] % 2) ?? null;
    if (companion !== null) digits = buildAutomaticPool(source.numbers, [companion]).digits;
  }
  const raw = NUMBERS.map(n => 1 + POOL_REDUCTION_RULES.primarySupport * Number(primary.includes(n % 10))
    + POOL_REDUCTION_RULES.companionSupport * Number(digits.includes(n % 10)));
  return { selection: { pivots: selection.pivots, method: selection.method, sourceDate: selection.sourceDate },
    primaryDigits: primary, companion, companionDigits: digits, synthetic: allEven || allOdd, scores: normalized(raw) };
}

export function forecastReducedPool(draws, options = {}) {
  const history = cleanPivotHistory(draws, options.throughDate || '');
  if (!history.length) throw new Error('At least one valid completed draw is required');
  const sourceDate = history.at(-1).date;
  const language = analyzePatternLanguage(history);
  const pivot = pivotEvidence(history);
  const frequencies = NUMBERS.map(n => history.filter(draw => draw.numbers.includes(n)).length);
  const historyScores = normalized(frequencies.map(count => (count + POOL_REDUCTION_RULES.historyPrior * 5 / 42)
    / (history.length + POOL_REDUCTION_RULES.historyPrior)));
  // Use conditional lift so the language family does not count global frequency twice.
  const languageScores = normalized(language.scores.map((value, i) => value / language.baselineScores[i]));
  if (Object.keys(options.weights || {}).some(key => !Object.hasOwn(POOL_REDUCTION_RULES.weights, key))) throw new Error('Unknown evidence family');
  const weights = { ...POOL_REDUCTION_RULES.weights, ...(options.weights || {}) };
  if (!Object.values(weights).every(n => Number.isFinite(n) && n >= 0) || sum(Object.values(weights)) === 0) throw new Error('Invalid evidence weights');
  const scores = NUMBERS.map((n, i) => 42 * (weights.pivot * pivot.scores[i] + weights.language * languageScores[i]
    + weights.history * historyScores[i]) / sum(Object.values(weights)));
  const selection = selectNestedPools(scores, sourceDate);
  const ranks = NUMBERS.slice().sort((a, b) => scores[b - 1] - scores[a - 1] || tieKey(a, sourceDate) - tieKey(b, sourceDate) || a - b);
  const rawTop20 = sorted(ranks.slice(0, 20));
  return { version: POOL_REDUCTION_RULES.version, sourceDate, historyCount: history.length,
    rules: { ...POOL_REDUCTION_RULES, weights }, ...selection, rawTop20, pivot, language,
    numbers: NUMBERS.map((number, i) => ({ number, rank: ranks.indexOf(number) + 1, score: scores[i],
      pivot: pivot.scores[i], language: languageScores[i], history: historyScores[i],
      primaryPivot: pivot.primaryDigits.includes(number % 10), companionPivot: pivot.companionDigits.includes(number % 10),
      selectedSizes: POOL_REDUCTION_RULES.sizes.filter(k => selection.pools[k].includes(number)),
      constraintEffect: selection.pools[20].includes(number) === rawTop20.includes(number) ? 'none'
        : selection.pools[20].includes(number) ? 'admitted-for-diversity' : 'displaced-for-diversity' })) };
}

export function coverageBaseline(size) {
  function choose(n, k) { if (k < 0 || k > n) return 0; let x = 1; for (let i = 1; i <= k; i++) x = x * (n - i + 1) / i; return x; }
  if (!Number.isInteger(size) || size < 5 || size > 42) throw new Error('Pool size must be 5–42');
  const distribution = Array.from({ length: 6 }, (_, hits) => choose(size, hits) * choose(42 - size, 5 - hits) / choose(42, 5));
  return { expectedHits: 5 * size / 42, distribution, threePlus: sum(distribution.slice(3)), fourPlus: sum(distribution.slice(4)), allFive: distribution[5] };
}
