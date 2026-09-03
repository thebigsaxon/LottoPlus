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
    showCompleteNumbers: false
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
    showCompleteNumbers: false
  });

  assert.ok(lines.every(line => line.style === 'dashed'));
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
    showCompleteNumbers: false
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
    showCompleteNumbers: false
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

test('complete-number matches reject equal endings and accept only equal whole values', () => {
  const endingOnlyDraws = [
    { id: 'd1', date: '2026-08-01', numbers: [12, 13, 14, 15, 16] },
    { id: 'd2', date: '2026-08-02', numbers: [22, 23, 24, 25, 26] }
  ];
  const digitMatches = generateAutomatedPatterns(endingOnlyDraws, {
    showMatches: true,
    showCompleteNumbers: false
  }).filter(line => line.patternType === 'match');
  const completeMatches = generateAutomatedPatterns(endingOnlyDraws, {
    showMatches: true,
    showCompleteNumbers: true
  }).filter(line => line.patternType === 'match');

  assert.equal(digitMatches.length, 5);
  assert.equal(completeMatches.length, 0);

  const exactMatches = generateAutomatedPatterns([
    endingOnlyDraws[0],
    { id: 'd3', date: '2026-08-03', numbers: [12, 23, 24, 25, 26] }
  ], {
    showMatches: true,
    showCompleteNumbers: true
  }).filter(line => line.patternType === 'match');
  assert.equal(exactMatches.length, 1);
  assert.equal(exactMatches[0].fromCellId, 'd1-b0-ones');
  assert.equal(exactMatches[0].toCellId, 'd3-b0-ones');
  assert.equal(exactMatches[0].label, 'Number 12');
});

test('complete-number movement patterns use Ball positions rather than split digit columns', () => {
  const lines = generateAutomatedPatterns([
    { id: 'd1', date: '2026-08-01', numbers: [12, 20, 30, 40, 42] },
    { id: 'd2', date: '2026-08-02', numbers: [5, 12, 25, 35, 41] }
  ], {
    showMatches: false,
    showDiagonalRuns: true,
    showCompleteNumbers: true
  });

  const sister = lines.find(line => line.patternType === 'sister');
  assert.ok(sister);
  assert.equal(sister.fromCellId, 'd1-b0-ones');
  assert.equal(sister.toCellId, 'd2-b1-ones');
  assert.equal(sister.label, 'Sister Shift: 12');
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
    showCompleteNumbers: false
  });

  const mathLines = lines.filter(line => line.patternType === 'math-sequence');
  assert.ok(mathLines.some(line => line.sequenceCellIds.join(',') === 'd1-b0-ones,d2-b0-ones,d3-b0-ones'));
  assert.ok(mathLines.some(line => line.sequenceCellIds.join(',') === 'd1-b1-ones,d2-b1-ones,d3-b1-ones'));
  assert.ok(mathLines.some(line => line.label.includes('11 − 3 = 8')));
  assert.ok(mathLines.some(line => line.label.includes('8 − 7 = 1')));
});

test('complete-number mathematical sequences use literal in-range addition and subtraction', () => {
  const lines = generateAutomatedPatterns([
    { id: 'd1', date: '2026-08-01', numbers: [12, 35] },
    { id: 'd2', date: '2026-08-02', numbers: [20, 12] },
    { id: 'd3', date: '2026-08-03', numbers: [32, 23] }
  ], {
    showMatches: false,
    showMathematicalSequences: true,
    showCompleteNumbers: true
  }).filter(line => line.patternType === 'math-sequence');

  assert.ok(lines.some(line => line.sequenceCellIds.join(',') === 'd1-b0-ones,d2-b0-ones,d3-b0-ones'
    && line.label.includes('12 + 20 = 32')));
  assert.ok(lines.some(line => line.sequenceCellIds.join(',') === 'd1-b1-ones,d2-b1-ones,d3-b1-ones'
    && line.label.includes('35 − 12 = 23')));
});

test('complete-number mathematics does not wrap out-of-range sums or use borrowed-digit results', () => {
  const wrapped = generateAutomatedPatterns([
    { id: 'd1', date: '2026-08-01', numbers: [30] },
    { id: 'd2', date: '2026-08-02', numbers: [20] },
    { id: 'd3', date: '2026-08-03', numbers: [8] }
  ], {
    showMatches: false,
    showMathematicalSequences: true,
    showCompleteNumbers: true
  });
  const borrowed = generateAutomatedPatterns([
    { id: 'd1', date: '2026-08-01', numbers: [7] },
    { id: 'd2', date: '2026-08-02', numbers: [8] },
    { id: 'd3', date: '2026-08-03', numbers: [9] }
  ], {
    showMatches: false,
    showMathematicalSequences: true,
    showCompleteNumbers: true
  });

  assert.equal(wrapped.filter(line => line.patternType === 'math-sequence').length, 0);
  assert.equal(borrowed.filter(line => line.patternType === 'math-sequence').length, 0);
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
    showCompleteNumbers: false
  });
  const mathLines = lines.filter(line => line.patternType === 'math-sequence');
  assert.equal(mathLines.length, 2);
  assert.ok(mathLines.every(line => line.overlapsSequence && line.style === 'dashed'));
});

test('diagonal mathematical sequences move one column consistently across three draws', () => {
  const draws = [
    { id: 'd1', date: '2026-08-17', numbers: [3, 2, 4, 6, 7], bonus: null },
    { id: 'd2', date: '2026-08-18', numbers: [9, 1, 5, 8, 6], bonus: null },
    { id: 'd3', date: '2026-08-19', numbers: [2, 4, 1, 7, 9], bonus: null }
  ];

  const lines = generateAutomatedPatterns(draws, {
    showMatches: false,
    showMathematicalSequences: false,
    showDiagonalMathematicalSequences: true,
    showCompleteNumbers: false
  });

  const diagonalLines = lines.filter(line => line.patternType === 'math-diagonal-sequence');
  assert.ok(diagonalLines.some(line => line.sequenceCellIds.join(',') === 'd1-b1-ones,d2-b2-ones,d3-b3-ones'));
  assert.ok(diagonalLines.some(line => line.sequenceCellIds.join(',') === 'd1-b4-ones,d2-b3-ones,d3-b2-ones'));
  assert.ok(diagonalLines.some(line => line.label.includes('2 + 5 = 7')));
  assert.ok(diagonalLines.some(line => line.label.includes('8 − 7 = 1')));
  assert.ok(diagonalLines.every(line => {
    const columns = line.sequenceCellIds.map(cellId => Number(cellId.match(/-b(\d+)-/)[1]));
    return columns[1] - columns[0] === columns[2] - columns[1]
      && Math.abs(columns[1] - columns[0]) === 1;
  }));
});

test('diagonal mathematical sequences remain off unless their overlay is enabled', () => {
  const draws = [
    { id: 'd1', date: '2026-08-17', numbers: [3, 2, 4, 6, 7], bonus: null },
    { id: 'd2', date: '2026-08-18', numbers: [9, 1, 5, 8, 6], bonus: null },
    { id: 'd3', date: '2026-08-19', numbers: [2, 4, 1, 7, 9], bonus: null }
  ];
  const lines = generateAutomatedPatterns(draws, {
    showMatches: false,
    showMathematicalSequences: true,
    showDiagonalMathematicalSequences: false,
    showCompleteNumbers: false
  });

  assert.ok(lines.every(line => line.patternType !== 'math-diagonal-sequence'));
});

test('sister-output sequences use two inline sources and a left or right output', () => {
  const draws = [
    { id: 'd1', date: '2026-08-17', numbers: [1, 2, 3], bonus: null },
    { id: 'd2', date: '2026-08-18', numbers: [2, 2, 5], bonus: null },
    { id: 'd3', date: '2026-08-19', numbers: [4, 8, 0], bonus: null }
  ];
  const lines = generateAutomatedPatterns(draws, {
    showMatches: false,
    showSisterOutputSequences: true,
    showCompleteNumbers: false
  });
  const sisterOutputs = lines.filter(line => line.patternType === 'math-sister-output');

  assert.ok(sisterOutputs.some(line => line.sequenceCellIds.join(',') === 'd1-b1-ones,d2-b1-ones,d3-b0-ones'));
  assert.ok(sisterOutputs.some(line => line.sequenceCellIds.join(',') === 'd1-b2-ones,d2-b2-ones,d3-b1-ones'));
  assert.ok(sisterOutputs.some(line => line.label.includes('2 + 2 = 4')));
  assert.ok(sisterOutputs.some(line => line.label.includes('3 + 5 = 8')));
  assert.ok(sisterOutputs.every(line => line.style === 'solid'
    && line.opacity === 0.6
    && line.renderThroughCells === true
    && line.hideNodeRings === true));
});

test('knight shifts connect the same digit two visible columns apart', () => {
  const lines = generateAutomatedPatterns([
    { id: 'd1', date: '2026-08-25', numbers: [2, 4, 13, 20, 39] },
    { id: 'd2', date: '2026-08-26', numbers: [14, 16, 19, 31, 41] }
  ], {
    showMatches: false,
    showKnightShifts: true,
    showCompleteNumbers: false
  });
  const knights = lines.filter(line => line.patternType === 'knight');
  assert.ok(knights.some(line => line.fromCellId === 'd1-b4-ones' && line.toCellId === 'd2-b2-ones'));
  assert.ok(knights.every(line => line.style === 'dashed'));
});

test('skip-row column runs ignore an intervening different digit', () => {
  const lines = generateAutomatedPatterns([
    { id: 'd1', date: '2026-08-18', numbers: [1, 8, 12, 33, 38] },
    { id: 'd2', date: '2026-08-19', numbers: [8, 11, 28, 32, 34] },
    { id: 'd3', date: '2026-08-20', numbers: [1, 3, 12, 23, 37] }
  ], {
    showMatches: false,
    showVerticalRuns: false,
    showSkipRowVerticals: true,
    showCompleteNumbers: false
  });
  const skips = lines.filter(line => line.patternType === 'skip-row-vertical');
  assert.ok(skips.some(line => line.fromCellId === 'd1-b0-ones' && line.toCellId === 'd3-b0-ones'));
  assert.ok(skips.some(line => line.fromCellId === 'd1-b2-ones' && line.toCellId === 'd3-b2-ones'));
  assert.equal(skips.filter(line => line.fromCellId === 'd1-b0-ones' && line.toCellId === 'd2-b0-ones').length, 0);
});

test('twin endings connect shared ones digits inside one draw', () => {
  [false, true].forEach(showCompleteNumbers => {
    const lines = generateAutomatedPatterns([
      { id: 'd1', date: '2026-08-28', numbers: [15, 25, 28, 30, 38] }
    ], {
      showMatches: false,
      showTwinEndings: true,
      showCompleteNumbers
    });
    const twins = lines.filter(line => line.patternType === 'twin-ending');
    assert.ok(twins.some(line => line.fromCellId === 'd1-b0-ones' && line.toCellId === 'd1-b1-ones' && line.label.includes('15') && line.label.includes('25')));
    assert.ok(twins.some(line => line.fromCellId === 'd1-b2-ones' && line.toCellId === 'd1-b4-ones'));
  });
});

test('consecutive pairs mark n and n+1 in the same draw', () => {
  [false, true].forEach(showCompleteNumbers => {
    const lines = generateAutomatedPatterns([
      { id: 'd1', date: '2026-08-21', numbers: [3, 22, 23, 24, 35] }
    ], {
      showMatches: false,
      showConsecutivePairs: true,
      showCompleteNumbers
    });
    const pairs = lines.filter(line => line.patternType === 'consecutive-pair');
    assert.ok(pairs.some(line => line.label.includes('22–23')));
    assert.ok(pairs.some(line => line.label.includes('23–24')));
  });
});

test('inverted L uses stacked column sources and a sister output', () => {
  const lines = generateAutomatedPatterns([
    { id: 'd1', date: '2026-08-23', numbers: [1, 13, 17, 40, 41] },
    { id: 'd2', date: '2026-08-24', numbers: [16, 17, 28, 33, 40] }
  ], {
    showMatches: false,
    showLPatterns: false,
    showInvertedLPatterns: true,
    showCompleteNumbers: false
  });
  const inverted = lines.filter(line => line.patternType === 'math-inverted-l');
  const example = inverted.find(line => line.sequenceCellIds.join(',') === 'd1-b0-ones,d2-b0-ones,d2-b1-ones');
  assert.ok(example);
  assert.equal(example.sequenceDirection, 'lower-right');
  assert.ok(example.label.includes('1 + 6 = 7'));
});

test('L patterns use adjacent same-draw sources and output below either endpoint', () => {
  const draws = [
    { id: 'd1', date: '2026-08-17', numbers: [1, 2, 3], bonus: null },
    { id: 'd2', date: '2026-08-18', numbers: [2, 2, 5], bonus: null },
    { id: 'd3', date: '2026-08-19', numbers: [4, 8, 0], bonus: null }
  ];
  const lines = generateAutomatedPatterns(draws, {
    showMatches: false,
    showLPatterns: true,
    showCompleteNumbers: false
  });
  const lPatterns = lines.filter(line => line.patternType === 'math-l-pattern');
  const example = lPatterns.find(line => line.sequenceCellIds.join(',') === 'd2-b0-ones,d2-b1-ones,d3-b0-ones');

  assert.ok(example);
  assert.deepEqual(example.sequencePathCellIds, ['d2-b1-ones', 'd2-b0-ones', 'd3-b0-ones']);
  assert.ok(example.label.includes('2 + 2 = 4'));
});

test('patterns can land on a partial Next drawing preview row', () => {
  const draws = [
    { id: 'd1', date: '2026-08-23', numbers: [1, 13, 17, 40, 41] },
    { id: 'preview-next-drawing', date: '2026-08-03', numbers: [16, 17, null, null, null] }
  ];
  const lines = generateAutomatedPatterns(draws, {
    showMatches: false,
    showInvertedLPatterns: true,
    showCompleteNumbers: false
  });
  const inverted = lines.filter(line => line.patternType === 'math-inverted-l');
  assert.ok(inverted.some(line => line.toCellId === 'preview-next-drawing-b1-ones'));

  const completeLines = generateAutomatedPatterns(draws, {
    showMatches: false,
    showInvertedLPatterns: true,
    showCompleteNumbers: true
  });
  assert.ok(completeLines.some(line => line.patternType === 'math-inverted-l'
    && line.toCellId === 'preview-next-drawing-b1-ones'
    && line.label.includes('1 + 16 = 17')));
});

test('Winning Patterns includes every established pattern ending on selected rows only', () => {
  const draws = [
    { id: 'd1', date: '2026-08-17', numbers: [1, 2, 3, 4, 5], bonus: null },
    { id: 'd2', date: '2026-08-18', numbers: [2, 2, 5, 4, 6], bonus: null },
    { id: 'd3', date: '2026-08-19', numbers: [4, 8, 0, 4, 7], bonus: null }
  ];
  const visibleSettings = { showCompleteNumbers: false, showMatches: false };
  const allPatterns = generateAutomatedPatterns(draws, {
    ...visibleSettings,
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
    showConsecutivePairs: true
  });
  const expectedIds = allPatterns
    .filter(line => line.toCellId.startsWith('d3-'))
    .map(line => line.id)
    .sort();
  const winningPatterns = generateAutomatedPatterns(draws, {
    ...visibleSettings,
    showWinningPatterns: true,
    winningPatternDrawIds: ['d3']
  });

  assert.ok(expectedIds.length > 0);
  assert.deepEqual(winningPatterns.map(line => line.id).sort(), expectedIds);
  assert.ok(winningPatterns.every(line => line.isWinningPattern
    && line.winningOutputDrawId === 'd3'
    && line.toCellId.startsWith('d3-')));
  assert.equal(generateAutomatedPatterns(draws, {
    ...visibleSettings,
    showWinningPatterns: true,
    winningPatternDrawIds: []
  }).length, 0);
});

test('Winning Patterns inherits complete-number semantics', () => {
  const lines = generateAutomatedPatterns([
    { id: 'd1', date: '2026-08-01', numbers: [11, 12, 13, 14, 15] },
    { id: 'd2', date: '2026-08-02', numbers: [11, 22, 23, 24, 25] }
  ], {
    showMatches: false,
    showWinningPatterns: true,
    winningPatternDrawIds: ['d2'],
    showCompleteNumbers: true
  });
  const matches = lines.filter(line => line.patternType === 'match');

  assert.ok(matches.some(line => line.fromCellId === 'd1-b0-ones'
    && line.toCellId === 'd2-b0-ones'
    && line.label === 'Number 11'));
  assert.ok(matches.every(line => !(line.fromCellId === 'd1-b1-ones' && line.toCellId === 'd2-b1-ones')));
  assert.ok(matches.every(line => line.isWinningPattern && line.winningOutputDrawId === 'd2'));
});
