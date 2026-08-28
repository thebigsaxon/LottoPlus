import { drawToOnes } from './onesAnalysis.js';

export const DIGIT_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

function digitSet(draw) {
  return new Set(drawToOnes(draw).map(cell => cell.digit));
}

function orderedDigits(values) {
  const selected = new Set(values);
  return DIGIT_ORDER.filter(digit => selected.has(digit));
}

function chronological(draws) {
  return Array.isArray(draws)
    ? [...draws].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
    : [];
}

/**
 * Classify all ten digits with the rolling three-draw window (N through N-2).
 * Hot means the digit is present in both N and N-1 (a current sequential
 * streak of two or more). Cold means no appearances in the three draws;
 * every other digit is Neutral.
 */
export function classifyDigitHeatAt(draws = [], endIndex = draws.length - 1) {
  const safeEnd = Math.min(Number(endIndex), draws.length - 1);
  const counts = new Map(DIGIT_ORDER.map(digit => [digit, 0]));
  for (let index = safeEnd; index >= Math.max(0, safeEnd - 2); index -= 1) {
    digitSet(draws[index]).forEach(digit => counts.set(digit, (counts.get(digit) || 0) + 1));
  }
  const currentDigits = safeEnd >= 0 ? digitSet(draws[safeEnd]) : new Set();
  const previousDigits = safeEnd >= 1 ? digitSet(draws[safeEnd - 1]) : new Set();
  const items = DIGIT_ORDER.map(digit => {
    const count = counts.get(digit) || 0;
    const isHot = currentDigits.has(digit) && previousDigits.has(digit);
    return { digit, count, tier: count === 0 ? 'cold' : isHot ? 'hot' : 'neutral' };
  });
  return {
    hot: items.filter(item => item.tier === 'hot'),
    neutral: items.filter(item => item.tier === 'neutral'),
    cold: items.filter(item => item.tier === 'cold'),
    items
  };
}

export function buildDigitHeatTimeline(draws = []) {
  const safeDraws = chronological(draws);
  return safeDraws.map((draw, index) => {
    const classification = classifyDigitHeatAt(safeDraws, index);
    const previous = index > 0 ? classifyDigitHeatAt(safeDraws, index - 1) : null;
    const currentDigits = digitSet(draw);
    const previousCold = new Set(previous?.cold.map(item => item.digit) || []);
    const emergingDigits = previous
      ? orderedDigits([...currentDigits].filter(digit => previousCold.has(digit)))
      : [];
    const decliningDigits = previous
      ? orderedDigits(previous.hot.map(item => item.digit).filter(digit => !currentDigits.has(digit)))
      : [];
    const priorDigits = index > 0 ? digitSet(safeDraws[index - 1]) : new Set();
    const repeatingDigits = orderedDigits([...currentDigits].filter(digit => priorDigits.has(digit)));

    const byDigit = new Map(classification.items.map(item => [item.digit, item]));
    return {
      draw,
      ...classification,
      emergingDigits,
      decliningDigits,
      emerging: emergingDigits.map(digit => byDigit.get(digit)),
      declining: decliningDigits.map(digit => byDigit.get(digit)),
      repeatingDigits,
      repeatingCount: repeatingDigits.length
    };
  });
}

export function buildDigitRepeatSummary(draws = []) {
  const timeline = buildDigitHeatTimeline(draws);
  const latest = timeline[timeline.length - 1];
  const empty = classifyDigitHeatAt([], -1);
  return latest || {
    ...empty,
    emergingDigits: [],
    decliningDigits: [],
    emerging: [],
    declining: [],
    repeatingDigits: [],
    repeatingCount: 0
  };
}
