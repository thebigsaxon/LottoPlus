import { onesDigit } from './onesAnalysis.js';

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
  return normalizeFutureDigitMap([
    ...normalized.filter(item => item.column !== selectedColumn),
    { column: selectedColumn, digit: selectedDigit }
  ]);
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
