import test from 'node:test';
import assert from 'node:assert/strict';
import { GridMatrix } from '../js/gridMatrix.js';

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

function makeCell(digit, column, type = 'ones') {
  const properties = new Map();
  return {
    dataset: { digit: String(digit), column: String(column) },
    classList: makeClassList(['square-cell', type]),
    style: {
      setProperty(name, value) { properties.set(name, value); },
      removeProperty(name) { properties.delete(name); },
      getPropertyValue(name) { return properties.get(name) || ''; }
    }
  };
}

test('mapped future digits highlight every matching historical ones cell regardless of column', () => {
  const sameColumn = makeCell(5, 1);
  const otherColumn = makeCell(5, 4);
  const differentDigit = makeCell(7, 1);
  const tensCell = makeCell(5, 0, 'tens');
  const cells = [sameColumn, otherColumn, differentDigit, tensCell];
  const matrix = new GridMatrix({ querySelectorAll: () => cells });

  matrix.setPositionHighlights([{ column: 1, digit: 5 }]);

  assert.equal(sameColumn.classList.contains('position-highlighted'), true);
  assert.equal(otherColumn.classList.contains('position-highlighted'), true);
  assert.equal(otherColumn.classList.contains('position-2'), true);
  assert.equal(differentDigit.classList.contains('position-highlighted'), false);
  assert.equal(tensCell.classList.contains('position-highlighted'), false);
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
    showTens: false,
    showOnes: true,
    showWinningRowSelectors: true,
    winningPatternDrawIds: ['d2']
  });

  assert.equal((container.innerHTML.match(/class="winning-row-checkbox"/g) || []).length, 2);
  assert.match(container.innerHTML, /data-winning-row-id="d1"[\s\S]*?2026-08-01/);
  assert.match(container.innerHTML, /data-winning-row-id="d2"[\s\S]*?checked[\s\S]*?2026-08-02/);
});
