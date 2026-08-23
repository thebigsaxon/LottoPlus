import { arithmeticRelationships, drawToOnes, movementType } from './onesAnalysis.js';

function cellsForSelection(draw, selections) {
  const cells = drawToOnes(draw);
  return selections.map(selection => cells[selection.column]).filter(Boolean);
}

function compareRow(selected, candidateDraw) {
  const candidateCells = drawToOnes(candidateDraw);
  const reasons = [];
  let exactCount = 0;

  selected.forEach(selection => {
    const same = candidateCells[selection.column];
    if (same?.digit === selection.digit) {
      exactCount += 1;
      reasons.push(`Digit ${selection.digit} repeated in column ${selection.column + 1}`);
      return;
    }

    [-1, 1].forEach(offset => {
      const shifted = candidateCells[selection.column + offset];
      if (shifted?.digit === selection.digit) {
        reasons.push(`Digit ${selection.digit} made a ${offset < 0 ? 'sister-left' : 'sister-right'} shift`);
      }
    });
  });

  return { reasons, exactCount };
}

function arithmeticSignature(cells) {
  const signatures = new Set();
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      arithmeticRelationships(cells[i].digit, cells[j].digit).forEach(rel => {
        signatures.add(`${rel.operation}:${rel.result}`);
      });
    }
  }
  return signatures;
}

function arithmeticReasons(selectedCells, candidateCells) {
  const selectedSignature = arithmeticSignature(selectedCells);
  const candidateSignature = arithmeticSignature(candidateCells);
  const reasons = [];

  selectedSignature.forEach(signature => {
    if (!candidateSignature.has(signature)) return;
    const [operation, result] = signature.split(':');
    reasons.push(`Shared ${operation} relationship ending in ${result}`);
  });
  return reasons;
}

function transitionArithmeticReasons(currentPast, currentPresent, historicalPast, historicalPresent) {
  const signaturesForTransition = (pastCells, presentCells) => {
    const signatures = new Set();
    pastCells.forEach(pastCell => {
      presentCells.forEach(presentCell => {
        arithmeticRelationships(pastCell.digit, presentCell.digit).forEach(rel => {
          signatures.add(`${rel.operation}:${rel.result}`);
        });
      });
    });
    return signatures;
  };
  const current = signaturesForTransition(currentPast, currentPresent);
  const historical = signaturesForTransition(historicalPast, historicalPresent);
  const reasons = [];
  current.forEach(signature => {
    if (!historical.has(signature)) return;
    const [operation, result] = signature.split(':');
    reasons.push(`Past-to-present ${operation} relationship ending in ${result}`);
  });
  return reasons;
}

export function arithmeticCandidates(selections) {
  const unique = new Map();
  for (let i = 0; i < selections.length; i += 1) {
    for (let j = i + 1; j < selections.length; j += 1) {
      arithmeticRelationships(selections[i].digit, selections[j].digit).forEach(rel => {
        const key = `${selections[i].digit}${rel.symbol}${selections[j].digit}:${rel.result}`;
        unique.set(key, {
          ...rel,
          left: selections[i].digit,
          right: selections[j].digit,
          explanation: `${selections[i].digit} ${rel.symbol} ${selections[j].digit} → ${rel.result}`
        });
      });
    }
  }
  return [...unique.values()];
}

export function findHistoricalMotifs(draws, selections) {
  if (!Array.isArray(draws) || draws.length < 5) return [];
  const pastSelections = selections.filter(item => item.role === 'past').sort((a, b) => a.column - b.column);
  const presentSelections = selections.filter(item => item.role === 'present').sort((a, b) => a.column - b.column);
  if (!pastSelections.length || !presentSelections.length) return [];

  const currentPast = draws[draws.length - 2];
  const currentPresent = draws[draws.length - 1];
  const currentPastCells = cellsForSelection(currentPast, pastSelections);
  const currentPresentCells = cellsForSelection(currentPresent, presentSelections);
  const matches = [];

  // The historical triple must end before the two current context rows.
  for (let index = 0; index <= draws.length - 5; index += 1) {
    const historicalPast = draws[index];
    const historicalPresent = draws[index + 1];
    const historicalFuture = draws[index + 2];
    const pastComparison = compareRow(pastSelections, historicalPast);
    const presentComparison = compareRow(presentSelections, historicalPresent);
    const exactReasons = [...pastComparison.reasons, ...presentComparison.reasons];
    const historicalPastCells = cellsForSelection(historicalPast, pastSelections);
    const historicalPresentCells = cellsForSelection(historicalPresent, presentSelections);
    const mathReasons = [
      ...arithmeticReasons(currentPastCells, historicalPastCells),
      ...arithmeticReasons(currentPresentCells, historicalPresentCells),
      ...transitionArithmeticReasons(currentPastCells, currentPresentCells, historicalPastCells, historicalPresentCells)
    ];
    const reasons = [...new Set([...exactReasons, ...mathReasons])];
    if (!reasons.length) continue;

    matches.push({
      id: `motif-${historicalPast.id}-${historicalPresent.id}`,
      kind: pastComparison.exactCount + presentComparison.exactCount === pastSelections.length + presentSelections.length
        ? 'exact'
        : 'similar',
      historicalPast,
      historicalPresent,
      historicalFuture,
      pastDigits: drawToOnes(historicalPast).map(cell => cell.digit),
      presentDigits: drawToOnes(historicalPresent).map(cell => cell.digit),
      futureDigits: drawToOnes(historicalFuture).map(cell => cell.digit),
      reasons
    });
  }

  return matches.sort((a, b) => (a.kind === b.kind ? 0 : (a.kind === 'exact' ? -1 : 1)));
}

export function findBoardSimilarSequences(draws, futureDigitMap, limit = 12) {
  if (!Array.isArray(draws) || draws.length < 2 || !Array.isArray(futureDigitMap)) return [];
  const mappedByColumn = new Map();
  futureDigitMap.forEach(item => {
    const column = Number(item?.column);
    const digit = Number(item?.digit);
    if (!Number.isInteger(column) || column < 0 || column > 4 || !Number.isInteger(digit) || digit < 0 || digit > 9) return;
    if (!mappedByColumn.has(column)) mappedByColumn.set(column, new Set());
    mappedByColumn.get(column).add(digit);
  });
  if (!mappedByColumn.size) return [];

  const chronological = [...draws].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const matches = [];
  for (let index = 0; index < chronological.length - 1; index += 1) {
    const historicalMatch = chronological[index];
    const historicalFuture = chronological[index + 1];
    const cells = drawToOnes(historicalMatch);
    const reasons = [];
    let exactCount = 0;
    let sisterCount = 0;

    mappedByColumn.forEach((allowedDigits, column) => {
      const exact = cells[column];
      if (exact && allowedDigits.has(exact.digit)) {
        exactCount += 1;
        reasons.push(`Ball ${column + 1} ended in mapped digit ${exact.digit}`);
        return;
      }
      const sister = [column - 1, column + 1]
        .filter(candidateColumn => candidateColumn >= 0 && candidateColumn < 5)
        .map(candidateColumn => cells[candidateColumn])
        .find(cell => cell && allowedDigits.has(cell.digit));
      if (sister) {
        sisterCount += 1;
        reasons.push(`Mapped Ball ${column + 1} digit ${sister.digit} appeared one position away`);
      }
    });

    const matchedColumns = exactCount + sisterCount;
    if (!matchedColumns) continue;
    const coverage = matchedColumns / mappedByColumn.size;
    if (coverage < 0.4) continue;
    matches.push({
      id: `board-sequence-${historicalMatch.id}-${historicalFuture.id}`,
      kind: exactCount === mappedByColumn.size ? 'exact' : 'similar',
      historicalMatch,
      historicalFuture,
      exactCount,
      sisterCount,
      mappedColumnCount: mappedByColumn.size,
      coverage,
      reasons
    });
  }

  return matches.sort((a, b) => b.coverage - a.coverage
    || b.exactCount - a.exactCount
    || b.historicalMatch.date.localeCompare(a.historicalMatch.date))
    .slice(0, Math.max(1, Number(limit) || 12));
}

export function describeMovement(fromCell, toCell) {
  if (fromCell.digit !== toCell.digit) return null;
  return movementType(fromCell.column, toCell.column);
}
