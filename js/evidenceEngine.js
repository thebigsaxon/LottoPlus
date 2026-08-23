import { drawToOnes, onesDigit } from './onesAnalysis.js';
import { getGameConfig, numberRange } from './gameConfig.js';

export function validNumbersForDigit(digit, game = 'cash5') {
  const target = Number(digit);
  return numberRange(getGameConfig(game))
    .filter(number => onesDigit(number) === target);
}

export const validCash5NumbersForDigit = validNumbersForDigit;

export function buildNumberEvidence(digit, draws, motifMatches = [], selectedColumns = [], game = 'cash5') {
  const chronological = draws || [];
  const items = validNumbersForDigit(digit, game).map(number => {
    let frequency = 0;
    let mostRecentRowsAgo = null;
    let sameColumnCount = 0;
    let sisterColumnCount = 0;

    chronological.forEach((draw, index) => {
      draw.numbers.forEach((drawnNumber, column) => {
        if (drawnNumber !== number) return;
        frequency += 1;
        mostRecentRowsAgo = chronological.length - 1 - index;
        if (selectedColumns.includes(column)) sameColumnCount += 1;
        if (selectedColumns.some(selected => Math.abs(selected - column) === 1)) sisterColumnCount += 1;
      });
    });

    const motifFutureCount = motifMatches.reduce((count, match) => (
      count + (match.historicalFuture.numbers.includes(number) ? 1 : 0)
    ), 0);

    const recencySignal = mostRecentRowsAgo === null ? 0 : 1 / (mostRecentRowsAgo + 1);
    const patternSignal = motifFutureCount;
    const positionSignal = sameColumnCount + sisterColumnCount * 0.5;
    const frequencySignal = frequency + recencySignal;
    const rawHistoryFit = patternSignal * 3 + positionSignal * 2 + frequencySignal * 1.5;

    return {
      number,
      digit: onesDigit(number),
      motifFutureCount,
      frequency,
      mostRecentRowsAgo,
      sameColumnCount,
      sisterColumnCount,
      patternSignal,
      positionSignal,
      frequencySignal,
      rawHistoryFit
    };
  });

  const maximumFit = Math.max(...items.map(item => item.rawHistoryFit), 0);
  return items.map(item => {
    const historyFit = maximumFit === 0 ? 0 : Math.round((item.rawHistoryFit / maximumFit) * 100);
    return {
      ...item,
      historyFit,
      historyFitTier: historyFit >= 67 ? 'strong' : historyFit >= 34 ? 'mixed' : 'limited'
    };
  }).sort((a, b) => b.rawHistoryFit - a.rawHistoryFit
    || b.motifFutureCount - a.motifFutureCount
    || b.sameColumnCount + b.sisterColumnCount - (a.sameColumnCount + a.sisterColumnCount)
    || b.frequency - a.frequency
    || a.number - b.number);
}

export function futureDigitEvidence(matches) {
  const counts = Array(10).fill(0);
  (matches || []).forEach(match => {
    drawToOnes(match.historicalFuture).forEach(({ digit }) => { counts[digit] += 1; });
  });
  return counts.map((count, digit) => ({ digit, count })).filter(item => item.count > 0);
}
