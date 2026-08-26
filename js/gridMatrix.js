/** Cash 5 ones-digit matrix renderer. */

import { escapeHTML } from './validation.js';

export class GridMatrix {
  constructor(tableContainerElement) {
    this.container = tableContainerElement;
    this.draws = [];
    this.highlightedDigit = null;
    this.positionHighlights = [];
    this.onCellClickCallback = null;
    this.onWinningRowToggleCallback = null;
    this.options = {
      showTens: false,
      showOnes: true,
      selectedCellIds: [],
      rowRoles: {},
      selectableContextRows: false,
      showWinningRowSelectors: false,
      winningPatternDrawIds: []
    };
  }

  setDraws(draws, _gameType = 'cash5', options = {}) {
    this.draws = draws || [];
    this.options = { ...this.options, ...options };
    this.render();
  }

  setHighlightedDigit(digit) {
    this.highlightedDigit = digit;
    this.updateHighlights();
  }

  setPositionHighlights(selections = []) {
    this.positionHighlights = (selections || [])
      .map(item => ({ column: Number(item.column), digit: Number(item.digit) }))
      .filter(item => Number.isInteger(item.column) && item.column >= 0 && item.column <= 4
        && Number.isInteger(item.digit) && item.digit >= 0 && item.digit <= 9);
    this.updateHighlights();
  }

  render() {
    if (!this.container) return;
    if (!this.draws.length) {
      this.container.innerHTML = '<div class="matrix-empty"><strong>No draw data available</strong><span>Import a Cash 5 CSV or restore sample data from the Data menu.</span></div>';
      return;
    }

    const {
      showTens,
      showOnes,
      selectedCellIds,
      rowRoles,
      selectableContextRows,
      showWinningRowSelectors,
      winningPatternDrawIds
    } = this.options;
    const selectedIds = new Set(selectedCellIds);
    const winningDrawIds = new Set((winningPatternDrawIds || []).map(String));
    const columnSpan = showTens && showOnes ? 2 : 1;
    const header = `<thead><tr><th>Draw date</th>${Array.from({ length: 5 }, (_, index) => (
      `<th colspan="${columnSpan}">Ball ${index + 1}</th>${index < 4 ? '<th class="ball-sep"></th>' : ''}`
    )).join('')}</tr></thead>`;

    const body = this.draws.map(draw => {
      const safeId = escapeHTML(draw.id);
      const safeDate = escapeHTML(draw.date);
      const role = rowRoles[draw.id] || '';
      const displayRole = role === 'past' ? 'Previous' : role === 'present' ? 'Latest' : '';
      const roleClass = role ? ` context-row context-${role}` : '';
      const winningSelector = showWinningRowSelectors
        ? `<label class="winning-row-toggle" title="Show all successful patterns ending on ${safeDate}">
            <input type="checkbox" class="winning-row-checkbox" data-winning-row-id="${safeId}"
              aria-label="Show winning patterns ending on ${safeDate}" ${winningDrawIds.has(String(draw.id)) ? 'checked' : ''}>
          </label>`
        : '';
      const cells = draw.numbers.map((number, column) => {
        const formatted = number.toString().padStart(2, '0');
        const tensDigit = formatted[0];
        const onesDigit = formatted[1];
        const tensCellId = `${safeId}-b${column}-tens`;
        const onesCellId = `${safeId}-b${column}-ones`;
        const tens = showTens
          ? `<td><div class="square-cell tens" data-cell-id="${tensCellId}" data-digit="${tensDigit}" data-full-num="${number}" data-draw-id="${safeId}" data-column="${column}">${tensDigit}</div></td>`
          : '';
        const selected = selectedIds.has(onesCellId);
        const selectable = Boolean(role && selectableContextRows);
        const ones = showOnes
          ? `<td><div class="square-cell ones${selected ? ' motif-selected' : ''}${selectable ? ' motif-selectable' : ''}" data-cell-id="${onesCellId}" data-digit="${onesDigit}" data-full-num="${number}" data-draw-id="${safeId}" data-column="${column}" data-role="${selectable ? role : ''}" ${selectable ? `role="button" tabindex="0" aria-pressed="${selected}" aria-label="Select ones digit ${onesDigit} in ${displayRole} column ${column + 1}"` : ''}>${onesDigit}</div></td>`
          : '';
        return `${tens}${ones}${column < 4 ? '<td class="ball-sep"></td>' : ''}`;
      }).join('');
      return `<tr class="${roleClass}"><td class="date-cell"><div class="date-cell-inner">${winningSelector}<span class="date-cell-text">${displayRole ? `<span class="row-role-badge">${displayRole}</span>` : ''}${safeDate}</span></div></td>${cells}</tr>`;
    }).join('');

    this.container.innerHTML = `<table class="grid-table" id="matrixTable">${header}<tbody>${body}</tbody></table>`;
    this.attachCellEvents();
    this.updateHighlights();
  }

  attachCellEvents() {
    this.container.querySelectorAll('.winning-row-checkbox').forEach(input => {
      input.addEventListener('change', event => {
        event.stopPropagation();
        this.onWinningRowToggleCallback?.(input.dataset.winningRowId, input.checked);
      });
    });
    this.container.querySelectorAll('.square-cell').forEach(cell => {
      const activate = () => this.onCellClickCallback?.(cell, cell.dataset.cellId, Number(cell.dataset.digit));
      cell.addEventListener('click', activate);
      if (cell.dataset.role) {
        cell.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate();
          }
        });
      }
    });
  }

  updateHighlights() {
    this.container.querySelectorAll('.square-cell').forEach(cell => {
      cell.classList.toggle('highlighted', this.highlightedDigit !== null && Number(cell.dataset.digit) === this.highlightedDigit);
      for (let position = 1; position <= 5; position += 1) cell.classList.remove(`position-${position}`);
      cell.classList.remove('position-highlighted', 'position-highlight-single', 'position-highlight-double');
      cell.style.removeProperty('--position-highlight-primary');
      cell.style.removeProperty('--position-highlight-secondary');
      delete cell.dataset.highlightCount;
      if (!cell.classList.contains('ones')) return;

      const matchingPositions = this.positionHighlights
        .filter(item => item.digit === Number(cell.dataset.digit))
        .map(item => item.column + 1)
        .sort((a, b) => a - b);
      if (!matchingPositions.length) return;

      matchingPositions.forEach(position => cell.classList.add(`position-${position}`));
      cell.classList.add('position-highlighted', matchingPositions.length === 1 ? 'position-highlight-single' : 'position-highlight-double');
      cell.dataset.highlightCount = String(matchingPositions.length);
      if (matchingPositions.length > 1) {
        cell.style.setProperty('--position-highlight-primary', `var(--pos-${matchingPositions[0]}-border)`);
        cell.style.setProperty('--position-highlight-secondary', `var(--pos-${matchingPositions[1]}-border)`);
      }
    });
  }
}
