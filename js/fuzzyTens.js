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

/** Ranks tens bands using fuzzy position, recency, and adjacent-position rules. */
export function recommendTensBands(draws = []) {
  const history = (draws || []).filter(draw => Array.isArray(draw?.numbers) && draw.numbers.length === 5);
  const drawCount = history.length;
  const recentWeights = history.map((_, index) => index + 1);
  const weightTotal = recentWeights.reduce((sum, value) => sum + value, 0) || 1;

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
      return { ...band, score, confidence, reason, positionCount, positionRate, recentRate, neighborRate };
    }).sort((a, b) => b.score - a.score || b.recentRate - a.recentRate || b.positionRate - a.positionRate || a.digit - b.digit);
    return { column, ranked, primary: ranked[0], alternate: ranked[1] };
  });
}

export { TENS_BANDS };
