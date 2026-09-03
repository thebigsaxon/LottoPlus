/** Cash 5 relationship overlay detection. */

import { mathematicalSequenceRelationships } from './onesAnalysis.js';

function completeNumberSequenceRelationships(a, b) {
  const left = Number(a);
  const right = Number(b);
  const relationships = [
    {
      operation: 'add',
      result: left + right,
      explanation: `${left} + ${right} = ${left + right}`
    },
    {
      operation: 'subtract',
      result: Math.abs(left - right),
      explanation: `${Math.max(left, right)} − ${Math.min(left, right)} = ${Math.abs(left - right)}`
    }
  ].filter(relationship => relationship.result >= 1 && relationship.result <= 42);

  return [...new Map(relationships.map(relationship => [relationship.result, relationship])).values()]
    .sort((first, second) => first.result - second.result);
}

export function generateAutomatedPatterns(draws, settings = {}) {
  const {
    showMatches = true,
    showVerticalRuns = false,
    showDiagonalRuns = false,
    showMathematicalSequences = false,
    showDiagonalMathematicalSequences = false,
    showSisterOutputSequences = false,
    showLPatterns = false,
    showInvertedLPatterns = false,
    showKnightShifts = false,
    showSkipRowVerticals = false,
    showTwinEndings = false,
    showConsecutivePairs = false,
    showWinningPatterns = false,
    winningPatternDrawIds = [],
    showCompleteNumbers = false,
    colorMatch = "#187458",
    colorVertical = "#9b4f62",
    colorDiagonal = "#a86225",
    colorMathematical = "#376f9f"
  } = settings;

  const lines = [];
  if (!draws || draws.length < 1) return lines;

  // Prevent duplicates within one scenario while allowing multiple enabled
  // scenarios to explain the same pair independently.
  const createdScenarioPairs = new Set();

  const getPairKey = (idA, idB) => idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
  const getScenarioPairKey = (scenario, idA, idB) => `${scenario}:${getPairKey(idA, idB)}`;

  // Build one stable cell per Ball. Its comparison value changes with the
  // display mode, while digit remains available to ending-specific features.
  const gridRows = draws.map((draw, rowIndex) => {
    const rowCells = [];

    const values = Array.from({ length: 5 }, (_, ballIdx) => draw.numbers?.[ballIdx]);
    values.forEach((num, ballIdx) => {
      const value = Number(num);
      const valid = Number.isInteger(value) && value >= 1 && value <= 42;
      const formatted = valid ? value.toString().padStart(2, '0') : '';
      if (!valid) return;
      const digit = parseInt(formatted[1], 10);
      rowCells.push({
        id: `${draw.id}-b${ballIdx}-ones`, drawId: draw.id, rowIndex, colIndex: ballIdx,
        digit, value: showCompleteNumbers ? value : digit, number: value, ballIdx,
        kind: showCompleteNumbers ? 'number' : 'ones', isBonus: false
      });
    });

    return rowCells;
  });

  // 1. VERTICAL RUNS: Matching active values in one Ball across consecutive rows.
  if (showVerticalRuns) {
    for (let r = 0; r < gridRows.length - 1; r++) {
      gridRows[r].forEach((cellA) => {
          const cellB = gridRows[r + 1].find(c => c.colIndex === cellA.colIndex);
          if (cellB && cellA.value === cellB.value) {
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
                label: `Column Run: ${cellA.value}`,
                patternType: 'vertical',
                isAuto: true
              });
            }
          }
      });
    }
  }

  // 2. SISTER RUNS: The same active value shifts one Ball between consecutive rows.
  if (showDiagonalRuns) {
    for (let r = 0; r < gridRows.length - 1; r++) {
      gridRows[r].forEach(cellA => {
        gridRows[r + 1].forEach(cellB => {
          const colDelta = Math.abs(cellA.colIndex - cellB.colIndex);
          if (cellA.value === cellB.value && colDelta === 1) {
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
                label: `Sister Shift: ${cellA.value}`,
                patternType: 'sister',
                isAuto: true
              });
            }
          }
        });
      });
    }
  }

  // 2b. KNIGHT SHIFTS: The same active value skips exactly one Ball.
  if (showKnightShifts) {
    for (let r = 0; r < gridRows.length - 1; r++) {
      gridRows[r].forEach(cellA => {
        gridRows[r + 1].forEach(cellB => {
          if (cellA.value !== cellB.value || Math.abs(cellA.colIndex - cellB.colIndex) !== 2) return;
          const pairKey = getScenarioPairKey('knight', cellA.id, cellB.id);
          if (createdScenarioPairs.has(pairKey)) return;
          createdScenarioPairs.add(pairKey);
          lines.push({
            id: `auto-knight-${cellA.id}-${cellB.id}`,
            fromCellId: cellA.id,
            toCellId: cellB.id,
            color: colorDiagonal,
            style: 'dashed',
            isArrow: false,
            label: `Knight shift: ${cellA.value}`,
            patternType: 'knight',
            isAuto: true
          });
        });
      });
    }
  }

  // 2c. SKIP-ROW VERTICALS: Same visible column repeats after one intervening draw.
  if (showSkipRowVerticals) {
    for (let r = 0; r < gridRows.length - 2; r++) {
      gridRows[r].forEach(cellA => {
        const middle = gridRows[r + 1].find(cell => cell.colIndex === cellA.colIndex);
        const cellC = gridRows[r + 2].find(cell => cell.colIndex === cellA.colIndex);
        if (!cellC || cellA.value !== cellC.value) return;
        if (middle && middle.value === cellA.value) return;
        const pairKey = getScenarioPairKey('skip-row-vertical', cellA.id, cellC.id);
        if (createdScenarioPairs.has(pairKey)) return;
        createdScenarioPairs.add(pairKey);
        lines.push({
          id: `auto-skip-vertical-${cellA.id}-${cellC.id}`,
          fromCellId: cellA.id,
          toCellId: cellC.id,
          color: colorVertical,
          style: 'dashed',
          isArrow: false,
          label: `Skip-row column run: ${cellA.value}`,
          patternType: 'skip-row-vertical',
          isAuto: true
        });
      });
    }
  }

  // 2d. TWIN ENDINGS: Two or more ones digits in the same draw share a value.
  if (showTwinEndings) {
    gridRows.forEach(rowCells => {
      const onesCells = rowCells;
      for (let digit = 0; digit <= 9; digit += 1) {
        const matches = onesCells.filter(cell => cell.digit === digit)
          .sort((a, b) => a.colIndex - b.colIndex);
        for (let index = 0; index < matches.length - 1; index += 1) {
          const cellA = matches[index];
          const cellB = matches[index + 1];
          const pairKey = getScenarioPairKey('twin-ending', cellA.id, cellB.id);
          if (createdScenarioPairs.has(pairKey)) continue;
          createdScenarioPairs.add(pairKey);
          lines.push({
            id: `auto-twin-${cellA.id}-${cellB.id}`,
            fromCellId: cellA.id,
            toCellId: cellB.id,
            color: colorMatch,
            style: 'solid',
            isArrow: false,
            label: `Twin ending ${digit}: ${String(cellA.number).padStart(2, '0')} and ${String(cellB.number).padStart(2, '0')}`,
            patternType: 'twin-ending',
            isAuto: true
          });
        }
      }
    });
  }

  // 2e. CONSECUTIVE PAIRS: n and n+1 in the same sorted draw.
  if (showConsecutivePairs) {
    gridRows.forEach(rowCells => {
      const onesCells = [...rowCells]
        .sort((a, b) => a.ballIdx - b.ballIdx);
      for (let index = 0; index < onesCells.length - 1; index += 1) {
        const cellA = onesCells[index];
        const cellB = onesCells[index + 1];
        if (cellB.number !== cellA.number + 1) continue;
        const pairKey = getScenarioPairKey('consecutive-pair', cellA.id, cellB.id);
        if (createdScenarioPairs.has(pairKey)) continue;
        createdScenarioPairs.add(pairKey);
        lines.push({
          id: `auto-consecutive-${cellA.id}-${cellB.id}`,
          fromCellId: cellA.id,
          toCellId: cellB.id,
          color: colorDiagonal,
          style: 'solid',
          isArrow: false,
          label: `Consecutive pair: ${cellA.number}–${cellB.number}`,
          patternType: 'consecutive-pair',
          isAuto: true
        });
      }
    });
  }

  // 3. GENERAL MATCHES: Pair matching active values one-to-one with the
  // immediately previous visible row. Nearest-column pairing keeps repeated
  // digits from producing a complete mesh of crossing lines.
  if (showMatches) {
    for (let r = 1; r < gridRows.length; r++) {
      const previousRow = gridRows[r - 1];
      const currentRow = gridRows[r];

      const values = [...new Set([...previousRow, ...currentRow].map(cell => cell.value))]
        .sort((first, second) => first - second);
      values.forEach(value => {
        const previousCells = previousRow.filter(cell => cell.value === value);
        const currentCells = currentRow.filter(cell => cell.value === value);
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
            label: showCompleteNumbers ? `Number ${String(value).padStart(2, '0')}` : `Digit ${value}`,
            patternType: 'match',
            isAuto: true
          });
        });
      });
    }
  }

  // 4. MATHEMATICAL SEQUENCES: In ending mode, preserve modulo/borrow digit
  // arithmetic. In complete-number mode, use literal in-range addition and
  // absolute subtraction. Geometry is shared across the two modes.
  if (showMathematicalSequences || showDiagonalMathematicalSequences || showSisterOutputSequences || showLPatterns || showInvertedLPatterns) {
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

          const relationship = (showCompleteNumbers
            ? completeNumberSequenceRelationships(cellA.value, cellB.value)
            : mathematicalSequenceRelationships(cellA.value, cellB.value))
            .find(item => item.result === cellC.value);
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
            label: `${prefix}: ${cellA.value}, ${cellB.value}, ${cellC.value} (${relationship.explanation})`,
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
            const relationship = (showCompleteNumbers
              ? completeNumberSequenceRelationships(cellA.value, cellB.value)
              : mathematicalSequenceRelationships(cellA.value, cellB.value))
              .find(item => item.result === cellC.value);
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
              label: `L-pattern mathematical sequence (${outputSide} output): ${cellA.value}, ${cellB.value}, ${cellC.value} (${relationship.explanation})`,
              patternType: 'math-l-pattern',
              sequenceDirection: outputSide,
              isAuto: true,
              overlapsSequence: false
            });
          });
        });
      }
    }

    // INVERTED / COLUMN L: Two stacked sources produce a result beside the
    // upper or lower source (the rotation of the existing L).
    if (showInvertedLPatterns) {
      for (let r = 0; r < gridRows.length - 1; r++) {
        gridRows[r].forEach(cellA => {
          const cellB = gridRows[r + 1].find(cell => cell.colIndex === cellA.colIndex);
          if (!cellB) return;

          [
            { row: r + 1, rowLabel: 'lower', sourceRow: gridRows[r + 1] },
            { row: r, rowLabel: 'upper', sourceRow: gridRows[r] }
          ].forEach(({ rowLabel, sourceRow }) => {
            [-1, 1].forEach(outputDelta => {
              const cellC = sourceRow.find(cell => cell.colIndex === cellA.colIndex + outputDelta);
              if (!cellC) return;
              const relationship = (showCompleteNumbers
                ? completeNumberSequenceRelationships(cellA.value, cellB.value)
                : mathematicalSequenceRelationships(cellA.value, cellB.value))
                .find(item => item.result === cellC.value);
              if (!relationship) return;
              const outputSide = outputDelta < 0 ? 'left' : 'right';
              sequences.push({
                id: `auto-math-inverted-l-${rowLabel}-${outputSide}-${cellA.id}-${cellB.id}-${cellC.id}`,
                fromCellId: cellA.id,
                toCellId: cellC.id,
                sequenceCellIds: [cellA.id, cellB.id, cellC.id],
                sequencePathCellIds: [cellA.id, cellB.id, cellC.id],
                color: colorMathematical,
                style: 'solid',
                isArrow: false,
                label: `Inverted L-pattern (${rowLabel} ${outputSide}): ${cellA.value}, ${cellB.value}, ${cellC.value} (${relationship.explanation})`,
                patternType: 'math-inverted-l',
                sequenceDirection: `${rowLabel}-${outputSide}`,
                isAuto: true,
                overlapsSequence: false
              });
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

  if (showWinningPatterns && winningPatternDrawIds.length) {
    const targetDrawIds = new Set(winningPatternDrawIds.map(String));
    const drawIdByCellId = new Map(gridRows.flatMap(row => row.map(cell => [cell.id, String(cell.drawId)])));
    const allEstablishedPatterns = generateAutomatedPatterns(draws, {
      ...settings,
      showMatches: true,
      showVerticalRuns: true,
      showDiagonalRuns: true,
      showMathematicalSequences: true,
      showDiagonalMathematicalSequences: true,
      showSisterOutputSequences: true,
      showLPatterns: true,
      showInvertedLPatterns: true,
      showKnightShifts: true,
      showSkipRowVerticals: true,
      showTwinEndings: true,
      showConsecutivePairs: true,
      showWinningPatterns: false,
      winningPatternDrawIds: []
    });
    const combinedById = new Map(lines.map(line => [line.id, line]));
    allEstablishedPatterns.forEach(line => {
      const outputDrawId = drawIdByCellId.get(line.toCellId);
      if (!targetDrawIds.has(outputDrawId)) return;
      combinedById.set(line.id, { ...line, isWinningPattern: true, winningOutputDrawId: outputDrawId });
    });
    return [...combinedById.values()];
  }

  return lines;
}
