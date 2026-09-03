import test from 'node:test';
import assert from 'node:assert/strict';
import { createNextDrawingPreview, GridMatrix, NEXT_DRAWING_PREVIEW_ID } from '../js/gridMatrix.js';

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(...names) { names.forEach(name => values.add(name)); },
    remove(...names) { names.forEach(name => values.delete(name)); },
    contains(name) { return values.has(name); },
    toggle(name, force) {
      if (force) values.add(name);
      else values.delete(name);
    }
  };
}

function makeCell(digit, column, type = 'ones', drawId = '') {
  const properties = new Map();
  return {
    dataset: { digit: String(digit), column: String(column), drawId: String(drawId) },
    classList: makeClassList(['square-cell', type]),
    style: {
      setProperty(name, value) { properties.set(name, value); },
      removeProperty(name) { properties.delete(name); },
      getPropertyValue(name) { return properties.get(name) || ''; }
    }
  };
}

test('mapped future digits highlight matching cells in ending and complete-number modes', () => {
  const sameColumn = makeCell(5, 1);
  const otherColumn = makeCell(5, 4);
  const differentDigit = makeCell(7, 1);
  const completeNumberCell = makeCell(5, 0);
  completeNumberCell.classList.add('complete-number');
  const cells = [sameColumn, otherColumn, differentDigit, completeNumberCell];
  const matrix = new GridMatrix({ querySelectorAll: () => cells });

  matrix.setPositionHighlights([{ column: 1, digit: 5 }]);

  assert.equal(sameColumn.classList.contains('position-highlighted'), true);
  assert.equal(otherColumn.classList.contains('position-highlighted'), true);
  assert.equal(otherColumn.classList.contains('position-2'), true);
  assert.equal(differentDigit.classList.contains('position-highlighted'), false);
  assert.equal(completeNumberCell.classList.contains('position-highlighted'), true);
});

test('a digit mapped in two future columns adds concentric highlight metadata everywhere', () => {
  const firstMatch = makeCell(5, 0);
  const secondMatch = makeCell(5, 3);
  const cells = [firstMatch, secondMatch];
  const matrix = new GridMatrix({ querySelectorAll: () => cells });

  matrix.setPositionHighlights([
    { column: 1, digit: 5 },
    { column: 4, digit: 5 }
  ]);

  cells.forEach(cell => {
    assert.equal(cell.classList.contains('position-highlight-double'), true);
    assert.equal(cell.classList.contains('position-2'), true);
    assert.equal(cell.classList.contains('position-5'), true);
    assert.equal(cell.dataset.highlightCount, '2');
    assert.equal(cell.style.getPropertyValue('--position-highlight-primary'), 'var(--pos-2-border)');
    assert.equal(cell.style.getPropertyValue('--position-highlight-secondary'), 'var(--pos-5-border)');
  });
});

test('Winning Patterns adds independently checked selectors before draw dates', () => {
  const container = {
    innerHTML: '',
    querySelectorAll() { return []; }
  };
  const matrix = new GridMatrix(container);
  matrix.setDraws([
    { id: 'd1', date: '2026-08-01', numbers: [1, 2, 3, 4, 5] },
    { id: 'd2', date: '2026-08-02', numbers: [6, 7, 8, 9, 10] }
  ], 'cash5', {
    showCompleteNumbers: false,
    showWinningRowSelectors: true,
    winningPatternDrawIds: ['d2']
  });

  assert.equal((container.innerHTML.match(/class="winning-row-checkbox"/g) || []).length, 2);
  assert.match(container.innerHTML, /data-winning-row-id="d1"[\s\S]*?2026-08-01/);
  assert.match(container.innerHTML, /data-winning-row-id="d2"[\s\S]*?checked[\s\S]*?2026-08-02/);
  assert.match(container.innerHTML, /HNCDE status/);
  assert.match(container.innerHTML, /emerging/);
  assert.match(container.innerHTML, /declining/);
});

test('Winning Pivot Point renders one target-row selector and a result for every eligible row', () => {
  const container = { innerHTML: '', querySelectorAll() { return []; } };
  const matrix = new GridMatrix(container);
  matrix.setDraws([
    { id: 'd1', date: '2026-08-27', numbers: [1, 2, 3, 9, 10] },
    { id: 'd2', date: '2026-08-28', numbers: [15, 25, 28, 30, 38] },
    { id: 'd3', date: '2026-08-29', numbers: [10, 17, 22, 37, 38] },
    createNextDrawingPreview([1, null, null, null, null], '2026-08-29')
  ], 'cash5', {
    showWinningPivotPoints: true,
    activeWinningPivotDrawId: 'd3'
  });

  assert.match(container.innerHTML, /class="winning-pivot-column-heading">Winning pivot/);
  assert.equal((container.innerHTML.match(/class="winning-pivot-row-radio"/g) || []).length, 2);
  assert.doesNotMatch(container.innerHTML, /data-winning-pivot-row-id="d1"/);
  assert.match(container.innerHTML, /data-winning-pivot-row-id="d2"/);
  assert.match(container.innerHTML, /data-winning-pivot-row-id="d3"[^>]*checked/);
  assert.doesNotMatch(container.innerHTML, /data-winning-pivot-row-id="preview-next-drawing"/);
  assert.equal((container.innerHTML.match(/class="winning-pivot-result(?: active)?"/g) || []).length, 4);
  assert.match(container.innerHTML, /winning-pivot-result active/);
  assert.match(container.innerHTML, />5\/5<\/small>/);
});

test('Next drawing preview fills picked balls and leaves empty placeholders', () => {
  const preview = createNextDrawingPreview([5, null, 22, null, 41], '2026-08-01');
  assert.equal(preview.id, NEXT_DRAWING_PREVIEW_ID);
  assert.equal(preview.date, '2026-08-02');
  assert.deepEqual(preview.numbers, [5, null, 22, null, 41]);

  const container = { innerHTML: '', querySelectorAll() { return []; } };
  const matrix = new GridMatrix(container);
  matrix.setDraws([
    { id: 'd1', date: '2026-08-01', numbers: [1, 2, 3, 4, 5] },
    preview
  ], 'cash5', {
    showCompleteNumbers: false,
    rowRoles: { d1: 'present', [NEXT_DRAWING_PREVIEW_ID]: 'next' },
    showWinningRowSelectors: true
  });

  assert.match(container.innerHTML, /context-next/);
  assert.match(container.innerHTML, />Next</);
  assert.match(container.innerHTML, /2026-08-02/);
  assert.doesNotMatch(container.innerHTML, /Next drawing/);
  assert.match(container.innerHTML, /data-full-num="22"/);
  assert.doesNotMatch(container.innerHTML, /complete-number/);
  assert.match(container.innerHTML, /data-full-num="22"[^>]*>2<\/div>/);
  assert.match(container.innerHTML, /data-full-num="5"[^>]*>5<\/div>/);
  assert.equal((container.innerHTML.match(/preview-empty/g) || []).length, 2);
  assert.match(container.innerHTML, /data-winning-row-id="preview-next-drawing"/);
});

test('complete-number mode renders one stable zero-padded cell per Ball', () => {
  const container = { innerHTML: '', querySelectorAll() { return []; } };
  const matrix = new GridMatrix(container);
  matrix.setDraws([
    { id: 'd1', date: '2026-08-01', numbers: [1, 12, 23, 34, 42] }
  ], 'cash5', { showCompleteNumbers: true });

  assert.equal((container.innerHTML.match(/class="square-cell/g) || []).length, 5);
  assert.equal((container.innerHTML.match(/complete-number/g) || []).length, 5);
  assert.match(container.innerHTML, /data-cell-id="d1-b0-ones"[^>]*>01<\/div>/);
  assert.match(container.innerHTML, /data-cell-id="d1-b1-ones"[^>]*>12<\/div>/);
  assert.match(container.innerHTML, /data-cell-id="d1-b4-ones"[^>]*>42<\/div>/);
  assert.doesNotMatch(container.innerHTML, /-tens"/);
});

test('whole-number theme marks matching complete numbers in the matrix', () => {
  const container = { innerHTML: '', querySelectorAll() { return []; } };
  const matrix = new GridMatrix(container);
  matrix.setDraws([
    { id: 'd0', date: '2026-08-22', numbers: [1, 19, 20, 24, 38] },
    { id: 'd1', date: '2026-08-31', numbers: [7, 9, 16, 38, 39] }
  ], 'cash5', {
    showCompleteNumbers: true,
    themeNumbers: [7, 38, 39],
    themeDrawIds: ['d1']
  });

  assert.match(container.innerHTML, /theme-number-hit[^>]*data-draw-id="d1"/);
  assert.match(container.innerHTML, /theme-number-hit[^>]*data-full-num="7"/);
  assert.doesNotMatch(container.innerHTML, /theme-number-hit[^>]*data-draw-id="d0"/);
  assert.doesNotMatch(container.innerHTML, /theme-number-hit[^>]*data-full-num="16"/);
});

test('Pivot Pools add per-row Low, High, and Both controls but exclude the preview row', () => {
  const container = { innerHTML: '', querySelectorAll() { return []; } };
  const matrix = new GridMatrix(container);
  matrix.setDraws([
    { id: 'd1', date: '2026-08-27', numbers: [5, 26, 33, 36, 41] },
    { id: 'd2', date: '2026-08-28', numbers: [15, 25, 28, 30, 38] },
    createNextDrawingPreview([10, null, 32, null, 38], '2026-08-28')
  ], 'cash5', {
    showPivotPools: true,
    activePivotReference: { drawId: 'd2', mode: 'both' }
  });

  assert.match(container.innerHTML, /class="pivot-column-heading">Pivots/);
  assert.equal((container.innerHTML.match(/class="pivot-control(?: active)?"/g) || []).length, 6);
  assert.match(container.innerHTML, /data-pivot-draw-id="d2" data-pivot-mode="low"[^>]*>[^<]*<small>L/);
  assert.match(container.innerHTML, /data-pivot-draw-id="d2" data-pivot-mode="high"/);
  assert.match(container.innerHTML, /pivot-control active[^>]*data-pivot-draw-id="d2" data-pivot-mode="both"/);
  assert.doesNotMatch(container.innerHTML, /data-pivot-draw-id="preview-next-drawing"/);
});

test('Pivot Pool highlights source pivots and matching endings only in the immediate next row', () => {
  const source = [
    makeCell(5, 0, 'ones', 'd1'), makeCell(5, 1, 'ones', 'd1'),
    makeCell(8, 2, 'ones', 'd1'), makeCell(0, 3, 'ones', 'd1'), makeCell(8, 4, 'ones', 'd1')
  ];
  const target = [
    makeCell(0, 0, 'ones', 'd2'), makeCell(1, 1, 'ones', 'd2'),
    makeCell(2, 2, 'ones', 'd2'), makeCell(7, 3, 'ones', 'd2'), makeCell(8, 4, 'ones', 'd2')
  ];
  const later = makeCell(7, 0, 'ones', 'd3');
  const matrix = new GridMatrix({ querySelectorAll: () => [...source, ...target, later] });
  matrix.draws = [
    { id: 'd1', numbers: [15, 25, 28, 30, 38] },
    { id: 'd2', numbers: [10, 11, 22, 37, 38] },
    { id: 'd3', numbers: [17, 21, 23, 34, 40] }
  ];
  matrix.options.showPivotPools = true;
  matrix.options.activePivotReference = { drawId: 'd1', mode: 'both' };
  matrix.updateHighlights();

  assert.equal(source[2].classList.contains('pivot-source-active'), true);
  assert.equal(source[3].classList.contains('pivot-source-active'), true);
  assert.equal(source[0].classList.contains('pivot-source-active'), false);
  assert.equal(target[0].classList.contains('pivot-pool-hit'), true);
  assert.equal(target[1].classList.contains('pivot-pool-hit'), false);
  assert.equal(target[2].classList.contains('pivot-pool-hit'), true);
  assert.equal(target[3].classList.contains('pivot-pool-hit'), true);
  assert.equal(target[4].classList.contains('pivot-pool-hit'), true);
  assert.equal(later.classList.contains('pivot-pool-hit'), false);
});

test('complete-number preview cells receive Pivot Pool highlights by ending', () => {
  const previewSeven = makeCell(7, 0, 'ones', NEXT_DRAWING_PREVIEW_ID);
  previewSeven.classList.add('complete-number');
  const previewOne = makeCell(1, 1, 'ones', NEXT_DRAWING_PREVIEW_ID);
  previewOne.classList.add('complete-number');
  const matrix = new GridMatrix({ querySelectorAll: () => [previewSeven, previewOne] });
  matrix.draws = [
    { id: 'd1', numbers: [15, 25, 28, 30, 38] },
    createNextDrawingPreview([17, 21, null, null, null], '2026-08-28')
  ];
  matrix.options.showPivotPools = true;
  matrix.options.activePivotReference = { drawId: 'd1', mode: 'both' };
  matrix.updateHighlights();

  assert.equal(previewSeven.classList.contains('pivot-pool-hit'), true);
  assert.equal(previewOne.classList.contains('pivot-pool-hit'), false);
});

test('Winning Pivot Point highlights the union of tied winners only in the selected target row', () => {
  const source = [1, 2, 3, 9, 0].map((digit, column) => makeCell(digit, column, 'ones', 'd1'));
  const target = [4, 7, 1, 2, 3].map((digit, column) => makeCell(digit, column, 'ones', 'd2'));
  target[0].classList.add('complete-number');
  const later = makeCell(4, 0, 'ones', 'd3');
  const matrix = new GridMatrix({ querySelectorAll: () => [...source, ...target, later] });
  matrix.draws = [
    { id: 'd1', numbers: [1, 2, 3, 9, 10] },
    { id: 'd2', numbers: [4, 7, 11, 12, 13] },
    { id: 'd3', numbers: [14, 17, 21, 22, 23] }
  ];
  matrix.options.showWinningPivotPoints = true;
  matrix.options.activeWinningPivotDrawId = 'd2';
  matrix.updateHighlights();

  target.forEach(cell => assert.equal(cell.classList.contains('winning-pivot-hit'), true));
  source.forEach(cell => assert.equal(cell.classList.contains('winning-pivot-hit'), false));
  assert.equal(later.classList.contains('winning-pivot-hit'), false);
  assert.match(target[0].dataset.winningPivotEvidence, /winning pivots/);
});
