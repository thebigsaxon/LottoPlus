/**
 * Pattern Detection Engine for Digit Matrix Grid
 */

export function generateAutomatedPatterns(draws, settings = {}) {
  const {
    showMatches = true,
    showVerticalRuns = false,
    showDiagonalRuns = false,
    showDeltas = false,
    colorMatch = "#06b6d4",
    colorRun = "#ec4899",
    colorDelta = "#f59e0b"
  } = settings;

  const lines = [];
  if (!draws || draws.length < 2) return lines;

  // Build grid matrix representation: row index -> list of digit cell metadata
  const gridRows = draws.map((draw, rowIndex) => {
    const cells = [];
    let colIndex = 0;

    draw.numbers.forEach((num, ballIdx) => {
      const formatted = num.toString().padStart(2, '0');
      const tensDigit = parseInt(formatted[0], 10);
      const onesDigit = parseInt(formatted[1], 10);

      cells.push({
        id: `${draw.id}-b${ballIdx}-tens`,
        drawId: draw.id,
        rowIndex,
        colIndex: colIndex++,
        digit: tensDigit,
        fullNum: num,
        ballIdx,
        isTens: true
      });

      cells.push({
        id: `${draw.id}-b${ballIdx}-ones`,
        drawId: draw.id,
        rowIndex,
        colIndex: colIndex++,
        digit: onesDigit,
        fullNum: num,
        ballIdx,
        isTens: false
      });
    });

    if (draw.bonus !== null && draw.bonus !== undefined) {
      const formatted = draw.bonus.toString().padStart(2, '0');
      cells.push({
        id: `${draw.id}-bonus-tens`,
        drawId: draw.id,
        rowIndex,
        colIndex: colIndex++,
        digit: parseInt(formatted[0], 10),
        fullNum: draw.bonus,
        isBonus: true
      });
      cells.push({
        id: `${draw.id}-bonus-ones`,
        drawId: draw.id,
        rowIndex,
        colIndex: colIndex++,
        digit: parseInt(formatted[1], 10),
        fullNum: draw.bonus,
        isBonus: true
      });
    }

    return cells;
  });

  // 1. Same-digit matches in adjacent rows (or within 2 rows)
  if (showMatches) {
    for (let r = 0; r < gridRows.length - 1; r++) {
      const rowA = gridRows[r];
      const rowB = gridRows[r + 1];

      rowA.forEach(cellA => {
        rowB.forEach(cellB => {
          // If digits match and columns are close or identical
          if (cellA.digit === cellB.digit && Math.abs(cellA.colIndex - cellB.colIndex) <= 2) {
            lines.push({
              id: `auto-match-${cellA.id}-${cellB.id}`,
              fromCellId: cellA.id,
              toCellId: cellB.id,
              color: colorMatch,
              style: "glow",
              isArrow: false,
              label: `Digit ${cellA.digit}`,
              isAuto: true
            });
          }
        });
      });
    }
  }

  // 2. Vertical runs (identical column, 3+ consecutive rows)
  if (showVerticalRuns) {
    const numCols = gridRows[0] ? gridRows[0].length : 0;
    for (let c = 0; c < numCols; c++) {
      for (let r = 0; r < gridRows.length - 2; r++) {
        const c1 = gridRows[r][c];
        const c2 = gridRows[r+1][c];
        const c3 = gridRows[r+2][c];

        if (c1 && c2 && c3 && c1.digit === c2.digit && c2.digit === c3.digit) {
          lines.push({
            id: `auto-vrun-${c1.id}-${c3.id}`,
            fromCellId: c1.id,
            toCellId: c3.id,
            color: colorRun,
            style: "solid",
            isArrow: true,
            label: `Vertical Run: ${c1.digit}`,
            isAuto: true
          });
        }
      }
    }
  }

  // 3. Diagonal runs
  if (showDiagonalRuns) {
    for (let r = 0; r < gridRows.length - 1; r++) {
      for (let c = 0; c < gridRows[r].length; c++) {
        const cell = gridRows[r][c];
        if (!cell) continue;

        // Down-right
        if (c + 1 < gridRows[r+1].length) {
          const target = gridRows[r+1][c+1];
          if (target && target.digit === cell.digit) {
            lines.push({
              id: `auto-diag-r-${cell.id}-${target.id}`,
              fromCellId: cell.id,
              toCellId: target.id,
              color: colorRun,
              style: "dashed",
              isArrow: true,
              label: "Diagonal Match",
              isAuto: true
            });
          }
        }
        // Down-left
        if (c - 1 >= 0) {
          const target = gridRows[r+1][c-1];
          if (target && target.digit === cell.digit) {
            lines.push({
              id: `auto-diag-l-${cell.id}-${target.id}`,
              fromCellId: cell.id,
              toCellId: target.id,
              color: colorRun,
              style: "dashed",
              isArrow: true,
              label: "Diagonal Match",
              isAuto: true
            });
          }
        }
      }
    }
  }

  return lines;
}
