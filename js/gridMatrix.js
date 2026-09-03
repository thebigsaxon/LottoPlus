/** Cash 5 ending/full-number matrix renderer. */

import { escapeHTML } from './validation.js?v=11';
import { buildDigitHeatTimeline } from './repeatSummary.js?v=6';
import { nextCalendarDate } from './dateUtils.js?v=1';
import {
  buildPivotDefinitions,
  buildPivotPool,
  buildWinningPivotTimeline
} from './pivotPools.js?v=2';

export { nextCalendarDate } from './dateUtils.js?v=1';

export const NEXT_DRAWING_PREVIEW_ID = 'preview-next-drawing';

export function createNextDrawingPreview(slipNumbers = [], latestDrawDate = '') {
  return {
    id: NEXT_DRAWING_PREVIEW_ID,
    date: nextCalendarDate(latestDrawDate),
    preview: true,
    numbers: Array.from({ length: 5 }, (_, column) => {
      const number = Number(Array.isArray(slipNumbers) ? slipNumbers[column] : null);
      return Number.isInteger(number) && number >= 1 && number <= 42 ? number : null;
    })
  };
}

export class GridMatrix {
  constructor(tableContainerElement) {
    this.container = tableContainerElement;
    this.draws = [];
    this.highlightedDigit = null;
    this.positionHighlights = [];
    this.onCellClickCallback = null;
    this.onWinningRowToggleCallback = null;
    this.onPivotReferenceChangeCallback = null;
    this.onWinningPivotRowChangeCallback = null;
    this.options = {
      showCompleteNumbers: false,
      showPivotPools: false,
      activePivotReference: null,
      showWinningPivotPoints: false,
      activeWinningPivotDrawId: null,
      selectedCellIds: [],
      rowRoles: {},
      selectableContextRows: false,
      showWinningRowSelectors: false,
      winningPatternDrawIds: [],
      heatHistoryDraws: [],
      themeNumbers: [],
      themeDrawIds: []
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
      showCompleteNumbers,
      selectedCellIds,
      rowRoles,
      selectableContextRows,
      showWinningRowSelectors,
      winningPatternDrawIds,
      showPivotPools,
      activePivotReference,
      showWinningPivotPoints,
      activeWinningPivotDrawId
    } = this.options;
    const themeNumbers = new Set((this.options.themeNumbers || []).map(Number));
    const themeDrawIds = new Set((this.options.themeDrawIds || []).map(String));
    const selectedIds = new Set(selectedCellIds);
    const winningDrawIds = new Set((winningPatternDrawIds || []).map(String));
    const winningPivotTimeline = buildWinningPivotTimeline(this.draws);
    const winningPivotByTargetId = new Map(winningPivotTimeline.map(item => [item.targetDrawId, item]));
    const heatHistory = this.options.heatHistoryDraws?.length ? this.options.heatHistoryDraws : this.draws;
    const heatByDrawId = new Map(buildDigitHeatTimeline(heatHistory).map(item => [String(item.draw.id), item]));
    const header = `<thead><tr><th>Draw date</th>${Array.from({ length: 5 }, (_, index) => (
      `<th>Ball ${index + 1}</th>${index < 4 ? '<th class="ball-sep"></th>' : ''}`
    )).join('')}${showPivotPools ? '<th class="pivot-column-heading">Pivots</th>' : ''}<th class="hcn-column-heading">HNCDE status</th>${showWinningPivotPoints ? '<th class="winning-pivot-column-heading">Winning pivot</th>' : ''}</tr></thead>`;

    const body = this.draws.map(draw => {
      const safeId = escapeHTML(draw.id);
      const safeDate = escapeHTML(draw.date);
      const role = rowRoles[draw.id] || '';
      const displayRole = role === 'past' ? 'Previous' : role === 'present' ? 'Latest' : role === 'next' ? 'Next' : '';
      const roleClass = role ? ` context-row context-${role}` : '';
      const winningSelector = showWinningRowSelectors
        ? `<label class="winning-row-toggle" title="Show all successful patterns ending on ${safeDate}">
            <input type="checkbox" class="winning-row-checkbox" data-winning-row-id="${safeId}"
              aria-label="Show winning patterns ending on ${safeDate}" ${winningDrawIds.has(String(draw.id)) ? 'checked' : ''}>
          </label>`
        : '';
      const winningPivotEvaluation = winningPivotByTargetId.get(String(draw.id));
      const winningPivotSelector = showWinningPivotPoints && winningPivotEvaluation
        ? `<label class="winning-pivot-row-toggle" title="Inspect winning pivots for ${safeDate}">
            <input type="radio" name="winning-pivot-row" class="winning-pivot-row-radio" data-winning-pivot-row-id="${safeId}"
              aria-label="Inspect winning pivots for ${safeDate}" ${String(activeWinningPivotDrawId) === String(draw.id) ? 'checked' : ''}>
          </label>`
        : '';
      const heat = heatByDrawId.get(String(draw.id));
      const emerging = new Set(heat?.emergingDigits || []);
      const heatDigits = (tier, label, showCount = false) => `<span class="row-hcn-group row-hcn-${tier}"><b>${label}${showCount ? `<sup>${heat?.[tier]?.length || 0}</sup>` : ''}</b><span class="row-hcn-values">${(heat?.[tier] || []).map(item => (
        `<i class="row-hcn-digit${emerging.has(item.digit) ? ' is-emerging' : ''}" title="${emerging.has(item.digit) ? `${item.digit} moved from Cold to Drawn` : `${item.digit}: ${tier}`}">${item.digit}</i>`
      )).join('') || '<em>—</em>'}</span></span>`;
      const heatCell = `<td class="row-hcn-cell"><div class="row-hcn-box">
        <div class="row-hcn-digits">${heatDigits('hot', 'H')}${heatDigits('neutral', 'N')}${heatDigits('cold', 'C')}</div>
        <div class="row-hcn-movements">${heatDigits('declining', 'D', true)}${heatDigits('emerging', 'E', true)}</div>
      </div></td>`;
      const pivotDefinitions = draw.preview ? [] : buildPivotDefinitions(draw.numbers);
      const isActivePivotRow = String(activePivotReference?.drawId || '') === String(draw.id);
      const pivotButton = (mode, label, digit = null) => {
        const active = isActivePivotRow && activePivotReference?.mode === mode;
        const content = digit === null ? `<small>${label}</small>` : `<small>${label}</small>${digit}`;
        return `<button class="pivot-control${active ? ' active' : ''}" type="button" data-pivot-draw-id="${safeId}" data-pivot-mode="${mode}" aria-pressed="${active}" title="Show ${label.toLowerCase()} pivot pool for ${safeDate}">${content}</button>`;
      };
      let pivotCell = '';
      if (showPivotPools) {
        let pivotControls = '<span class="pivot-pool-empty">—</span>';
        if (pivotDefinitions.length === 1) {
          pivotControls = pivotButton('both', 'P', pivotDefinitions[0].digit);
        } else if (pivotDefinitions.length === 2) {
          pivotControls = `${pivotButton('low', 'L', pivotDefinitions[0].digit)}${pivotButton('high', 'H', pivotDefinitions[1].digit)}${pivotButton('both', 'Both')}`;
        }
        pivotCell = `<td class="pivot-cell"><div class="pivot-controls">${pivotControls}</div></td>`;
      }
      let winningPivotCell = '';
      if (showWinningPivotPoints) {
        const active = String(activeWinningPivotDrawId) === String(draw.id);
        const winnerDigits = winningPivotEvaluation?.winners.map(candidate => candidate.digit) || [];
        const winnerLabel = winnerDigits.length ? winnerDigits.join(', ') : '—';
        const scoreLabel = winningPivotEvaluation ? `${winningPivotEvaluation.winningHitCount}/5` : '';
        const sourceLabel = winningPivotEvaluation
          ? `Winning pivot${winnerDigits.length === 1 ? '' : 's'} ${winnerLabel} from ${winningPivotEvaluation.sourceDate || 'the preceding row'} matched ${scoreLabel} Balls in ${safeDate}`
          : `No preceding visible official row is available for ${safeDate}`;
        winningPivotCell = `<td class="winning-pivot-cell"><div class="winning-pivot-result${active ? ' active' : ''}" title="${escapeHTML(sourceLabel)}"><span>${winnerLabel}</span>${scoreLabel ? `<small>${scoreLabel}</small>` : ''}</div></td>`;
      }
      const values = Array.from({ length: 5 }, (_, column) => draw.numbers?.[column]);
      const cells = values.map((number, column) => {
        const valid = Number.isInteger(number) && number >= 1 && number <= 42;
        const formatted = valid ? number.toString().padStart(2, '0') : '';
        const onesDigit = valid ? formatted[1] : '';
        const onesCellId = `${safeId}-b${column}-ones`;
        const themeHit = valid && themeNumbers.has(number)
          && (themeDrawIds.size === 0 || themeDrawIds.has(String(draw.id)));
        const emptyClass = valid ? '' : ' preview-empty';
        const selected = selectedIds.has(onesCellId);
        const selectable = Boolean(role && selectableContextRows && valid);
        const cellDisplay = valid ? (showCompleteNumbers ? formatted : onesDigit) : '—';
        const valueLabel = showCompleteNumbers ? `complete number ${formatted}` : `ones digit ${onesDigit}`;
        const cell = `<td><div class="square-cell ones${showCompleteNumbers ? ' complete-number' : ''}${emptyClass}${selected ? ' motif-selected' : ''}${selectable ? ' motif-selectable' : ''}${themeHit ? ' theme-number-hit' : ''}" ${valid ? `data-cell-id="${onesCellId}" data-digit="${onesDigit}" data-full-num="${number}" data-draw-id="${safeId}" data-column="${column}" data-role="${role || ''}"` : ''} ${selectable ? `role="button" tabindex="0" aria-pressed="${selected}" aria-label="Select ${valueLabel} in ${displayRole} column ${column + 1}"` : ''}${themeHit ? ` title="Whole-number theme: ${formatted}"` : ''}>${cellDisplay}</div></td>`;
        return `${cell}${column < 4 ? '<td class="ball-sep"></td>' : ''}`;
      }).join('');
      return `<tr class="${roleClass}"><td class="date-cell"><div class="date-cell-inner">${winningSelector}${winningPivotSelector}<span class="date-cell-text">${displayRole ? `<span class="row-role-badge">${displayRole}</span>` : ''}${safeDate}</span></div></td>${cells}${pivotCell}${heatCell}${winningPivotCell}</tr>`;
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
    this.container.querySelectorAll('.pivot-control').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        this.onPivotReferenceChangeCallback?.(button.dataset.pivotDrawId, button.dataset.pivotMode);
      });
    });
    this.container.querySelectorAll('.winning-pivot-row-radio').forEach(input => {
      input.addEventListener('change', event => {
        event.stopPropagation();
        if (input.checked) this.onWinningPivotRowChangeCallback?.(input.dataset.winningPivotRowId);
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
    const activePivotReference = this.options.showPivotPools ? this.options.activePivotReference : null;
    const sourceIndex = activePivotReference
      ? this.draws.findIndex(draw => String(draw.id) === String(activePivotReference.drawId) && !draw.preview)
      : -1;
    const sourceDraw = sourceIndex >= 0 ? this.draws[sourceIndex] : null;
    const targetDraw = sourceIndex >= 0 ? this.draws[sourceIndex + 1] : null;
    const pivotPool = sourceDraw ? buildPivotPool(sourceDraw.numbers, activePivotReference.mode) : null;
    const pivotDigits = new Set(pivotPool?.digits || []);
    const pivotColumns = new Set((pivotPool?.pivots || []).map(pivot => pivot.column));
    const activeWinningPivot = this.options.showWinningPivotPoints
      ? buildWinningPivotTimeline(this.draws).find(item => item.targetDrawId === String(this.options.activeWinningPivotDrawId))
      : null;
    const winningPivotTargetColumns = new Set(activeWinningPivot?.matchedTargetColumns || []);
    this.container.querySelectorAll('.square-cell').forEach(cell => {
      cell.classList.toggle('highlighted', this.highlightedDigit !== null && Number(cell.dataset.digit) === this.highlightedDigit);
      const cellDrawId = String(cell.dataset.drawId || '');
      const cellColumn = Number(cell.dataset.column);
      const cellDigit = Number(cell.dataset.digit);
      cell.classList.toggle('pivot-source-active', Boolean(sourceDraw)
        && cellDrawId === String(sourceDraw.id) && pivotColumns.has(cellColumn));
      cell.classList.toggle('pivot-pool-hit', Boolean(targetDraw)
        && cellDrawId === String(targetDraw.id) && pivotDigits.has(cellDigit));
      const winningPivotHit = Boolean(activeWinningPivot)
        && cellDrawId === activeWinningPivot.targetDrawId && winningPivotTargetColumns.has(cellColumn);
      cell.classList.toggle('winning-pivot-hit', winningPivotHit);
      if (winningPivotHit) {
        const supportingPivots = activeWinningPivot.winners
          .filter(candidate => candidate.matchedTargetColumns.includes(cellColumn))
          .map(candidate => candidate.digit);
        const evidence = `Drawn ending ${cellDigit} matched winning pivot${supportingPivots.length === 1 ? '' : 's'} ${supportingPivots.join(', ')}`;
        cell.dataset.winningPivotEvidence = evidence;
        cell.setAttribute?.('title', evidence);
      } else if (cell.dataset.winningPivotEvidence) {
        delete cell.dataset.winningPivotEvidence;
        cell.removeAttribute?.('title');
      }
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
