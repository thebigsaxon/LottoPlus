import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAutomatedPatterns } from '../js/patternEngine.js';

test('patternEngine detects vertical runs strictly in the same column', () => {
  const draws = [
    { id: 'd1', date: '2026-08-02', numbers: [12, 20, 30, 40, 42], bonus: null },
    { id: 'd2', date: '2026-08-01', numbers: [15, 25, 35, 45, 42], bonus: null } // Ball 5 matches: 42 -> 42 in ball 5 ones digit ('2')
  ];

  const lines = generateAutomatedPatterns(draws, {
    showMatches: false,
    showVerticalRuns: true,
    showDiagonalRuns: false,
    showTens: true,
    showOnes: true
  });

  assert.ok(lines.length > 0);
  assert.ok(lines.every(l => l.style === 'solid'));
});

test('patternEngine detects diagonal runs strictly for 1:1 diagonal column shifts', () => {
  const draws = [
    { id: 'd1', date: '2026-08-02', numbers: [12, 23, 34, 45, 46], bonus: null },
    { id: 'd2', date: '2026-08-01', numbers: [21, 32, 43, 54, 65], bonus: null }
  ];

  const lines = generateAutomatedPatterns(draws, {
    showMatches: false,
    showVerticalRuns: false,
    showDiagonalRuns: true,
    showTens: true,
    showOnes: true
  });

  assert.ok(lines.every(l => l.style === 'dashed'));
});

test('patternEngine keeps one connection per scenario for identical cell pairs', () => {
  const draws = [
    { id: 'd1', date: '2026-08-02', numbers: [12, 23, 34, 45, 46], bonus: null },
    { id: 'd2', date: '2026-08-01', numbers: [12, 23, 34, 45, 46], bonus: null }
  ];

  const lines = generateAutomatedPatterns(draws, {
    showMatches: true,
    showVerticalRuns: true,
    showDiagonalRuns: true,
    showTens: true,
    showOnes: true
  });

  const scenarioPairKeys = lines.map(l => `${l.patternType}:${[l.fromCellId, l.toCellId].sort().join(':')}`);
  assert.equal(scenarioPairKeys.length, new Set(scenarioPairKeys).size);

  const pairCounts = new Map();
  lines.forEach(line => {
    const pairKey = [line.fromCellId, line.toCellId].sort().join(':');
    pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
  });
  assert.ok([...pairCounts.values()].some(count => count > 1), 'Overlapping scenarios remain visible');
  assert.ok(lines.every(line => line.isArrow === false));
});

test('nearby digit matches only connect adjacent rows with one-to-one cell pairing', () => {
  const draws = [
    { id: 'd1', date: '2026-08-01', numbers: [1, 2, 3, 4, 5], bonus: null },
    { id: 'd2', date: '2026-08-02', numbers: [6, 7, 8, 9, 10], bonus: null },
    { id: 'd3', date: '2026-08-03', numbers: [11, 12, 13, 14, 15], bonus: null }
  ];

  const lines = generateAutomatedPatterns(draws, {
    showMatches: true,
    showVerticalRuns: false,
    showDiagonalRuns: false,
    showTens: true,
    showOnes: true
  });

  assert.ok(lines.every(line => {
    const fromRow = Number(line.fromCellId.match(/^d(\d)/)[1]);
    const toRow = Number(line.toCellId.match(/^d(\d)/)[1]);
    return Math.abs(fromRow - toRow) === 1;
  }));

  const endpointsByRowPairAndDigit = new Map();
  lines.forEach(line => {
    const key = `${line.fromCellId.slice(0, 2)}:${line.toCellId.slice(0, 2)}:${line.label}`;
    const endpoints = endpointsByRowPairAndDigit.get(key) || [];
    endpoints.push(line.fromCellId, line.toCellId);
    endpointsByRowPairAndDigit.set(key, endpoints);
  });
  endpointsByRowPairAndDigit.forEach(endpoints => {
    assert.equal(endpoints.length, new Set(endpoints).size);
  });
});

test('mathematical sequences connect matching three-row columns', () => {
  const draws = [
    { id: 'd1', date: '2026-08-17', numbers: [3, 7, 2, 4, 6], bonus: null },
    { id: 'd2', date: '2026-08-18', numbers: [1, 8, 3, 5, 7], bonus: null },
    { id: 'd3', date: '2026-08-19', numbers: [8, 1, 6, 1, 4], bonus: null }
  ];

  const lines = generateAutomatedPatterns(draws, {
    showMatches: false,
    showVerticalRuns: false,
    showDiagonalRuns: false,
    showMathematicalSequences: true,
    showTens: false,
    showOnes: true
  });

  const mathLines = lines.filter(line => line.patternType === 'math-sequence');
  assert.ok(mathLines.some(line => line.sequenceCellIds.join(',') === 'd1-b0-ones,d2-b0-ones,d3-b0-ones'));
  assert.ok(mathLines.some(line => line.sequenceCellIds.join(',') === 'd1-b1-ones,d2-b1-ones,d3-b1-ones'));
  assert.ok(mathLines.some(line => line.label.includes('11 − 3 = 8')));
  assert.ok(mathLines.some(line => line.label.includes('8 − 7 = 1')));
});

test('overlapping mathematical sequence chains use dashed group rectangles', () => {
  const draws = [
    { id: 'd1', date: '2026-08-16', numbers: [3], bonus: null },
    { id: 'd2', date: '2026-08-17', numbers: [1], bonus: null },
    { id: 'd3', date: '2026-08-18', numbers: [8], bonus: null },
    { id: 'd4', date: '2026-08-19', numbers: [9], bonus: null }
  ];
  const lines = generateAutomatedPatterns(draws, {
    showMatches: false,
    showMathematicalSequences: true,
    showTens: false,
    showOnes: true
  });
  const mathLines = lines.filter(line => line.patternType === 'math-sequence');
  assert.equal(mathLines.length, 2);
  assert.ok(mathLines.every(line => line.overlapsSequence && line.style === 'dashed'));
});
