import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHTML, validateDraw, validateProject } from '../js/validation.js';

test('escapeHTML sanitizes dangerous HTML injection strings', () => {
  const malformed = '<script>alert("xss")</script>&\'"';
  const sanitized = escapeHTML(malformed);
  assert.equal(sanitized, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&#039;&quot;');
});

test('validateDraw passes for valid Cash 5 draw', () => {
  const draw = {
    id: 'c5-test-1',
    date: '2026-08-01',
    numbers: [5, 12, 23, 34, 41],
    bonus: null
  };
  const res = validateDraw(draw);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
  assert.equal(res.draw.id, 'c5-test-1');
  assert.deepEqual(res.draw.numbers, [5, 12, 23, 34, 41]);
});

test('validateDraw rejects out-of-range main numbers', () => {
  const draw = {
    id: 'cash5-invalid',
    date: '2026-08-01',
    numbers: [5, 12, 23, 34, 99]
  };
  const res = validateDraw(draw);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('out of range')));
});

test('validateDraw requires exactly five unique main balls', () => {
  const duplicate = validateDraw({
    id: 'duplicate',
    date: '2026-08-01',
    numbers: [5, 5, 12, 23, 34]
  });
  const tooMany = validateDraw({
    id: 'too-many',
    date: '2026-08-01',
    numbers: [1, 2, 3, 4, 5, 6]
  });

  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.errors.some(e => e.includes('unique')));
  assert.equal(tooMany.valid, false);
  assert.ok(tooMany.errors.some(e => e.includes('exactly 5')));
});

test('validateDraw rejects partial integers and impossible dates', () => {
  const partialInteger = validateDraw({
    id: 'partial-integer',
    date: '2026-08-01',
    numbers: ['12abc', 13, 14, 15, 16]
  });
  const impossibleDate = validateDraw({
    id: 'impossible-date',
    date: '2026-02-30',
    numbers: [1, 2, 3, 4, 5]
  });

  assert.equal(partialInteger.valid, false);
  assert.ok(partialInteger.errors.some(e => e.includes('Invalid main ball')));
  assert.equal(impossibleDate.valid, false);
  assert.ok(impossibleDate.errors.some(e => e.includes('Invalid date')));
});

test('validateProject filters out invalid draws and validates project structure', () => {
  const projectData = {
    appName: 'LottoPlus',
    gameType: 'cash5',
    draws: [
      { id: '1', date: '2026-08-01', numbers: [1, 2, 3, 4, 5] },
      { id: '2', date: '2026-08-02', numbers: ['invalid', 'numbers'] }, // Bad draw
      { id: '3', date: '2026-08-03', numbers: [10, 20, 30, 40, 42] }
    ],
    manualLines: [
      { fromCellId: '1-b0-tens', toCellId: '3-b0-tens' },
      { fromCellId: '1-b1-tens', toCellId: '1-b1-ones' }
    ]
  };

  const res = validateProject(projectData);
  assert.equal(res.valid, true);
  assert.equal(res.validDraws.length, 2);
  assert.equal(res.manualLines.length, 1);
  assert.equal(res.manualLines[0].fromCellId, '1-b0-ones');
  assert.equal(res.manualLines[0].toCellId, '3-b0-ones');
  assert.equal(res.errors.length, 1);
});

test('validateProject remains compatible with legacy files and sanitizes version 2 workspace data', () => {
  const legacy = validateProject({
    gameType: 'cash5',
    draws: [{ id: '1', date: '2026-08-01', numbers: [1, 2, 3, 4, 5] }]
  });
  assert.equal(legacy.valid, true);
  assert.equal(legacy.workspace, null);

  const versionTwo = validateProject({
    version: 2,
    gameType: 'cash5',
    draws: [{ id: '1', date: '2026-08-01', numbers: [1, 2, 3, 4, 5] }],
    workspace: {
      futureDigitMap: [{ column: 2, digit: 5 }, { column: 2, digit: 7 }, { column: 9, digit: 4 }],
      activeFutureCell: { column: 2, digit: 5 },
      candidateDigits: [1, 1, 12],
      selectedEvidenceDigit: 1,
      fullCandidates: [1, 11, 99],
      slipNumbers: [1, null, 23, null, 42],
      systemSlipNumbers: [2, null, 27, null, 5],
      slipTensFilters: [0, null, 2, 8, 4],
      draftRows: [{ id: 'r1', numbers: [1, 2, 3, 4, 5], label: 'strong' }],
      sessions: []
    }
  });
  assert.deepEqual(versionTwo.workspace.candidateDigits, [1]);
  assert.deepEqual(versionTwo.workspace.futureDigitMap, [{ column: 2, digit: 5 }]);
  assert.deepEqual(versionTwo.workspace.activeFutureCell, { column: 2, digit: 5 });
  assert.deepEqual(versionTwo.workspace.fullCandidates, [1, 11]);
  assert.deepEqual(versionTwo.workspace.slipNumbers, [1, null, 23, null, 42]);
  assert.deepEqual(versionTwo.workspace.systemSlipNumbers, [2, null, 27, null, 5]);
  assert.deepEqual(versionTwo.workspace.slipTensFilters, [0, null, 2, null, 4]);
  assert.equal(versionTwo.workspace.draftRows.length, 1);
});

test('validation removes the legacy digit-only leak from the extra line', () => {
  const result = validateProject({
    gameType: 'cash5',
    draws: [{ id: '1', date: '2026-08-01', numbers: [1, 2, 3, 4, 5] }],
    workspace: {
      futureDigitMap: [
        { column: 0, digit: 3 },
        { column: 1, digit: 2 },
        { column: 2, digit: 7 },
        { column: 3, digit: 8 },
        { column: 4, digit: 5 }
      ],
      slipNumbers: [3, 2, 7, 8, 5],
      rowBuilder: [3, 2, 7, 8, 5]
    }
  });

  assert.deepEqual(result.workspace.slipNumbers, [null, null, null, null, null]);
});

test('validateProject accepts version 3 documents and rejects retired game projects', () => {
  const current = validateProject({
    appName: 'Cash 5 Studio',
    version: 3,
    draws: [{ id: 'c5', date: '2026-08-01', numbers: [1, 2, 3, 4, 5] }],
    workspace: {}
  });
  assert.equal(current.valid, true);
  assert.equal(current.validDraws.length, 1);

  const retired = validateProject({
    appName: 'LottoPlus',
    version: 2,
    gameType: 'powerball',
    draws: [{ id: 'pb', date: '2026-08-01', numbers: [1, 2, 3, 4, 5], bonus: 6 }]
  });
  assert.equal(retired.valid, false);
  assert.match(retired.errors[0], /does not support/);
});

test('validateProject preserves version 4 prediction sessions and manual Any tens choices', () => {
  const current = validateProject({
    appName: 'Cash 5 Studio',
    version: 4,
    draws: [
      { id: 'base', date: '2026-08-01', numbers: [1, 12, 23, 34, 41] },
      { id: 'actual', date: '2026-08-02', numbers: [2, 13, 24, 35, 42] }
    ],
    workspace: {
      nextDrawingPreviewHidden: true,
      slipTensFilters: [null, 1, 2, 3, 4],
      slipTensSources: ['manual', 'manual', 'automatic', 'empty', 'automatic'],
      predictionTracker: { version: 1, initializedAt: '2026-08-01T00:00:00Z', latestOfficialDrawDate: '2026-08-02' },
      sessions: [{
        id: 'prediction-base',
        kind: 'prediction',
        status: 'scored',
        trackingVersion: 1,
        baselineDrawId: 'base',
        baselineDate: '2026-08-01',
        historyDrawCount: 20,
        rows: [{ id: 'rank-1', source: 'system', rank: 1, available: true, numbers: [1, 12, 23, 34, 41] }],
        patternSignals: [{
          id: 'signal-1', pattern: 'inline', operation: 'add', code: 'IM:+', digit: 2,
          targetColumn: 0, sourceColumns: [0, 0], explanation: '1 + 1 = 2', reliability: 0.5
        }],
        result: {
          drawId: 'actual', date: '2026-08-02', numbers: [2, 13, 24, 35, 42],
          rowScores: [{ rowId: 'rank-1', source: 'system', rank: 1, available: true, hits: 0, misses: 5 }],
          patternSignalScores: [{
            signalId: 'signal-1', pattern: 'inline', operation: 'add', code: 'IM:+',
            targetColumn: 0, predictedDigit: 2, actualDigit: 2, hit: true
          }]
        }
      }]
    }
  });
  assert.equal(current.valid, true);
  assert.equal(current.workspace.nextDrawingPreviewHidden, true);
  assert.deepEqual(current.workspace.slipTensSources, ['manual', 'manual', 'automatic', 'empty', 'automatic']);
  assert.equal(current.workspace.slipTensFilters[0], null);
  assert.equal(current.workspace.predictionTracker.version, 1);
  assert.equal(current.workspace.sessions[0].kind, 'prediction');
  assert.equal(current.workspace.sessions[0].rows[0].source, 'system');
  assert.equal(current.workspace.sessions[0].patternSignals[0].code, 'IM:+');
  assert.equal(current.workspace.sessions[0].result.patternSignalScores[0].hit, true);
});

test('validateProject restores v7 evidence policy and component probabilities while accepting legacy scores', () => {
  const validated = validateProject({
    appName: 'Cash 5 Studio',
    version: 4,
    draws: [{ id: 'base', date: '2026-08-28', numbers: [1, 12, 23, 34, 42] }],
    workspace: {
      sessions: [{
        id: 'prediction-base',
        kind: 'prediction',
        trackingVersion: 6,
        analyzerVersion: 7,
        analyzerPolicy: {
          kind: 'evidence', priorStrength: 10, comboWeight: 0.7, historyWeight: 0.2,
          patternWeight: 0.05, stateWeight: 0.05, recencyHalfLife: 12,
          evidenceId: 'v7-ending-consensus-2026-08-29'
        },
        status: 'pending',
        baselineDate: '2026-08-28',
        rows: [{
          id: 'system-rank-1', source: 'system', rank: 1, available: true,
          numbers: [1, 12, 23, 34, 42],
          selectionScore: {
            combined: 1.25, pattern: 0, stream: 0,
            exactExpected: 1.25, endingExpected: 2.5, tensExpected: 3.1
          },
          candidateEvidence: [{
            column: 0, number: 1, digit: 1,
            comboProbability: 0.12, empiricalProbability: 0.1,
            modelProbability: 0.12, endingProbability: 0.2, tensProbability: 0.3,
            comboEndingProbability: 0.11, historyProbability: 0.18,
            patternProbability: 0.21, stateProbability: 0.16,
            combinedScore: 12, patternScore: 0
          }]
        }],
        patternSignals: []
      }]
    }
  });

  const [session] = validated.workspace.sessions;
  assert.deepEqual(session.analyzerPolicy, {
    kind: 'evidence', priorStrength: 10, patternWeight: 0.05, stateWeight: 0.05,
    comboWeight: 0.7, historyWeight: 0.2, recencyHalfLife: 12,
    evidenceId: 'v7-ending-consensus-2026-08-29'
  });
  assert.equal(session.rows[0].selectionScore.exactExpected, 1.25);
  assert.equal(session.rows[0].candidateEvidence[0].modelProbability, 0.12);
  assert.equal(session.rows[0].candidateEvidence[0].tensProbability, 0.3);
  assert.equal(session.rows[0].candidateEvidence[0].historyProbability, 0.18);
  assert.equal(session.rows[0].candidateEvidence[0].stateProbability, 0.16);
});
