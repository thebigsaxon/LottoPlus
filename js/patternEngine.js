/** Cash 5 relationship overlay detection. */

import { mathematicalSequenceRelationships } from './onesAnalysis.js';

export function generateAutomatedPatterns(draws, settings = {}) {
  const {
    showMatches = true,
    showVerticalRuns = false,
    showDiagonalRuns = false,
    showMathematicalSequences = false,
    showDiagonalMathematicalSequences = false,
    showSisterOutputSequences = false,
    showLPatterns = false,
    showTens = true,
    showOnes = true,
    colorMatch = "#187458",
    colorVertical = "#9b4f62",
    colorDiagonal = "#a86225",
    colorMathematical = "#376f9f"
  } = settings;

  const lines = [];
  if (!draws || draws.length < 1) return lines;
  if (!showTens && !showOnes) return lines;

  // Prevent duplicates within one scenario while allowing multiple enabled
  // scenarios to explain the same pair independently.
  const createdScenarioPairs = new Set();

  const getPairKey = (idA, idB) => idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
  const getScenarioPairKey = (scenario, idA, idB) => `${scenario}:${getPairKey(idA, idB)}`;

  // Build rows of visible cells
  const gridRows = draws.map((draw, rowIndex) => {
    const rowCells = [];
    let colIndex = 0;

    draw.numbers.forEach((num, ballIdx) => {
      const formatted = num.toString().padStart(2, '0');

      if (showTens) {
        rowCells.push({ id: `${draw.id}-b${ballIdx}-tens`, drawId: draw.id, rowIndex, colIndex: colIndex++, digit: parseInt(formatted[0], 10), isBonus: false });
      }
      if (showOnes) {
        rowCells.push({ id: `${draw.id}-b${ballIdx}-ones`, drawId: draw.id, rowIndex, colIndex: colIndex++, digit: parseInt(formatted[1], 10), isBonus: false });
      }
    });

    return rowCells;
  });

  // 1. VERTICAL RUNS: Matching digits in the same column of consecutive rows.
  if (showVerticalRuns) {
    for (let r = 0; r < gridRows.length - 1; r++) {
      gridRows[r].forEach((cellA) => {
          const cellB = gridRows[r + 1].find(c => c.colIndex === cellA.colIndex);
          if (cellB && cellA.digit === cellB.digit) {
            const pairKey = getScenarioPairKey('vertical', cellA.id, cellB.id);
            if (!createdScenarioPairs.has(pairKey)) {
              createdScenarioPairs.add(pairKey);
              lines.push({
                id: `auto-vrun-${cellA.id}-${cellB.id}`,
                fromCellId: cellA.id,
                toCellId: cellB.id,
                color: colorVertical,
                style: "solid",
                isArrow: false,
                label: `Column Run: ${cellA.digit}`,
                patternType: 'vertical',
                isAuto: true
              });
            }
          }
      });
    }
  }

  // 2. SISTER RUNS: The same digit shifts exactly one column between consecutive rows.
  if (showDiagonalRuns) {
    for (let r = 0; r < gridRows.length - 1; r++) {
      gridRows[r].forEach(cellA => {
        gridRows[r + 1].forEach(cellB => {
          const colDelta = Math.abs(cellA.colIndex - cellB.colIndex);
          if (cellA.digit === cellB.digit && colDelta === 1) {
            const pairKey = getScenarioPairKey('sister', cellA.id, cellB.id);
            if (!createdScenarioPairs.has(pairKey)) {
              createdScenarioPairs.add(pairKey);
              lines.push({
                id: `auto-diag-${cellA.id}-${cellB.id}`,
                fromCellId: cellA.id,
                toCellId: cellB.id,
                color: colorDiagonal,
                style: "dashed",
                isArrow: false,
                label: `Sister Shift: ${cellA.digit}`,
                patternType: 'sister',
                isAuto: true
              });
            }
          }
        });
      });
    }
  }

  // 3. GENERAL MATCHING DIGITS: Pair matching digits one-to-one with the
  // immediately previous visible row. Nearest-column pairing keeps repeated
  // digits from producing a complete mesh of crossing lines.
  if (showMatches) {
    for (let r = 1; r < gridRows.length; r++) {
      const previousRow = gridRows[r - 1];
      const currentRow = gridRows[r];

      for (let digit = 0; digit <= 9; digit++) {
        const previousCells = previousRow.filter(cell => cell.digit === digit);
        const currentCells = currentRow.filter(cell => cell.digit === digit);
        const candidates = [];

        previousCells.forEach(previousCell => {
          currentCells.forEach(currentCell => {
            candidates.push({
              previousCell,
              currentCell,
              distance: Math.abs(previousCell.colIndex - currentCell.colIndex)
            });
          });
        });

        candidates.sort((a, b) => a.distance - b.distance
          || a.previousCell.colIndex - b.previousCell.colIndex
          || a.currentCell.colIndex - b.currentCell.colIndex);

        const usedPrevious = new Set();
        const usedCurrent = new Set();

        candidates.forEach(({ previousCell, currentCell }) => {
          if (usedPrevious.has(previousCell.id) || usedCurrent.has(currentCell.id)) return;

          const pairKey = getScenarioPairKey('match', previousCell.id, currentCell.id);
          usedPrevious.add(previousCell.id);
          usedCurrent.add(currentCell.id);

          if (createdScenarioPairs.has(pairKey)) return;

          createdScenarioPairs.add(pairKey);
          lines.push({
            id: `auto-match-${previousCell.id}-${currentCell.id}`,
            fromCellId: previousCell.id,
            toCellId: currentCell.id,
            color: colorMatch,
            style: "glow",
            isArrow: false,
            label: `Digit ${digit}`,
            patternType: 'match',
            isAuto: true
          });
        });
      }
    }
  }

  // 4. MATHEMATICAL SEQUENCES: Three consecutive digits where the third is
  // produced by the first two using addition, subtraction, or subtraction
  // after adding 10 to either digit. Sequences can run straight down one
  // visible column, diagonally, into a sister column, or around an L shape.
  if (showMathematicalSequences || showDiagonalMathematicalSequences || showSisterOutputSequences || showLPatterns) {
    const sequences = [];
    const orientations = [];
    if (showMathematicalSequences) {
      orientations.push({ middleDelta: 0, outputDelta: 0, direction: null, patternType: 'math-sequence' });
    }
    if (showDiagonalMathematicalSequences) {
      orientations.push(
        { middleDelta: -1, outputDelta: -2, direction: 'left', patternType: 'math-diagonal-sequence' },
        { middleDelta: 1, outputDelta: 2, direction: 'right', patternType: 'math-diagonal-sequence' }
      );
    }
    if (showSisterOutputSequences) {
      orientations.push(
        { middleDelta: 0, outputDelta: -1, direction: 'left', patternType: 'math-sister-output' },
        { middleDelta: 0, outputDelta: 1, direction: 'right', patternType: 'math-sister-output' }
      );
    }

    for (let r = 0; r < gridRows.length - 2; r++) {
      gridRows[r].forEach(cellA => {
        orientations.forEach(({ middleDelta, outputDelta, direction, patternType }) => {
          const cellB = gridRows[r + 1].find(cell => cell.colIndex === cellA.colIndex + middleDelta);
          const cellC = gridRows[r + 2].find(cell => cell.colIndex === cellA.colIndex + outputDelta);
          if (!cellB || !cellC) return;

          const relationship = mathematicalSequenceRelationships(cellA.digit, cellB.digit)
            .find(item => item.result === cellC.digit);
          if (!relationship) return;

          const isSisterOutput = patternType === 'math-sister-output';
          const prefix = isSisterOutput
            ? `Sister-output mathematical sequence (${direction})`
            : (direction ? `Diagonal mathematical sequence (${direction})` : 'Mathematical sequence');
          const idPrefix = isSisterOutput
            ? `auto-math-sister-output-${direction}`
            : (direction ? `auto-math-diag-${direction}` : 'auto-math');
          sequences.push({
            id: `${idPrefix}-${cellA.id}-${cellB.id}-${cellC.id}`,
            fromCellId: cellA.id,
            toCellId: cellC.id,
            sequenceCellIds: [cellA.id, cellB.id, cellC.id],
            sequencePathCellIds: patternType === 'math-sequence' ? null : [cellA.id, cellB.id, cellC.id],
            color: colorMathematical,
            style: "solid",
            opacity: isSisterOutput ? 0.6 : undefined,
            renderThroughCells: isSisterOutput,
            hideNodeRings: isSisterOutput,
            isArrow: false,
            label: `${prefix}: ${cellA.digit}, ${cellB.digit}, ${cellC.digit} (${relationship.explanation})`,
            patternType,
            sequenceDirection: direction || 'vertical',
            isAuto: true,
            overlapsSequence: false
          });
        });
      });
    }

    // L PATTERNS: Two adjacent sources in one draw produce a result directly
    // below either source in the following draw.
    if (showLPatterns) {
      for (let r = 0; r < gridRows.length - 1; r++) {
        gridRows[r].forEach(cellA => {
          const cellB = gridRows[r].find(cell => cell.colIndex === cellA.colIndex + 1);
          if (!cellB) return;

          [
            { outputColumn: cellA.colIndex, outputSide: 'left' },
            { outputColumn: cellB.colIndex, outputSide: 'right' }
          ].forEach(({ outputColumn, outputSide }) => {
            const cellC = gridRows[r + 1].find(cell => cell.colIndex === outputColumn);
            if (!cellC) return;
            const relationship = mathematicalSequenceRelationships(cellA.digit, cellB.digit)
              .find(item => item.result === cellC.digit);
            if (!relationship) return;

            sequences.push({
              id: `auto-math-l-${outputSide}-${cellA.id}-${cellB.id}-${cellC.id}`,
              fromCellId: outputSide === 'left' ? cellB.id : cellA.id,
              toCellId: cellC.id,
              sequenceCellIds: [cellA.id, cellB.id, cellC.id],
              sequencePathCellIds: outputSide === 'left'
                ? [cellB.id, cellA.id, cellC.id]
                : [cellA.id, cellB.id, cellC.id],
              color: colorMathematical,
              style: 'solid',
              isArrow: false,
              label: `L-pattern mathematical sequence (${outputSide} output): ${cellA.digit}, ${cellB.digit}, ${cellC.digit} (${relationship.explanation})`,
              patternType: 'math-l-pattern',
              sequenceDirection: outputSide,
              isAuto: true,
              overlapsSequence: false
            });
          });
        });
      }
    }

    for (let i = 0; i < sequences.length; i += 1) {
      for (let j = i + 1; j < sequences.length; j += 1) {
        const firstCells = new Set(sequences[i].sequenceCellIds);
        if (!sequences[j].sequenceCellIds.some(cellId => firstCells.has(cellId))) continue;
        sequences[i].overlapsSequence = true;
        sequences[j].overlapsSequence = true;
      }
    }
    sequences.forEach(sequence => {
      sequence.style = sequence.patternType === 'math-sister-output'
        ? 'solid'
        : (sequence.overlapsSequence ? 'dashed' : 'solid');
      lines.push(sequence);
    });
  }

  return lines;
}
