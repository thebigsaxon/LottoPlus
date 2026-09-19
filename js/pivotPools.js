/** Pure, row-local ending arithmetic for Pivot Pool references. */

export const PIVOT_POOL_MODES = Object.freeze({
  LOW: 'low',
  HIGH: 'high',
  BOTH: 'both',
  END_TO_END: 'end-to-end',
  NEIGHBORS: 'neighbors'
});

export function normalizePivotPoolMode(mode) {
  if (Object.values(PIVOT_POOL_MODES).includes(mode)) return mode;
  return PIVOT_POOL_MODES.BOTH;
}

function endingRow(numbers = []) {
  if (!Array.isArray(numbers) || numbers.length !== 5) return null;
  const normalized = numbers.map(Number);
  if (!normalized.every(number => Number.isInteger(number) && number >= 1 && number <= 42)) return null;
  return normalized.map((number, column) => ({ number, digit: number % 10, column }));
}

export function buildPivotDefinitions(numbers = []) {
  const endings = endingRow(numbers);
  if (!endings) return [];
  const lowDigit = Math.min(...endings.map(item => item.digit));
  const highDigit = Math.max(...endings.map(item => item.digit));
  const low = endings.find(item => item.digit === lowDigit);
  if (lowDigit === highDigit) {
    return [{ kind: 'low', label: 'Pivot', digit: lowDigit, column: low.column }];
  }
  const high = endings.find(item => item.digit === highDigit);
  return [
    { kind: 'low', label: 'Low', digit: lowDigit, column: low.column },
    { kind: 'high', label: 'High', digit: highDigit, column: high.column }
  ];
}

function pivotRelationships(pivot, other) {
  const rawSum = pivot.digit + other.digit;
  const sum = rawSum % 10;
  const distance = Math.abs(pivot.digit - other.digit);
  const borrowed = (10 - distance) % 10;
  const lower = Math.min(pivot.digit, other.digit);
  const higher = Math.max(pivot.digit, other.digit);
  return [
    {
      operation: 'add',
      result: sum,
      explanation: rawSum >= 10
        ? `${pivot.digit} + ${other.digit} = ${rawSum} → ${sum}`
        : `${pivot.digit} + ${other.digit} = ${sum}`
    },
    {
      operation: 'borrowed-difference',
      result: borrowed,
      explanation: distance === 0
        ? `${pivot.digit} − ${other.digit} = 0`
        : `${lower + 10} − ${higher} = ${borrowed}`
    }
  ].map(relationship => ({
    ...relationship,
    pivotKind: pivot.kind,
    pivotLabel: pivot.label,
    pivotDigit: pivot.digit,
    pivotColumn: pivot.column,
    otherDigit: other.digit,
    otherColumn: other.column
  }));
}

function uniqueEndingCells(endings, direction = 1) {
  const cells = direction === 1 ? endings : [...endings].reverse();
  const seen = new Set();
  return cells.filter(cell => {
    if (seen.has(cell.digit)) return false;
    seen.add(cell.digit);
    return true;
  });
}

function pairKey(first, second) {
  return [first.column, second.column].sort((left, right) => left - right).join(':');
}

function collectPairRelationships(pairs) {
  const candidates = new Map();
  const seenPairs = new Set();
  pairs.forEach(([pivot, other]) => {
    const key = pairKey(pivot, other);
    if (seenPairs.has(key)) return;
    seenPairs.add(key);
    pivotRelationships(pivot, other).forEach(relationship => {
      const candidate = candidates.get(relationship.result) || {
        digit: relationship.result,
        evidence: []
      };
      candidate.evidence.push(relationship);
      candidates.set(relationship.result, candidate);
    });
  });
  return [...candidates.values()].sort((first, second) => first.digit - second.digit);
}

/**
 * Build a row-local pool from the two ends of the unique-ending row.
 * The first unique ending walks forward across the row; the last unique
 * ending walks backward. Each unordered pair is included once.
 */
function buildEndToEndPool(endings) {
  const forward = uniqueEndingCells(endings, 1);
  const backward = uniqueEndingCells(endings, -1);
  const first = forward[0];
  const last = backward[0];
  const pairs = [];
  if (first) forward.slice(1).forEach(other => pairs.push([
    { ...first, kind: 'end-to-end', label: 'End to end' }, other
  ]));
  if (last) backward.slice(1).forEach(other => pairs.push([
    { ...last, kind: 'end-to-end', label: 'End to end' }, other
  ]));
  return {
    pivots: [first, last].filter(Boolean).filter((cell, index, all) => all.findIndex(item => item.column === cell.column) === index),
    candidates: collectPairRelationships(pairs)
  };
}

/** Build a pool from every adjacent pair of endings that touch in row order. */
function buildNeighborPool(endings) {
  const pairs = [];
  for (let index = 0; index < endings.length - 1; index += 1) {
    pairs.push([
      { ...endings[index], kind: 'neighbors', label: 'Neighbors' },
      endings[index + 1]
    ]);
  }
  return { pivots: endings, candidates: collectPairRelationships(pairs) };
}

export function buildPivotCandidatePool(numbers = [], pivotDigit) {
  const endings = endingRow(numbers);
  const normalizedDigit = Number(pivotDigit);
  if (!endings || !Number.isInteger(normalizedDigit) || normalizedDigit < 0 || normalizedDigit > 9) {
    return { valid: false, digit: normalizedDigit, sourceColumns: [], digits: [], candidates: [] };
  }

  const pivotCells = endings.filter(item => item.digit === normalizedDigit);
  if (!pivotCells.length) {
    return { valid: false, digit: normalizedDigit, sourceColumns: [], digits: [], candidates: [] };
  }

  const candidates = new Map();
  pivotCells.forEach(pivotCell => {
    const pivot = { ...pivotCell, kind: 'candidate', label: 'Pivot' };
    endings.filter(other => other.column !== pivot.column).forEach(other => {
      pivotRelationships(pivot, other).forEach(relationship => {
        const candidate = candidates.get(relationship.result) || {
          digit: relationship.result,
          evidence: []
        };
        candidate.evidence.push(relationship);
        candidates.set(relationship.result, candidate);
      });
    });
  });

  const ordered = [...candidates.values()].sort((first, second) => first.digit - second.digit);
  return {
    valid: true,
    digit: normalizedDigit,
    sourceColumns: pivotCells.map(cell => cell.column),
    digits: ordered.map(candidate => candidate.digit),
    candidates: ordered
  };
}

export function evaluateWinningPivotPair(sourceDraw, targetDraw) {
  const sourceEndings = endingRow(sourceDraw?.numbers);
  const targetEndings = endingRow(targetDraw?.numbers);
  if (!sourceEndings || !targetEndings || sourceDraw?.preview || targetDraw?.preview) {
    return {
      valid: false,
      sourceDrawId: sourceDraw?.id == null ? '' : String(sourceDraw.id),
      targetDrawId: targetDraw?.id == null ? '' : String(targetDraw.id),
      sourceDate: sourceDraw?.date || '',
      targetDate: targetDraw?.date || '',
      candidates: [],
      winners: [],
      winningHitCount: 0,
      matchedTargetColumns: []
    };
  }

  const uniquePivotDigits = [...new Set(sourceEndings.map(item => item.digit))];
  const evaluated = uniquePivotDigits.map(digit => {
    const pool = buildPivotCandidatePool(sourceDraw.numbers, digit);
    const poolDigits = new Set(pool.digits);
    const matchedTargetColumns = targetEndings
      .filter(item => poolDigits.has(item.digit))
      .map(item => item.column);
    return {
      ...pool,
      hitCount: matchedTargetColumns.length,
      matchedTargetColumns,
      matchedTargetDigits: matchedTargetColumns.map(column => targetEndings[column].digit),
      isWinner: false
    };
  }).sort((first, second) => second.hitCount - first.hitCount || first.digit - second.digit);

  const winningHitCount = evaluated.length ? evaluated[0].hitCount : 0;
  evaluated.forEach(candidate => { candidate.isWinner = candidate.hitCount === winningHitCount; });
  const winners = evaluated.filter(candidate => candidate.isWinner);
  const matchedTargetColumns = [...new Set(winners.flatMap(candidate => candidate.matchedTargetColumns))]
    .sort((first, second) => first - second);

  return {
    valid: true,
    sourceDrawId: String(sourceDraw.id),
    targetDrawId: String(targetDraw.id),
    sourceDate: sourceDraw.date || '',
    targetDate: targetDraw.date || '',
    candidates: evaluated,
    winners,
    winningHitCount,
    matchedTargetColumns
  };
}

export function buildWinningPivotTimeline(draws = []) {
  const officialDraws = (Array.isArray(draws) ? draws : []).filter(draw => !draw?.preview);
  const evaluations = [];
  for (let index = 1; index < officialDraws.length; index += 1) {
    const evaluation = evaluateWinningPivotPair(officialDraws[index - 1], officialDraws[index]);
    if (evaluation.valid) evaluations.push(evaluation);
  }
  return evaluations;
}

export function resolveActiveWinningPivotDrawId(draws = [], activeDrawId = null, enabled = false) {
  if (!enabled) return null;
  const evaluations = buildWinningPivotTimeline(draws);
  if (!evaluations.length) return null;
  const active = evaluations.find(item => item.targetDrawId === String(activeDrawId));
  return active ? active.targetDrawId : evaluations[evaluations.length - 1].targetDrawId;
}

export function buildPivotPool(numbers = [], mode = PIVOT_POOL_MODES.BOTH) {
  const endings = endingRow(numbers);
  const definitions = buildPivotDefinitions(numbers);
  const normalizedMode = normalizePivotPoolMode(mode);
  if (!endings || !definitions.length) {
    return { valid: false, mode: normalizedMode, pivots: [], digits: [], candidates: [] };
  }

  if (normalizedMode === PIVOT_POOL_MODES.END_TO_END || normalizedMode === PIVOT_POOL_MODES.NEIGHBORS) {
    const built = normalizedMode === PIVOT_POOL_MODES.END_TO_END
      ? buildEndToEndPool(endings)
      : buildNeighborPool(endings);
    return {
      valid: true,
      mode: normalizedMode,
      pivots: built.pivots,
      digits: built.candidates.map(candidate => candidate.digit),
      candidates: built.candidates
    };
  }

  const pivots = definitions.length === 1
    ? definitions
    : definitions.filter(pivot => normalizedMode === PIVOT_POOL_MODES.BOTH || pivot.kind === normalizedMode);
  const candidates = new Map();
  pivots.forEach(pivot => {
    endings.filter(other => other.column !== pivot.column).forEach(other => {
      pivotRelationships(pivot, other).forEach(relationship => {
        const candidate = candidates.get(relationship.result) || {
          digit: relationship.result,
          evidence: []
        };
        candidate.evidence.push(relationship);
        candidates.set(relationship.result, candidate);
      });
    });
  });

  const ordered = [...candidates.values()].sort((first, second) => first.digit - second.digit);
  return {
    valid: true,
    mode: definitions.length === 1 ? PIVOT_POOL_MODES.BOTH : normalizedMode,
    pivots,
    digits: ordered.map(candidate => candidate.digit),
    candidates: ordered
  };
}

/**
 * Expand a source-row pivot pool into legal Cash 5 full-number candidates.
 * This is prospective: it uses only the supplied source row and never a
 * target/winning row. Position limits reflect sorted Ball feasibility.
 */
export function expandPivotPoolNumbers(numbers = [], mode = PIVOT_POOL_MODES.BOTH, column = null) {
  const pool = buildPivotPool(numbers, mode);
  const safeColumn = Number(column);
  const hasColumn = column !== null && column !== undefined && column !== ''
    && Number.isInteger(safeColumn) && safeColumn >= 0 && safeColumn < 5;
  const minimum = hasColumn ? safeColumn + 1 : 1;
  const maximum = hasColumn ? 38 + safeColumn : 42;
  if (!pool.valid) return { ...pool, column: hasColumn ? safeColumn : null, numbers: [] };
  const evidenceByDigit = new Map(pool.candidates.map(candidate => [candidate.digit, candidate.evidence]));
  const expanded = Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index)
    .filter(number => pool.digits.includes(number % 10))
    .map(number => ({
      number,
      digit: number % 10,
      column: hasColumn ? safeColumn : null,
      evidence: (evidenceByDigit.get(number % 10) || []).map(item => ({ ...item }))
    }));
  return { ...pool, column: hasColumn ? safeColumn : null, numbers: expanded };
}

export function resolveActivePivotReference(draws = [], activeReference = null, enabled = false) {
  if (!enabled) return null;
  const officialDraws = (Array.isArray(draws) ? draws : [])
    .filter(draw => !draw?.preview && buildPivotDefinitions(draw?.numbers).length);
  if (!officialDraws.length) return null;

  const activeDraw = officialDraws.find(draw => String(draw.id) === String(activeReference?.drawId));
  if (!activeDraw) {
    return { drawId: String(officialDraws[officialDraws.length - 1].id), mode: PIVOT_POOL_MODES.BOTH };
  }
  const definitions = buildPivotDefinitions(activeDraw.numbers);
  return {
    drawId: String(activeDraw.id),
    mode: definitions.length === 1 ? PIVOT_POOL_MODES.BOTH : normalizePivotPoolMode(activeReference?.mode)
  };
}
