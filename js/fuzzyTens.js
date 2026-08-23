const TENS_BANDS = [
  { digit: 0, label: '1–9', shortLabel: '1–9' },
  { digit: 1, label: '10s', shortLabel: '10s' },
  { digit: 2, label: '20s', shortLabel: '20s' },
  { digit: 3, label: '30s', shortLabel: '30s' },
  { digit: 4, label: '40–42', shortLabel: '40s' }
];

const clamp = value => Math.max(0, Math.min(1, value));

function low(value) { return clamp((0.42 - value) / 0.32); }

function medium(value) {
  if (value <= 0.08 || value >= 0.78) return 0;
  return value <= 0.38 ? (value - 0.08) / 0.30 : (0.78 - value) / 0.40;
}

function high(value) { return clamp((value - 0.30) / 0.48); }

export function tensDigitForNumber(number) {
  const value = Number(number);
  if (!Number.isInteger(value) || value < 1 || value > 42) return null;
  return Math.floor(value / 10);
}

export function tensBandLabel(digit) {
  return TENS_BANDS.find(item => item.digit === Number(digit))?.label || 'Any tens';
}

function normalizePositionConstraints(values = []) {
  return Array.from({ length: 5 }, (_, column) => {
    const value = Array.isArray(values) ? values[column] : null;
    return Number.isInteger(value) ? value : null;
  });
}

function normalizeFixedNumbers(values = []) {
  return Array.from({ length: 5 }, (_, column) => {
    const value = Array.isArray(values) ? values[column] : null;
    return Number.isInteger(value) && value >= 1 && value <= 42 ? value : null;
  });
}

/** Returns whether at least one strictly increasing Cash 5 row satisfies the position constraints. */
export function hasAvailableOrderedSlip({ mappedDigits = [], tensFilters = [], fixedNumbers = [] } = {}) {
  const endings = normalizePositionConstraints(mappedDigits);
  const bands = normalizePositionConstraints(tensFilters);
  const fixed = normalizeFixedNumbers(fixedNumbers);
  const canComplete = (column, previousNumber) => {
    if (column === 5) return true;
    const remainingPositions = 4 - column;
    const maximum = 42 - remainingPositions;
    const first = fixed[column] ?? previousNumber + 1;
    const last = fixed[column] ?? maximum;
    for (let number = first; number <= last; number += 1) {
      if (number <= previousNumber || number > maximum) continue;
      if (endings[column] !== null && number % 10 !== endings[column]) continue;
      if (bands[column] !== null && tensDigitForNumber(number) !== bands[column]) continue;
      if (canComplete(column + 1, number)) return true;
    }
    return false;
  };
  return canComplete(0, 0);
}

/** Ranks tens bands using fuzzy position, recency, and adjacent-position rules. */
export function recommendTensBands(draws = [], constraints = {}) {
  const history = (draws || []).filter(draw => Array.isArray(draw?.numbers) && draw.numbers.length === 5);
  const drawCount = history.length;
  const recentWeights = history.map((_, index) => index + 1);
  const weightTotal = recentWeights.reduce((sum, value) => sum + value, 0) || 1;
  const mappedDigits = normalizePositionConstraints(constraints.mappedDigits);
  const activeTensFilters = normalizePositionConstraints(constraints.tensFilters);
  const fixedNumbers = normalizeFixedNumbers(constraints.fixedNumbers);

  return Array.from({ length: 5 }, (_, column) => {
    const neighbors = [column - 1, column + 1].filter(index => index >= 0 && index < 5);
    const ranked = TENS_BANDS.map(band => {
      const positionCount = history.filter(draw => tensDigitForNumber(draw.numbers[column]) === band.digit).length;
      const positionRate = drawCount ? positionCount / drawCount : 0;
      const recentRate = history.reduce((sum, draw, index) => (
        sum + (tensDigitForNumber(draw.numbers[column]) === band.digit ? recentWeights[index] : 0)
      ), 0) / weightTotal;
      const neighborCount = history.reduce((sum, draw) => (
        sum + neighbors.filter(index => tensDigitForNumber(draw.numbers[index]) === band.digit).length
      ), 0);
      const neighborRate = drawCount && neighbors.length ? neighborCount / (drawCount * neighbors.length) : 0;

      const strongRule = Math.max(
        Math.min(high(positionRate), Math.max(medium(recentRate), high(recentRate))),
        Math.min(medium(positionRate), high(recentRate)),
        Math.min(high(positionRate), high(neighborRate))
      );
      const moderateRule = Math.max(
        Math.min(medium(positionRate), Math.max(medium(recentRate), high(recentRate))),
        Math.min(high(positionRate), low(recentRate)),
        Math.min(low(positionRate), high(recentRate)),
        Math.min(medium(positionRate), high(neighborRate))
      );
      const lightRule = Math.max(low(positionRate), Math.min(medium(positionRate), low(recentRate)));
      const ruleTotal = strongRule + moderateRule + lightRule || 1;
      const score = Math.round((strongRule * 90 + moderateRule * 62 + lightRule * 30) / ruleTotal);
      const confidence = score >= 72 ? 'Strong fit' : score >= 50 ? 'Moderate fit' : 'Light fit';
      const reason = positionCount === 0
        ? 'not seen in this position'
        : `${positionCount} of ${drawCount} draws here${recentRate > positionRate + 0.08 ? ', stronger recently' : ''}`;
      const proposedTensFilters = [...activeTensFilters];
      proposedTensFilters[column] = band.digit;
      const proposedFixedNumbers = [...fixedNumbers];
      proposedFixedNumbers[column] = null;
      const available = hasAvailableOrderedSlip({
        mappedDigits,
        tensFilters: proposedTensFilters,
        fixedNumbers: proposedFixedNumbers
      });
      return { ...band, score, confidence, reason, positionCount, positionRate, recentRate, neighborRate, available };
    }).sort((a, b) => Number(b.available) - Number(a.available)
      || b.score - a.score || b.recentRate - a.recentRate || b.positionRate - a.positionRate || a.digit - b.digit);
    const availableBands = ranked.filter(band => band.available);
    return { column, ranked, primary: availableBands[0] || ranked[0], alternate: availableBands[1] || null };
  });
}

export { TENS_BANDS };
