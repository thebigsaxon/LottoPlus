/** Prospective 0–9 pivot workbench. History overlays stay in pivotPools.js. */

export const PIVOT_OPERATORS = Object.freeze({
  ADD: 'add',
  DIRECT: 'direct',
  BORROWED: 'borrowed'
});

export const PIVOT_CHOOSERS = Object.freeze({
  MANUAL: 'manual',
  HIGH: 'high',
  LOW: 'low',
  TIGHTEST: 'tightest',
  ZERO_ALTERNATE: 'zero-alternate'
});

export const MAX_MANUAL_PIVOTS = 2;
export const NARROW_POOL_WARNING = 3;

export const WORKBENCH_METHOD_VERSION = 2;

export const DEFAULT_WORKBENCH_SETTINGS = Object.freeze({
  methodVersion: WORKBENCH_METHOD_VERSION,
  chooser: PIVOT_CHOOSERS.HIGH,
  selectedPivots: Object.freeze([]),
  operators: Object.freeze({
    add: true,
    direct: true,
    borrowed: false
  }),
  skipSharedPivotDigit: true,
  includePivotDigit: false,
  recencyDraws: 0,
  recencyLimit: 6,
  disabledEquations: Object.freeze([])
});

const ENDING_MASS = Object.freeze([4, 5, 5, 4, 4, 4, 4, 4, 4, 4]);

export function endingMass(digit) {
  const value = Number(digit);
  return Number.isInteger(value) && value >= 0 && value <= 9 ? ENDING_MASS[value] : 0;
}

export function expectedEndingHits(pool = []) {
  const mass = [...new Set(pool)].reduce((sum, digit) => sum + endingMass(digit), 0);
  return (5 * mass) / 42;
}

export function officialEndingRow(draw) {
  if (!draw || draw.preview) return null;
  const numbers = Array.isArray(draw.numbers) ? draw.numbers.map(Number) : [];
  if (numbers.length !== 5 || !numbers.every(number => Number.isInteger(number) && number >= 1 && number <= 42)) {
    return null;
  }
  return numbers.map((number, column) => ({ number, digit: number % 10, column }));
}

export function officialDraws(draws = []) {
  return (Array.isArray(draws) ? draws : [])
    .filter(draw => officialEndingRow(draw))
    .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')));
}

export function uniqueDigits(endings = []) {
  return [...new Set(endings.map(item => item.digit))];
}

export function normalizeWorkbenchSettings(settings = {}) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const operators = source.operators && typeof source.operators === 'object' ? source.operators : {};
  const selected = [...new Set((Array.isArray(source.selectedPivots) ? source.selectedPivots : [])
    .map(Number)
    .filter(digit => Number.isInteger(digit) && digit >= 0 && digit <= 9))]
    .sort((left, right) => left - right)
    .slice(0, MAX_MANUAL_PIVOTS);
  const recencyDraws = 0;
  const recencyLimit = 6;
  const chooser = Object.values(PIVOT_CHOOSERS).includes(source.chooser) ? source.chooser : PIVOT_CHOOSERS.HIGH;
  const disabledEquations = [...new Set((Array.isArray(source.disabledEquations) ? source.disabledEquations : [])
    .map(value => String(value)))];
  const migrated = Number(source.methodVersion) >= WORKBENCH_METHOD_VERSION;
  return {
    methodVersion: WORKBENCH_METHOD_VERSION,
    chooser,
    selectedPivots: selected,
    operators: migrated
      ? {
        add: operators.add !== false,
        direct: operators.direct !== false,
        borrowed: operators.borrowed === true
      }
      : { add: true, direct: true, borrowed: false },
    skipSharedPivotDigit: migrated ? source.skipSharedPivotDigit !== false : true,
    includePivotDigit: migrated ? source.includePivotDigit === true : false,
    recencyDraws,
    recencyLimit,
    disabledEquations
  };
}

export function equationKey(item = {}) {
  if (item.operation === 'pivot') return `pivot:${item.pivotDigit}`;
  return [
    item.pivotDigit,
    item.pivotColumn,
    item.otherDigit,
    item.otherColumn,
    item.operation,
    item.result
  ].join(':');
}

function operatorRelationships(pivot, other, operators) {
  const results = [];
  if (operators.add) {
    const rawSum = pivot.digit + other.digit;
    const sum = rawSum % 10;
    results.push({
      operation: PIVOT_OPERATORS.ADD,
      result: sum,
      explanation: rawSum >= 10
        ? `${pivot.digit} + ${other.digit} = ${rawSum} → ${sum}`
        : `${pivot.digit} + ${other.digit} = ${sum}`
    });
  }
  if (operators.direct) {
    const distance = Math.abs(pivot.digit - other.digit);
    results.push({
      operation: PIVOT_OPERATORS.DIRECT,
      result: distance,
      explanation: `${Math.max(pivot.digit, other.digit)} − ${Math.min(pivot.digit, other.digit)} = ${distance}`
    });
  }
  if (operators.borrowed) {
    const distance = Math.abs(pivot.digit - other.digit);
    const borrowed = (10 - distance) % 10;
    const lower = Math.min(pivot.digit, other.digit);
    const higher = Math.max(pivot.digit, other.digit);
    results.push({
      operation: PIVOT_OPERATORS.BORROWED,
      result: borrowed,
      explanation: distance === 0
        ? `${pivot.digit} − ${other.digit} = 0`
        : `${lower + 10} − ${higher} = ${borrowed}`
    });
  }
  return results.map(relationship => ({
    ...relationship,
    pivotDigit: pivot.digit,
    pivotColumn: pivot.column,
    otherDigit: other.digit,
    otherColumn: other.column
  }));
}

export function listCandidatePivots(numbers = []) {
  const endings = Array.isArray(numbers) && numbers.length && numbers[0]?.digit != null
    ? numbers
    : officialEndingRow({ numbers }) || [];
  if (!endings.length) return [];
  const low = Math.min(...endings.map(item => item.digit));
  const high = Math.max(...endings.map(item => item.digit));
  const counts = Array(10).fill(0);
  endings.forEach(item => { counts[item.digit] += 1; });
  return uniqueDigits(endings).sort((left, right) => left - right).map(digit => ({
    digit,
    count: counts[digit],
    columns: endings.filter(item => item.digit === digit).map(item => item.column),
    isLow: digit === low,
    isHigh: digit === high,
    isTwin: counts[digit] >= 2
  }));
}

export function buildDigitPool(numbers = [], pivotDigits = [], options = {}) {
  const endings = officialEndingRow({ numbers }) || (Array.isArray(numbers) && numbers[0]?.digit != null ? numbers : []);
  const settings = normalizeWorkbenchSettings(options);
  const requested = [...new Set((Array.isArray(pivotDigits) ? pivotDigits : []).map(Number))]
    .filter(digit => Number.isInteger(digit) && digit >= 0 && digit <= 9);
  if (!endings.length || !requested.length) {
    return {
      valid: false,
      pivots: requested,
      digits: [],
      candidates: [],
      equations: [],
      width: 0
    };
  }

  const present = new Set(endings.map(item => item.digit));
  const pivots = requested.filter(digit => present.has(digit));
  const disabled = new Set(settings.disabledEquations);
  const evidenceByDigit = new Map();

  const addEvidence = (item) => {
    if (disabled.has(equationKey(item))) return;
    const digit = item.result;
    const candidate = evidenceByDigit.get(digit) || { digit, evidence: [] };
    candidate.evidence.push(item);
    evidenceByDigit.set(digit, candidate);
  };

  if (settings.includePivotDigit) {
    pivots.forEach(digit => {
      const cell = endings.find(item => item.digit === digit);
      addEvidence({
        operation: 'pivot',
        result: digit,
        pivotDigit: digit,
        pivotColumn: cell?.column ?? 0,
        otherDigit: digit,
        otherColumn: cell?.column ?? 0,
        explanation: `Pivot ${digit} stays in the pool`
      });
    });
  }

  const uniqueOthers = uniqueDigits(endings);
  pivots.forEach(pivotDigit => {
    const pivotCell = endings.find(item => item.digit === pivotDigit);
    if (!pivotCell) return;
    uniqueOthers.forEach(otherDigit => {
      if (settings.skipSharedPivotDigit && otherDigit === pivotDigit) return;
      const otherCell = endings.find(item => item.digit === otherDigit);
      if (!otherCell) return;
      operatorRelationships(pivotCell, otherCell, settings.operators).forEach(addEvidence);
    });
  });

  const candidates = [...evidenceByDigit.values()].sort((left, right) => left.digit - right.digit);
  const digits = candidates.map(item => item.digit);
  return {
    valid: digits.length > 0,
    pivots,
    digits,
    candidates,
    equations: candidates.flatMap(item => item.evidence),
    width: digits.length
  };
}

export function newestUniqueEndings(draws = [], options = {}) {
  const official = Array.isArray(draws) && draws[0]?.digit != null ? null : officialDraws(draws);
  const rows = official
    || (Array.isArray(draws) ? draws.map(draw => officialEndingRow(draw)).filter(Boolean) : []);
  const throughIndex = Number.isInteger(options.throughIndex) ? options.throughIndex : rows.length - 1;
  const rowCount = Math.max(1, Number(options.rowCount) || 1);
  const limit = Math.max(1, Number(options.limit) || 6);
  const seen = [];
  const start = Math.min(throughIndex, rows.length - 1);
  const minimum = Math.max(0, start - rowCount + 1);
  for (let index = start; index >= minimum && seen.length < limit; index -= 1) {
    const row = official ? officialEndingRow(official[index]) : rows[index];
    if (!row) continue;
    row.forEach(cell => {
      if (seen.length >= limit) return;
      if (!seen.includes(cell.digit)) seen.push(cell.digit);
    });
  }
  return seen;
}

export function intersectDigitPools(primary = [], recency = []) {
  if (!Array.isArray(recency) || recency.length === 0) {
    return { digits: [...primary], applied: false, tooNarrow: false };
  }
  const allowed = new Set(recency);
  const digits = primary.filter(digit => allowed.has(digit));
  return {
    digits,
    applied: true,
    tooNarrow: digits.length > 0 && digits.length < NARROW_POOL_WARNING
  };
}

function poolWidth(numbers, pivotDigits, settings) {
  return buildDigitPool(numbers, pivotDigits, { ...settings, disabledEquations: [] }).width;
}

export function choosePivots(numbers = [], chooser = PIVOT_CHOOSERS.MANUAL, options = {}) {
  const endings = officialEndingRow({ numbers });
  const settings = normalizeWorkbenchSettings(options);
  if (!endings) return [];
  const candidates = listCandidatePivots(endings);
  if (!candidates.length) return [];
  const high = Math.max(...candidates.map(item => item.digit));
  const low = Math.min(...candidates.map(item => item.digit));

  if (chooser === PIVOT_CHOOSERS.HIGH) return [high];
  if (chooser === PIVOT_CHOOSERS.LOW) return [low];
  if (chooser === PIVOT_CHOOSERS.TIGHTEST) {
    return [...candidates].sort((left, right) => (
      poolWidth(numbers, [left.digit], settings) - poolWidth(numbers, [right.digit], settings)
      || right.digit - left.digit
    )).slice(0, 1).map(item => item.digit);
  }
  if (chooser === PIVOT_CHOOSERS.ZERO_ALTERNATE) {
    if (!candidates.some(item => item.digit === 0)) return [high];
    const previousNumbers = options.previousNumbers;
    const previousPool = previousNumbers
      ? buildDigitPool(previousNumbers, [Math.max(...(officialEndingRow({ numbers: previousNumbers }) || []).map(item => item.digit))], {
        ...settings,
        disabledEquations: []
      }).digits
      : [];
    const currentUnique = candidates.map(item => item.digit).filter(digit => digit !== 0);
    const child = previousPool.filter(digit => currentUnique.includes(digit)).sort((left, right) => left - right)[0];
    const alternate = child ?? currentUnique.sort((left, right) => left - right)[0];
    return alternate == null ? [0] : [0, alternate];
  }
  return settings.selectedPivots.filter(digit => candidates.some(item => item.digit === digit));
}

export function scorePoolAgainstDigits(pool = [], targetDigits = []) {
  const set = new Set(pool);
  const hits = (Array.isArray(targetDigits) ? targetDigits : []).filter(digit => set.has(digit)).length;
  const uniqueTarget = [...new Set(targetDigits)];
  return {
    width: set.size,
    hits,
    uniqueHits: uniqueTarget.filter(digit => set.has(digit)).length,
    uniqueTarget: uniqueTarget.length,
    expected: expectedEndingHits([...set]),
    fourPlus: hits >= 4
  };
}

export function fullNumbersForPool(pool = []) {
  return [...new Set(pool)].sort((left, right) => left - right).map(digit => ({
    digit,
    numbers: Array.from({ length: 42 }, (_, index) => index + 1).filter(number => number % 10 === digit)
  }));
}

function mechanicalSettings(settings) {
  return { ...normalizeWorkbenchSettings(settings), disabledEquations: [] };
}

export function evaluateWorkbenchHistory(draws = [], recipe = {}) {
  const official = officialDraws(draws);
  const settings = mechanicalSettings(recipe);
  const records = [];
  for (let target = 1; target < official.length; target += 1) {
    const source = official[target - 1];
    const previous = target >= 2 ? official[target - 2] : null;
    const pivots = choosePivots(source.numbers, settings.chooser === PIVOT_CHOOSERS.MANUAL
      ? PIVOT_CHOOSERS.TIGHTEST
      : settings.chooser, {
      ...settings,
      previousNumbers: previous?.numbers
    });
    if (!pivots.length) continue;
    const generated = buildDigitPool(source.numbers, pivots, settings);
    let digits = generated.digits;
    if (settings.recencyDraws > 0) {
      const recency = newestUniqueEndings(official, {
        throughIndex: target - 1,
        rowCount: settings.recencyDraws,
        limit: settings.recencyLimit
      });
      const intersection = intersectDigitPools(digits, recency);
      if (intersection.applied) digits = intersection.digits;
    }
    if (!digits.length) continue;
    const targetDigits = officialEndingRow(official[target]).map(item => item.digit);
    records.push({
      date: official[target].date,
      sourceDate: source.date,
      pivots,
      ...scorePoolAgainstDigits(digits, targetDigits)
    });
  }
  const count = records.length;
  const mean = (key) => (count ? records.reduce((sum, item) => sum + item[key], 0) / count : 0);
  return {
    draws: count,
    meanWidth: mean('width'),
    meanHits: mean('hits'),
    meanExpected: mean('expected'),
    meanLift: mean('hits') - mean('expected'),
    fourPlusRate: count ? records.filter(item => item.fourPlus).length / count : 0,
    threePlusRate: count ? records.filter(item => item.hits >= 3).length / count : 0
  };
}

export function buildPivotWorkbench(draws = [], settings = {}) {
  const official = officialDraws(draws);
  const normalized = normalizeWorkbenchSettings(settings);
  const source = official.at(-1) || null;
  const previous = official.at(-2) || null;
  if (!source) {
    return {
      valid: false,
      settings: normalized,
      source: null,
      candidates: [],
      activePivots: [],
      pool: { valid: false, digits: [], width: 0, equations: [] },
      recency: { digits: [], applied: false, tooNarrow: false },
      combined: { digits: [], width: 0, expected: 0, tooNarrow: false },
      history: evaluateWorkbenchHistory([], normalized),
      fullNumbers: []
    };
  }

  const endings = officialEndingRow(source);
  const candidates = listCandidatePivots(endings).map(item => {
    const pool = buildDigitPool(source.numbers, [item.digit], { ...normalized, disabledEquations: [] });
    return { ...item, poolWidth: pool.width, poolDigits: pool.digits };
  });
  const activePivots = choosePivots(source.numbers, normalized.chooser, {
    ...normalized,
    previousNumbers: previous?.numbers
  });
  const generated = buildDigitPool(source.numbers, activePivots, normalized);
  const recencyDigits = normalized.recencyDraws > 0
    ? newestUniqueEndings(official, {
      throughIndex: official.length - 1,
      rowCount: normalized.recencyDraws,
      limit: normalized.recencyLimit
    })
    : [];
  const intersection = intersectDigitPools(generated.digits, recencyDigits);
  const combinedDigits = intersection.applied ? intersection.digits : generated.digits;
  const tooNarrow = combinedDigits.length > 0 && combinedDigits.length < NARROW_POOL_WARNING;

  return {
    valid: generated.valid || combinedDigits.length > 0,
    settings: normalized,
    source: {
      id: String(source.id || source.date),
      date: source.date,
      numbers: [...source.numbers],
      digits: endings.map(item => item.digit)
    },
    previous: previous
      ? { id: String(previous.id || previous.date), date: previous.date, numbers: [...previous.numbers] }
      : null,
    candidates,
    activePivots,
    pool: generated,
    recency: { digits: recencyDigits, ...intersection },
    combined: {
      digits: combinedDigits,
      width: combinedDigits.length,
      expected: expectedEndingHits(combinedDigits),
      tooNarrow,
      edited: normalized.disabledEquations.length > 0
    },
    history: evaluateWorkbenchHistory(official, normalized),
    fullNumbers: fullNumbersForPool(combinedDigits)
  };
}

export function toggleManualPivot(selectedPivots = [], digit) {
  const value = Number(digit);
  if (!Number.isInteger(value) || value < 0 || value > 9) return [...selectedPivots];
  const present = selectedPivots.includes(value);
  if (present) return selectedPivots.filter(item => item !== value);
  return [...selectedPivots, value].sort((left, right) => left - right).slice(-MAX_MANUAL_PIVOTS);
}
