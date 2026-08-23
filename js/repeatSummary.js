import { classifyOnesHeat, drawToOnes } from './onesAnalysis.js';

const DIGIT_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

function digitSet(draw) {
  return new Set(drawToOnes(draw).map(cell => cell.digit));
}

function orderedDigits(values) {
  const selected = new Set(values);
  return DIGIT_ORDER.filter(digit => selected.has(digit));
}

function streakEndingAt(draws, endIndex, digit) {
  let streak = 0;
  for (let index = endIndex; index >= 0; index -= 1) {
    if (!digitSet(draws[index]).has(digit)) break;
    streak += 1;
  }
  return streak;
}

function repeatedDigits(draws, endIndex) {
  if (endIndex < 1) return [];
  const current = digitSet(draws[endIndex]);
  const previous = digitSet(draws[endIndex - 1]);
  return orderedDigits([...current].filter(digit => previous.has(digit)))
    .map(digit => ({ digit, streak: streakEndingAt(draws, endIndex, digit) }));
}

export function buildDigitRepeatSummary(draws = []) {
  const safeDraws = Array.isArray(draws)
    ? [...draws].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
    : [];
  const latestIndex = safeDraws.length - 1;
  const coldDigits = orderedDigits(
    classifyOnesHeat(safeDraws).filter(item => item.tier === 'cold').map(item => item.digit)
  ).map(digit => ({ digit, streak: 0 }));

  return {
    latestRepeats: repeatedDigits(safeDraws, latestIndex),
    previousRepeats: repeatedDigits(safeDraws, latestIndex - 1),
    coldDigits
  };
}
