/** Exact order-statistic probabilities for five distinct numbers drawn from 1..42. */

export const CASH5_POOL_SIZE = 42;
export const CASH5_DRAW_SIZE = 5;

function binomialBigInt(n, k) {
  const safeN = Number(n);
  const safeK = Math.min(Number(k), safeN - Number(k));
  if (!Number.isInteger(safeN) || !Number.isInteger(safeK) || safeN < 0 || safeK < 0) return 0n;
  let value = 1n;
  for (let index = 1; index <= safeK; index += 1) {
    value = (value * BigInt(safeN - safeK + index)) / BigInt(index);
  }
  return value;
}

const CASH5_COMBINATIONS = binomialBigInt(CASH5_POOL_SIZE, CASH5_DRAW_SIZE);

export function feasibleOrderStatisticRange(column) {
  const safeColumn = Number(column);
  if (!Number.isInteger(safeColumn) || safeColumn < 0 || safeColumn >= CASH5_DRAW_SIZE) return null;
  return { min: safeColumn + 1, max: CASH5_POOL_SIZE - (CASH5_DRAW_SIZE - safeColumn - 1) };
}

export function orderStatisticProbability(column, number) {
  const safeColumn = Number(column);
  const safeNumber = Number(number);
  const range = feasibleOrderStatisticRange(safeColumn);
  if (!range || !Number.isInteger(safeNumber) || safeNumber < range.min || safeNumber > range.max) return 0;
  const before = binomialBigInt(safeNumber - 1, safeColumn);
  const after = binomialBigInt(CASH5_POOL_SIZE - safeNumber, CASH5_DRAW_SIZE - safeColumn - 1);
  return Number(before * after) / Number(CASH5_COMBINATIONS);
}

export function orderStatisticDistribution(column) {
  return Array.from({ length: CASH5_POOL_SIZE }, (_, index) => orderStatisticProbability(column, index + 1));
}

export function endingDistribution(column) {
  const result = Array(10).fill(0);
  orderStatisticDistribution(column).forEach((probability, index) => {
    result[(index + 1) % 10] += probability;
  });
  return result;
}

export function tensBandForNumber(number) {
  const safeNumber = Number(number);
  if (!Number.isInteger(safeNumber) || safeNumber < 1 || safeNumber > CASH5_POOL_SIZE) return null;
  if (safeNumber <= 9) return 0;
  if (safeNumber <= 19) return 1;
  if (safeNumber <= 29) return 2;
  if (safeNumber <= 39) return 3;
  return 4;
}

export function tensDistribution(column) {
  const result = Array(5).fill(0);
  orderStatisticDistribution(column).forEach((probability, index) => {
    result[tensBandForNumber(index + 1)] += probability;
  });
  return result;
}

export function normalizeDistribution(values = []) {
  const safe = values.map(value => Math.max(0, Number(value) || 0));
  const total = safe.reduce((sum, value) => sum + value, 0);
  if (!total) return safe.map(() => 0);
  return safe.map(value => value / total);
}

/**
 * Shrink categorical observations toward a probability prior.
 * Observations may be raw category indices or a same-length array of counts.
 */
export function shrinkDistribution(prior = [], observations = [], priorStrength = 50) {
  const normalizedPrior = normalizeDistribution(prior);
  if (!normalizedPrior.length) return [];
  const counts = Array(normalizedPrior.length).fill(0);
  if (observations.length === normalizedPrior.length
      && observations.every(value => Number.isFinite(Number(value)) && Number(value) >= 0)) {
    observations.forEach((value, index) => { counts[index] = Number(value); });
  } else {
    observations.forEach(value => {
      const index = Number(value);
      if (Number.isInteger(index) && index >= 0 && index < counts.length) counts[index] += 1;
    });
  }
  const strength = Math.max(0, Number(priorStrength) || 0);
  const observedTotal = counts.reduce((sum, value) => sum + value, 0);
  const denominator = strength + observedTotal;
  if (!denominator) return normalizedPrior;
  return normalizedPrior.map((probability, index) => (
    (strength * probability + counts[index]) / denominator
  ));
}
