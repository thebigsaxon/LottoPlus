/** A descriptive draw alphabet and strictly historical next-day transitions. */
import { cleanPivotHistory } from './automaticPivot.js';

export const PATTERN_LANGUAGE_VERSION = 1;
export const PATTERN_PRIOR_STRENGTH = 24;
export const PATTERN_LEXICON = Object.freeze({
  O: 'Count of odd numbers (0–5).',
  L: 'Count of numbers from 1 through 21 (0–5).',
  U: 'Count of distinct decimal endings (1–5).',
  C: 'Count of adjacent sorted pairs differing by 1; a run of three contributes two pairs.',
  R: 'Count repeated from the immediately preceding calendar day; ? means unavailable or a gap.',
  S: 'Spread: c = span at most 14, m = span 15–28, w = span 29–41.',
  B: 'Five occupancy counts for 1–9 / 10–19 / 20–29 / 30–39 / 40–42.',
  word: 'The coarse O/L/U state. A two-word sequence requires two consecutive calendar days.',
  transition: 'An observed source state followed by a completed result exactly one calendar day later.'
});

const adjacent = (a, b) => Boolean(a && b
  && Date.parse(`${b.date}T00:00:00Z`) - Date.parse(`${a.date}T00:00:00Z`) === 86400000);
const numberVector = () => Array(42).fill(0);
const averageVectors = vectors => Array.from({ length: 42 }, (_, i) =>
  vectors.reduce((sum, vector) => sum + vector[i], 0) / vectors.length);

/** Invalid draws return null. Sorting and cleaning never mutate the caller's rows. */
export function encodeDraw(draw, previousDraw = null) {
  const current = cleanPivotHistory([draw])[0];
  if (!current) return null;
  const previous = cleanPivotHistory([previousDraw])[0];
  const numbers = current.numbers;
  const occupancy = Array(5).fill(0);
  for (const number of numbers) occupancy[number < 10 ? 0 : Math.floor(number / 10)] += 1;
  const span = numbers.at(-1) - numbers[0];
  const features = {
    O: numbers.filter(n => n % 2).length,
    L: numbers.filter(n => n <= 21).length,
    U: new Set(numbers.map(n => n % 10)).size,
    C: numbers.slice(1).filter((n, i) => n === numbers[i] + 1).length,
    R: adjacent(previous, current) ? numbers.filter(n => previous.numbers.includes(n)).length : null,
    S: span <= 14 ? 'c' : span <= 28 ? 'm' : 'w',
    B: occupancy.join('')
  };
  const word = `O${features.O} L${features.L} U${features.U}`;
  return { date: current.date, numbers: [...numbers], features, word,
    code: `${word} C${features.C} R${features.R ?? '?'} S${features.S} B${features.B}` };
}

function newStats() {
  return { support: 0, counts: numberVector(), successors: new Map(), matches: [] };
}

function observe(stats, source, target) {
  stats.support += 1;
  for (const number of target.numbers) stats.counts[number - 1] += 1;
  stats.successors.set(target.code, (stats.successors.get(target.code) || 0) + 1);
  stats.matches.push({ sourceDate: source.date, targetDate: target.date });
}

function stateKeys(source, previous) {
  return [
    { family: 'exact', key: source.code },
    { family: 'word', key: source.word },
    { family: 'sequence', key: adjacent(previous, source) ? `${previous.word} → ${source.word}` : null },
    ...['O', 'L', 'U', 'C', 'S'].map(family => ({ family, key: `${family}${source.features[family]}` }))
  ];
}

/**
 * Forecast from the last supplied valid draw. To replay an earlier forecast,
 * supply its historical prefix or options.throughDate. No target is fetched.
 * Components are descriptive, correlated estimates, not independent evidence.
 */
export function analyzePatternLanguage(draws = [], options = {}) {
  const history = cleanPivotHistory(draws, options.throughDate || '');
  if (!history.length) return null;
  const letters = history.map((draw, i) => encodeDraw(draw, history[i - 1]));
  const global = newStats();
  const learned = new Map();
  let skippedGaps = 0;
  for (let i = 0; i < letters.length - 1; i += 1) {
    const source = letters[i];
    const target = letters[i + 1];
    if (!adjacent(source, target)) { skippedGaps += 1; continue; }
    observe(global, source, target);
    for (const { family, key } of stateKeys(source, letters[i - 1])) {
      if (key === null) continue;
      const lookup = `${family}:${key}`;
      if (!learned.has(lookup)) learned.set(lookup, newStats());
      observe(learned.get(lookup), source, target);
    }
  }
  const prior = PATTERN_PRIOR_STRENGTH;
  // Global history is itself stabilized toward the uniform 5-of-42 baseline.
  const baselineScores = global.counts.map(count => (count + prior * 5 / 42) / (global.support + prior));
  const source = letters.at(-1);
  const previous = adjacent(letters.at(-2), source) ? letters.at(-2) : null;
  const components = stateKeys(source, previous).map(({ family, key }) => {
    const stats = key === null ? newStats() : learned.get(`${family}:${key}`) || newStats();
    const scores = stats.counts.map((count, i) => (count + prior * baselineScores[i]) / (stats.support + prior));
    const successors = [...global.successors].map(([code, globalCount]) => {
      const count = stats.successors.get(code) || 0;
      const baselineProbability = globalCount / global.support;
      return { code, count, empiricalProbability: stats.support ? count / stats.support : null,
        baselineProbability,
        shrunkProbability: (count + prior * baselineProbability) / (stats.support + prior) };
    }).sort((a, b) => b.shrunkProbability - a.shrunkProbability || b.count - a.count || a.code.localeCompare(b.code));
    const top = successors.slice(0, 5);
    return { family, key, support: stats.support, priorStrength: prior,
      historicalWeight: stats.support / (stats.support + prior),
      matches: stats.matches.map(match => ({ ...match })), scores, successors: top,
      omittedSuccessorProbability: successors.slice(5).reduce((sum, item) => sum + item.shrunkProbability, 0),
      smallSample: stats.support < prior };
  });
  // A fixed equal family blend; repeated descriptions of one draw do not add votes.
  const scores = averageVectors([baselineScores, averageVectors(components.map(component => component.scores))]);
  return {
    version: PATTERN_LANGUAGE_VERSION, sourceDate: source.date, source, previous,
    sequence: previous ? `${previous.word} → ${source.word}` : null,
    historyStart: history[0].date, historyDraws: history.length,
    completedPairs: global.support, skippedGaps, priorStrength: prior,
    lexicon: { ...PATTERN_LEXICON }, baselineScores, scores, components,
    recentLetters: letters.slice(-12),
    probabilityMeaning: 'scores[n-1] estimates inclusion of full number n in the next five-number draw; scores sum to 5. Successor probabilities describe observed codes, with unseen codes unmodeled.',
    method: 'Global completed-target frequencies shrink toward uniform 5/42 with strength 24. Each state shrinks toward that global baseline with strength 24. Final scores blend 50% global baseline and 50% equal component mean.',
    caution: 'Experimental historical associations. Sparse states are strongly shrunk; correlated letters and repeated history are not independent evidence. Describing a pattern does not establish predictive advantage, and missing days break sequences.'
  };
}
