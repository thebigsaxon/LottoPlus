/**
 * Digit-by-Digit Grid Matrix Builder & Handler
 */

export class GridMatrix {
  constructor(tableContainerElement) {
    this.container = tableContainerElement;
    this.draws = [];
    this.gameType = "powerball"; // 'powerball', 'megamillions', 'cash5'
    this.highlightedDigit = null;
    this.onCellClickCallback = null;
  }

  setDraws(draws, gameType) {
    this.draws = draws;
    this.gameType = gameType;
    this.render();
  }

  setHighlightedDigit(digit) {
    this.highlightedDigit = digit;
    this.updateHighlights();
  }

  render() {
    if (!this.container) return;

    if (!this.draws || this.draws.length === 0) {
      this.container.innerHTML = `
        <div style="padding: 3rem; text-align: center; color: var(--text-muted);">
          <h3>No draw data available</h3>
          <p style="margin-top: 0.5rem; font-size: 0.9rem;">Import a CSV file or load a sample dataset from the top bar.</p>
        </div>
      `;
      return;
    }

    // Determine number of main balls for header creation
    const firstDraw = this.draws[0];
    const numBalls = firstDraw.numbers ? firstDraw.numbers.length : 5;
    const hasBonus = firstDraw.bonus !== null && firstDraw.bonus !== undefined;

    let headerHTML = `
      <thead>
        <tr>
          <th>Draw Date</th>
    `;

    for (let b = 1; b <= numBalls; b++) {
      headerHTML += `<th colspan="2">Ball ${b}</th>`;
      if (b < numBalls || hasBonus) {
        headerHTML += `<th class="ball-sep"></th>`;
      }
    }

    if (hasBonus) {
      const bonusName = this.gameType === "powerball" ? "Powerball" : (this.gameType === "megamillions" ? "Mega Ball" : "Bonus");
      headerHTML += `<th colspan="2" style="color: ${this.gameType === 'powerball' ? 'var(--powerball-red)' : 'var(--megamillions-gold)'}">${bonusName}</th>`;
    }

    headerHTML += `</tr></thead>`;

    // Table Body
    let bodyHTML = `<tbody>`;

    this.draws.forEach(draw => {
      bodyHTML += `<tr>`;
      bodyHTML += `<td class="date-cell">${draw.date}</td>`;

      draw.numbers.forEach((num, ballIdx) => {
        const formatted = num.toString().padStart(2, '0');
        const tensDigit = formatted[0];
        const onesDigit = formatted[1];

        const tensCellId = `${draw.id}-b${ballIdx}-tens`;
        const onesCellId = `${draw.id}-b${ballIdx}-ones`;

        bodyHTML += `
          <td>
            <div class="square-cell tens" data-cell-id="${tensCellId}" data-digit="${tensDigit}" data-full-num="${num}" data-draw-id="${draw.id}">
              ${tensDigit}
            </div>
          </td>
          <td>
            <div class="square-cell ones" data-cell-id="${onesCellId}" data-digit="${onesDigit}" data-full-num="${num}" data-draw-id="${draw.id}">
              ${onesDigit}
            </div>
          </td>
        `;

        if (ballIdx < numBalls - 1 || hasBonus) {
          bodyHTML += `<td class="ball-sep"></td>`;
        }
      });

      if (hasBonus) {
        const formatted = draw.bonus.toString().padStart(2, '0');
        const tensDigit = formatted[0];
        const onesDigit = formatted[1];

        const tensCellId = `${draw.id}-bonus-tens`;
        const onesCellId = `${draw.id}-bonus-ones`;
        const bonusClass = this.gameType === "megamillions" ? "bonus-gold" : "bonus";

        bodyHTML += `
          <td>
            <div class="square-cell ${bonusClass}" data-cell-id="${tensCellId}" data-digit="${tensDigit}" data-full-num="${draw.bonus}" data-draw-id="${draw.id}">
              ${tensDigit}
            </div>
          </td>
          <td>
            <div class="square-cell ${bonusClass}" data-cell-id="${onesCellId}" data-digit="${onesDigit}" data-full-num="${draw.bonus}" data-draw-id="${draw.id}">
              ${onesDigit}
            </div>
          </td>
        `;
      }

      bodyHTML += `</tr>`;
    });

    bodyHTML += `</tbody>`;

    this.container.innerHTML = `<table class="grid-table" id="matrixTable">${headerHTML}${bodyHTML}</table>`;

    this.attachCellEvents();
    this.updateHighlights();
  }

  attachCellEvents() {
    const cells = this.container.querySelectorAll(".square-cell");
    cells.forEach(cell => {
      cell.addEventListener("click", (e) => {
        const cellId = cell.dataset.cellId;
        const digit = parseInt(cell.dataset.digit, 10);

        if (this.onCellClickCallback) {
          this.onCellClickCallback(cell, cellId, digit);
        }
      });
    });
  }

  updateHighlights() {
    const cells = this.container.querySelectorAll(".square-cell");
    cells.forEach(cell => {
      const digit = parseInt(cell.dataset.digit, 10);
      if (this.highlightedDigit !== null && digit === this.highlightedDigit) {
        cell.classList.add("highlighted");
      } else {
        cell.classList.remove("highlighted");
      }
    });
  }
}
