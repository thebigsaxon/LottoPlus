import test from 'node:test';
import assert from 'node:assert/strict';
import { cash5AnalysisWindow, cash5ResearchWindow, filterAndSortDraws, priorDrawCountToLimit } from '../js/drawFilters.js';

const draws = [
  { id: 'newest', date: '2026-08-04' },
  { id: 'oldest', date: '2026-08-01' },
  { id: 'second-newest', date: '2026-08-03' },
  { id: 'second-oldest', date: '2026-08-02' }
];

test('chronological display places the newest draw at the bottom', () => {
  const result = filterAndSortDraws(draws, { sortOrder: 'asc' });
  assert.deepEqual(result.map(draw => draw.id), [
    'oldest', 'second-oldest', 'second-newest', 'newest'
  ]);
});

test('Last X selects newest draws before chronological display sorting', () => {
  const result = filterAndSortDraws(draws, { sortOrder: 'asc', limit: '2' });
  assert.deepEqual(result.map(draw => draw.id), ['second-newest', 'newest']);
});

test('prior draw count includes the latest drawing in the table limit', () => {
  assert.equal(priorDrawCountToLimit('14'), 15);
  assert.equal(priorDrawCountToLimit('21'), 22);
});

test('Cash 5 analysis always uses the latest 10 draws with newest at bottom', () => {
  const manyDraws = Array.from({ length: 15 }, (_, index) => ({
    id: `d${index + 1}`,
    date: `2026-01-${String(index + 1).padStart(2, '0')}`
  }));
  const result = cash5AnalysisWindow(manyDraws.reverse());
  assert.equal(result.length, 10);
  assert.equal(result[0].id, 'd6');
  assert.equal(result[9].id, 'd15');
});

test('research tools use the latest 50 draws with newest at bottom', () => {
  const manyDraws = Array.from({ length: 65 }, (_, index) => ({
    id: `d${index + 1}`,
    date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`
  }));
  const result = cash5ResearchWindow(manyDraws.reverse());
  assert.equal(result.length, 50);
  assert.equal(result[0].id, 'd16');
  assert.equal(result[49].id, 'd65');
});
