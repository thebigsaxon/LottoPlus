/** Cash 5 ones-digit matrix renderer. */

import { escapeHTML } from './validation.js';

export class GridMatrix {
  constructor(tableContainerElement) {
    this.container = tableContainerElement;
    this.draws = [];
    this.highlightedDigit = null;
    this.positionHighlights = new Map();
    this.onCellClickCallback = null;
    this.options = { showTens: false, showOnes: true, selectedCellIds: [], rowRoles: {}, selectableContextRows: false };
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
    this.positionHighlights = new Map((selections || []).map(item => [Number(item.column), Number(item.digit)]));
    this.updateHighlights();
  }

  render() {
    if (!this.container) return;
    if (!this.draws.length) {
      this.container.innerHTML = '<div class="matrix-empty"><strong>No draw data available</strong><span>Import a Cash 5 CSV or restore sample data from the Data menu.</span></div>';
      return;
    }

    const { showTens, showOnes, selectedCellIds, rowRoles, selectableContextRows } = this.options;
    const selectedIds = new Set(selectedCellIds);
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
      return `<tr class="${roleClass}"><td class="date-cell">${displayRole ? `<span class="row-role-badge">${displayRole}</span>` : ''}${safeDate}</td>${cells}</tr>`;
    }).join('');

    this.container.innerHTML = `<table class="grid-table" id="matrixTable">${header}<tbody>${body}</tbody></table>`;
    this.attachCellEvents();
    this.updateHighlights();
  }

  attachCellEvents() {
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
      cell.classList.remove('position-highlighted');
      const column = Number(cell.dataset.column);
      if (cell.classList.contains('ones') && this.positionHighlights.get(column) === Number(cell.dataset.digit)) {
        cell.classList.add('position-highlighted', `position-${column + 1}`);
      }
    });
  }
}
