/** Live whole-number themes on recent official Cash 5 rows. Endings are not used. */

export const THEME_WINDOW = 4;
export const THEME_MIN_DRAWS = 3;

function officialDraws(draws = []) {
  return (Array.isArray(draws) ? draws : [])
    .filter(draw => !draw?.preview
      && typeof draw?.date === 'string'
      && Array.isArray(draw.numbers)
      && draw.numbers.length === 5
      && draw.numbers.every(number => Number.isInteger(Number(number)) && Number(number) >= 1 && Number(number) <= 42))
    .map(draw => ({
      id: String(draw.id || draw.date),
      date: draw.date,
      numbers: draw.numbers.map(Number).sort((left, right) => left - right)
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function consecutivePairs(numbers = []) {
  const ordered = [...new Set((numbers || []).map(Number))].sort((left, right) => left - right);
  const pairs = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    if (ordered[index + 1] === ordered[index] + 1) {
      pairs.push([ordered[index], ordered[index + 1]]);
    }
  }
  return pairs;
}

function pairKey(pair) {
  return `${pair[0]}-${pair[1]}`;
}

function slidingConsecutive(window) {
  let streak = 0;
  for (let index = window.length - 1; index >= 0; index -= 1) {
    if (!consecutivePairs(window[index].numbers).length) break;
    streak += 1;
  }
  if (streak < 2) return null;
  const recent = window.slice(-streak);
  const perDraw = recent.map(draw => ({
    date: draw.date,
    pairs: consecutivePairs(draw.numbers)
  }));
  const numbers = [...new Set(perDraw.flatMap(item => item.pairs.flat()))].sort((left, right) => left - right);
  const span = numbers[numbers.length - 1] - numbers[0];
  const sliding = span <= 4;
  return {
    key: 'sliding-consecutive',
    label: sliding
      ? `Consecutive pair sliding ${streak} draws (${perDraw.map(item => item.pairs.map(pair => pairKey(pair)).join(', ')).join(' → ')})`
      : `Consecutive pair on ${streak} straight draws`,
    numbers,
    dates: recent.map(draw => draw.date),
    weight: streak >= 3 && sliding ? 2 : 1
  };
}

function hoppingRepeats(window) {
  if (window.length < THEME_MIN_DRAWS) return null;
  const steps = [];
  for (let index = 1; index < window.length; index += 1) {
    const overlap = window[index].numbers.filter(number => window[index - 1].numbers.includes(number));
    if (overlap.length) {
      steps.push({
        from: window[index - 1].date,
        to: window[index].date,
        numbers: overlap
      });
    }
  }
  if (steps.length < THEME_MIN_DRAWS - 1) return null;
  const numbers = [...new Set(steps.flatMap(item => item.numbers))].sort((left, right) => left - right);
  const hopping = numbers.length >= 2;
  return {
    key: 'hopping-repeats',
    label: hopping
      ? `Exact number coming back, changing identity (${steps.map(item => item.numbers.join('/')).join(' → ')})`
      : `Exact number repeating into the next draw`,
    numbers,
    dates: [...new Set(steps.flatMap(item => [item.from, item.to]))],
    weight: hopping && steps.length >= 3 ? 2 : 1
  };
}

function highBox(window) {
  const recent = window.slice(-THEME_MIN_DRAWS);
  if (recent.length < THEME_MIN_DRAWS) return null;
  const highs = recent.flatMap(draw => draw.numbers.slice(3));
  const min = Math.min(...highs);
  const max = Math.max(...highs);
  if (max - min > 3) return null;
  return {
    key: 'high-box',
    label: `High balls locked in ${min}–${max} for ${recent.length} draws`,
    numbers: [...new Set(highs)].sort((left, right) => left - right),
    dates: recent.map(draw => draw.date),
    weight: 2
  };
}

function lowDescent(window) {
  if (window.length < THEME_MIN_DRAWS) return null;
  const recent = window.slice(-THEME_MIN_DRAWS);
  const columns = [0, 1].filter(column => {
    const values = recent.map(draw => draw.numbers[column]);
    return values.every((value, index) => index === 0 || value <= values[index - 1])
      && values[values.length - 1] < values[0];
  });
  if (!columns.length) return null;
  const numbers = [...new Set(columns.flatMap(column => recent.map(draw => draw.numbers[column])))]
    .sort((left, right) => left - right);
  return {
    key: 'low-descent',
    label: columns.length === 2
      ? `Balls 1 and 2 walking down (${recent.map(draw => `${draw.numbers[0]}/${draw.numbers[1]}`).join(' → ')})`
      : `Ball ${columns[0] + 1} walking down (${recent.map(draw => draw.numbers[columns[0]]).join(' → ')})`,
    numbers,
    dates: recent.map(draw => draw.date),
    weight: 1
  };
}

function persistentNumbers(window) {
  const counts = new Map();
  window.forEach(draw => {
    draw.numbers.forEach(number => counts.set(number, (counts.get(number) || 0) + 1));
  });
  const persistent = [...counts.entries()]
    .filter(([, count]) => count >= THEME_MIN_DRAWS)
    .sort((left, right) => right[1] - left[1] || left[0] - right[0]);
  if (!persistent.length) return null;
  return {
    key: 'persistent',
    label: persistent.map(([number, count]) => `${number} in ${count} of ${window.length} draws`).join(' · '),
    numbers: persistent.map(([number]) => number),
    dates: window.map(draw => draw.date),
    weight: 1
  };
}

function skipRowReturns(window) {
  if (window.length < 4) return null;
  const numbers = [];
  const latest = window.at(-1).numbers;
  const previous = window.at(-2).numbers;
  const older = window.at(-3).numbers;
  latest.forEach(number => {
    if (!previous.includes(number) && older.includes(number)) numbers.push(number);
  });
  if (!numbers.length) return null;
  return {
    key: 'skip-row',
    label: `${numbers.join(', ')} returned after skipping a draw`,
    numbers: numbers.sort((left, right) => left - right),
    dates: window.slice(-3).map(draw => draw.date),
    weight: 1
  };
}

function splitLatest(window) {
  const latest = window.at(-1);
  if (!latest) return null;
  const lows = latest.numbers.filter(number => number <= 12);
  const highs = latest.numbers.filter(number => number >= 36);
  if (lows.length < 2 || highs.length < 2) return null;
  return {
    key: 'split',
    label: `Latest row is split: lows ${lows.join(', ')} and highs ${highs.join(', ')}`,
    numbers: [...lows, ...highs],
    dates: [latest.date],
    weight: 1
  };
}

function uniqueSorted(values) {
  return [...new Set(values)].filter(number => Number.isInteger(number) && number >= 1 && number <= 42)
    .sort((left, right) => left - right);
}

function suggestThemeLine(signals, latest) {
  const picks = [];
  const push = (number) => {
    const value = Number(number);
    if (!Number.isInteger(value) || value < 1 || value > 42 || picks.includes(value)) return;
    picks.push(value);
  };
  const consecutive = signals.find(item => item.key === 'sliding-consecutive');
  const latestPairs = consecutivePairs(latest?.numbers || []);
  const livePair = latestPairs.at(-1)
    || (consecutive?.numbers?.length >= 2
      ? [consecutive.numbers.at(-2), consecutive.numbers.at(-1)]
      : null);
  if (livePair) {
    push(livePair[0]);
    push(livePair[1]);
    push(livePair[1] + 1);
  }
  (signals.find(item => item.key === 'hopping-repeats')?.numbers || []).slice(-2).forEach(push);
  (signals.find(item => item.key === 'persistent')?.numbers || []).forEach(push);
  (signals.find(item => item.key === 'skip-row')?.numbers || []).forEach(push);
  if (latest) {
    push(latest.numbers[0]);
    push(latest.numbers[1]);
  }
  const highs = signals.find(item => item.key === 'high-box')?.numbers || [];
  highs.slice(-2).forEach(push);
  const ordered = uniqueSorted(picks);
  if (ordered.length <= 5) return ordered.length === 5 ? ordered : [];
  const low = ordered.filter(number => number <= 16);
  const high = ordered.filter(number => number >= 30);
  const mixed = uniqueSorted([...low.slice(0, 3), ...high.slice(-3)]);
  if (mixed.length >= 5) return uniqueSorted([...mixed.slice(0, 2), ...mixed.slice(-3)]).slice(0, 5);
  return ordered.slice(0, 2).concat(ordered.slice(-3));
}

export function detectNumberTheme(draws = []) {
  const official = officialDraws(draws);
  const window = official.slice(-THEME_WINDOW);
  if (window.length < THEME_MIN_DRAWS) {
    return {
      active: false,
      intensity: 'silent',
      window,
      drawIds: [],
      signals: [],
      numbersInPlay: [],
      themeLine: [],
      summary: ''
    };
  }

  const signals = [
    slidingConsecutive(window),
    hoppingRepeats(window),
    highBox(window),
    lowDescent(window),
    persistentNumbers(window),
    skipRowReturns(window),
    splitLatest(window)
  ].filter(Boolean);

  const weight = signals.reduce((sum, item) => sum + (item.weight || 1), 0);
  const hasSlider = signals.some(item => item.key === 'sliding-consecutive' && item.weight >= 2);
  const stacked = signals.length >= 3 && weight >= 4;
  const intensity = hasSlider && weight >= 6
    ? 'alert'
    : stacked || hasSlider
      ? 'watch'
      : 'silent';
  const numbersInPlay = uniqueSorted(signals.flatMap(item => item.numbers));
  const themeLine = intensity === 'silent' ? [] : suggestThemeLine(signals, window.at(-1));
  const summary = signals.map(item => item.label).join(' · ');

  return {
    active: intensity !== 'silent',
    intensity,
    window,
    drawIds: window.map(draw => draw.id),
    signals,
    numbersInPlay,
    themeLine,
    summary,
    weight
  };
}

