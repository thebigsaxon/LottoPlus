import { onesDigit } from './onesAnalysis.js';
import { tensDigitForNumber } from './fuzzyTens.js';

/**
 * Rank the ones digits that historically followed the latest digit in each
 * Cash 5 ball position. Results are derived exclusively from the newest 50
 * valid chronological draws, leaving the latest draw out as a predecessor
 * because its successor is not known yet.
 */
export function rankHistoricalSuccessors(draws = []) {
  const chronological = (Array.isArray(draws) ? draws : [])
    .filter(draw => (
      typeof draw?.date === 'string'
      && draw.date.length > 0
      && Array.isArray(draw.numbers)
      && draw.numbers.length === 5
      && draw.numbers.every(number => Number.isInteger(Number(number)) && Number(number) >= 1 && Number(number) <= 42)
    ))
    .map(draw => ({ ...draw, numbers: draw.numbers.map(Number) }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-50);

  const presentDraw = chronological.at(-1);
  if (!presentDraw) return [];

  return Array.from({ length: 5 }, (_, column) => {
    const presentNumber = presentDraw.numbers[column];
    const presentDigit = onesDigit(presentNumber);
    const counts = new Map();
    let totalTransitions = 0;

    for (let index = 0; index < chronological.length - 1; index += 1) {
      if (onesDigit(chronological[index].numbers[column]) !== presentDigit) continue;
      const successor = chronological[index + 1];
      const digit = onesDigit(successor.numbers[column]);
      const current = counts.get(digit) || { digit, count: 0, mostRecentTransitionDate: '' };
      current.count += 1;
      current.mostRecentTransitionDate = successor.date;
      counts.set(digit, current);
      totalTransitions += 1;
    }

    const candidates = [...counts.values()]
      .sort((a, b) => (
        b.count - a.count
        || b.mostRecentTransitionDate.localeCompare(a.mostRecentTransitionDate)
        || a.digit - b.digit
      ))
      .slice(0, 4)
      .map(({ digit, count, mostRecentTransitionDate }, index) => ({
        digit,
        rank: index + 1,
        count,
        mostRecentTransitionDate
      }));

    return {
      column,
      presentNumber,
      presentDigit,
      totalTransitions,
      candidates
    };
  });
}

export function normalizeFutureDigitMap(values = [], activeCell = null) {
  const byColumn = new Map();
  (values || []).forEach(item => {
    const column = Number(item?.column);
    const digit = Number(item?.digit);
    if (!Number.isInteger(column) || column < 0 || column > 4) return;
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) return;
    byColumn.set(column, { column, digit });
  });

  const activeColumn = Number(activeCell?.column);
  const activeDigit = Number(activeCell?.digit);
  if (Number.isInteger(activeColumn) && activeColumn >= 0 && activeColumn <= 4
      && Number.isInteger(activeDigit) && activeDigit >= 0 && activeDigit <= 9
      && (values || []).some(item => Number(item?.column) === activeColumn && Number(item?.digit) === activeDigit)) {
    byColumn.set(activeColumn, { column: activeColumn, digit: activeDigit });
  }

  return [...byColumn.values()].sort((a, b) => a.column - b.column);
}

export function selectFutureDigit(values, column, digit) {
  const normalized = normalizeFutureDigitMap(values);
  const selectedColumn = Number(column);
  const selectedDigit = Number(digit);
  if (!Number.isInteger(selectedColumn) || selectedColumn < 0 || selectedColumn > 4
      || !Number.isInteger(selectedDigit) || selectedDigit < 0 || selectedDigit > 9) return normalized;
  if (normalized.some(item => item.column === selectedColumn && item.digit === selectedDigit)) {
    return normalized.filter(item => item.column !== selectedColumn);
  }
  return normalizeFutureDigitMap([
    ...normalized.filter(item => item.column !== selectedColumn),
    { column: selectedColumn, digit: selectedDigit }
  ]);
}

function previewNumbersFromRow(row) {
  if (!Array.isArray(row?.numbers) || row.numbers.length !== 5) return null;
  const numbers = row.numbers.map(Number);
  return numbers.every(number => Number.isInteger(number) && number >= 1 && number <= 42)
    ? numbers
    : null;
}

function positionNumbers(values = []) {
  return Array.from({ length: 5 }, (_, column) => {
    const number = Number(Array.isArray(values) ? values[column] : null);
    return Number.isInteger(number) && number >= 1 && number <= 42 ? number : null;
  });
}

function previewNumbersFromDigitMap(values = []) {
  const mapped = normalizeFutureDigitMap(values);
  if (!mapped.length) return null;
  const numbers = Array(5).fill(null);
  mapped.forEach(({ column, digit }) => {
    // A zero ending needs a legal Cash 5 number for the history preview.
    numbers[column] = digit === 0 ? 10 : digit;
  });
  return numbers;
}

/**
 * Select the line that should be shown in the Next drawing history row.
 * The full-number composer wins while it is being edited. Ending-digit and
 * system-cell selections have independent preview state, followed by saved
 * user rows when no live selection exists.
 */
export function nextDrawingPreviewNumbers(workspace = {}, baselineDate = '') {
  const active = positionNumbers(workspace.slipNumbers);
  if (active.some(Number.isInteger)) return active;

  const mapped = previewNumbersFromDigitMap(workspace.futureDigitMap);
  if (mapped) return mapped;

  const system = positionNumbers(workspace.systemSlipNumbers);
  if (system.some(Number.isInteger)) return system;

  // Clear Board intentionally hides saved-line fallbacks without deleting
  // those saved rows. A new live pick makes the preview visible again.
  if (workspace.nextDrawingPreviewHidden === true) return Array(5).fill(null);

  const draft = [...(workspace.draftRows || [])].reverse()
    .map(previewNumbersFromRow)
    .find(Boolean);
  if (draft) return draft;

  const pendingSessions = (workspace.sessions || [])
    .filter(session => session?.kind === 'prediction'
      && !session.result
      && (!baselineDate || session.baselineDate === baselineDate));
  const saved = [...pendingSessions].reverse().flatMap(session => (
    [...(session.rows || [])]
      .filter(row => row.source !== 'system' && row.available !== false)
      .reverse()
      .map(previewNumbersFromRow)
      .filter(Boolean)
  ))[0];
  return saved || Array(5).fill(null);
}

/**
 * Place a system recommendation in the Next Draw line without changing the
 * user's independent ending-digit map.
 */
export function applySystemDrawingPick(workspace = {}, { column, number } = {}) {
  const safeColumn = Number(column);
  const safeNumber = Number(number);
  if (!Number.isInteger(safeColumn) || safeColumn < 0 || safeColumn > 4
      || !Number.isInteger(safeNumber) || safeNumber < 1 || safeNumber > 42) return workspace;

  const systemSlipNumbers = positionNumbers(workspace.systemSlipNumbers);
  const systemDigitMap = (Array.isArray(workspace.systemDigitMap) ? workspace.systemDigitMap : [])
    .filter(item => Number(item?.column) !== safeColumn)
    .map(item => ({ column: Number(item.column), digit: Number(item.digit) }))
    .filter(item => Number.isInteger(item.column) && item.column >= 0 && item.column <= 4
      && Number.isInteger(item.digit) && item.digit >= 0 && item.digit <= 9);
  const systemWasSelected = (workspace.systemDigitMap || []).some(item => (
    Number(item?.column) === safeColumn && Number(item?.digit) === safeNumber % 10
  ));
  if (systemWasSelected || systemSlipNumbers[safeColumn] === safeNumber) {
    systemSlipNumbers[safeColumn] = null;
  } else {
    systemSlipNumbers[safeColumn] = safeNumber;
    systemDigitMap.push({ column: safeColumn, digit: safeNumber % 10 });
  }
  return {
    ...workspace,
    systemSlipNumbers,
    systemDigitMap,
    nextDrawingPreviewHidden: false
  };
}

/**
 * Apply a user's ending-digit choice to the independent ending-digit map.
 * The extra full-number line has its own composer state and must not be
 * populated by a digit-only click.
 */
export function applyUserDigitPick(workspace = {}, { column, digit } = {}) {
  const safeColumn = Number(column);
  const safeDigit = Number(digit);
  if (!Number.isInteger(safeColumn) || safeColumn < 0 || safeColumn > 4
      || !Number.isInteger(safeDigit) || safeDigit < 0 || safeDigit > 9) return workspace;

  const futureDigitMap = selectFutureDigit(workspace.futureDigitMap, safeColumn, safeDigit);
  return {
    ...workspace,
    futureDigitMap,
    nextDrawingPreviewHidden: false
  };
}

export function applyNextDrawingPick(workspace = {}, { column, digit, number } = {}) {
  const slip = Array.from({ length: 5 }, (_, index) => {
    const value = Number(Array.isArray(workspace.slipNumbers) ? workspace.slipNumbers[index] : null);
    return Number.isInteger(value) && value >= 1 && value <= 42 ? value : null;
  });
  const tensFilters = Array.from({ length: 5 }, (_, index) => {
    const rawValue = Array.isArray(workspace.slipTensFilters) ? workspace.slipTensFilters[index] : null;
    if (rawValue === null || rawValue === undefined || rawValue === '') return null;
    const value = Number(rawValue);
    return Number.isInteger(value) && value >= 0 && value <= 4 ? value : null;
  });
  const tensSources = Array.from({ length: 5 }, (_, index) => {
    const source = Array.isArray(workspace.slipTensSources) ? workspace.slipTensSources[index] : 'empty';
    return ['automatic', 'manual', 'empty'].includes(source) ? source : 'empty';
  });
  const safeColumn = Number(column);
  const safeNumber = Number(number);
  const hasNumber = Number.isInteger(safeNumber) && safeNumber >= 1 && safeNumber <= 42;
  const requestedDigit = Number(digit);
  const safeDigit = hasNumber
    ? safeNumber % 10
    : (Number.isInteger(requestedDigit) && requestedDigit >= 0 && requestedDigit <= 9 ? requestedDigit : NaN);
  if (!hasNumber) {
    return {
      ...workspace,
      futureDigitMap: selectFutureDigit(workspace.futureDigitMap, safeColumn, safeDigit),
      nextDrawingPreviewHidden: false
    };
  }
  if (!Number.isInteger(safeColumn) || safeColumn < 0 || safeColumn > 4) return workspace;
  const togglingOff = slip[safeColumn] === safeNumber;
  if (togglingOff) {
    slip[safeColumn] = null;
    tensFilters[safeColumn] = null;
    tensSources[safeColumn] = 'empty';
  } else {
    slip[safeColumn] = safeNumber;
    tensFilters[safeColumn] = tensDigitForNumber(safeNumber);
    tensSources[safeColumn] = 'manual';
  }
  const mappedHere = (workspace.futureDigitMap || []).some(item => (
    item.column === safeColumn && item.digit === safeDigit
  ));
  let futureDigitMap = workspace.futureDigitMap || [];
  if (togglingOff && mappedHere) futureDigitMap = selectFutureDigit(futureDigitMap, safeColumn, safeDigit);
  else if (!togglingOff && !mappedHere) futureDigitMap = selectFutureDigit(futureDigitMap, safeColumn, safeDigit);
  return {
    ...workspace,
    slipNumbers: slip,
    slipTensFilters: tensFilters,
    slipTensSources: tensSources,
    rowBuilder: slip.filter(Number.isInteger),
    futureDigitMap,
    nextDrawingPreviewHidden: false
  };
}

export function futureCellEvidence(draws = [], motifMatches = [], column, digit) {
  const safeColumn = Number(column);
  const safeDigit = Number(digit);
  const windowCount = (draws || []).filter(draw => onesDigit(draw?.numbers?.[safeColumn]) === safeDigit).length;
  const motifCount = (motifMatches || []).filter(match => (
    onesDigit(match?.historicalFuture?.numbers?.[safeColumn]) === safeDigit
  )).length;
  const fullNumbers = Array.from({ length: 42 }, (_, index) => index + 1)
    .filter(number => onesDigit(number) === safeDigit)
    .map(number => ({
      number,
      spaceCount: (draws || []).filter(draw => Number(draw?.numbers?.[safeColumn]) === number).length
    }));
  return { column: safeColumn, digit: safeDigit, windowCount, motifCount, fullNumbers };
}

function buildSourceRow(draw, role, selectedIds) {
  if (!draw) return [];
  return (draw.numbers || []).map((number, column) => {
    const cellId = `${draw.id}-b${column}-ones`;
    return {
      role,
      column,
      number: Number(number),
      digit: onesDigit(number),
      cellId,
      selected: selectedIds.has(cellId)
    };
  });
}

function buildColumnSuggestions(motifMatches) {
  return Array.from({ length: 5 }, (_, column) => {
    const counts = new Map();
    (motifMatches || []).forEach(match => {
      const number = Number(match?.historicalFuture?.numbers?.[column]);
      if (!Number.isInteger(number)) return;
      counts.set(number, (counts.get(number) || 0) + 1);
    });

    const suggestions = [...counts.entries()]
      .map(([number, count]) => ({ number, digit: onesDigit(number), count }))
      .sort((a, b) => b.count - a.count || a.number - b.number);
    return { column, suggestions };
  });
}

export function buildFutureWorkspaceModel(draws = [], selections = [], rowBuilder = [], motifMatches = []) {
  const pastDraw = draws.at(-2);
  const presentDraw = draws.at(-1);
  const selectedIds = new Set((selections || []).map(item => item.cellId));
  const sourceNumbers = Array.isArray(rowBuilder) && rowBuilder.length === 5
    ? rowBuilder
    : [...new Set((rowBuilder || []).map(Number).filter(number => Number.isInteger(number) && number >= 1 && number <= 42))].sort((a, b) => a - b);
  const futureNumbers = Array.from({ length: 5 }, (_, column) => {
    const raw = sourceNumbers[column];
    const number = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    return Number.isInteger(number) && number >= 1 && number <= 42 ? number : null;
  });

  return {
    past: buildSourceRow(pastDraw, 'past', selectedIds),
    present: buildSourceRow(presentDraw, 'present', selectedIds),
    future: Array.from({ length: 5 }, (_, column) => {
      const number = futureNumbers[column] ?? null;
      return {
        role: 'future',
        column,
        number,
        digit: number === null ? null : onesDigit(number)
      };
    }),
    columnSuggestions: buildColumnSuggestions(motifMatches)
  };
}
