import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_CASH_5 } from '../js/sampleData.js';
import {
  appendDraftRowsToPendingSession,
  autoSelectTensFilters,
  clearCandidateState,
  createDraftRow,
  createPredictionSession,
  editSessionInBuilder,
  finalizeSession,
  formatSessionForMessage,
  initializePredictionLedger,
  reconcileOfficialDraws,
  refreshPredictionSessionScores,
  scorePredictionSession,
  scoreSession,
  summarizePredictionHistory,
  validateTicketRow
} from '../js/sessionStore.js';

test('clearing candidates preserves completed rows and locked sessions', () => {
  const draftRows = [{ id: 'draft-1', numbers: [1, 2, 3, 4, 5] }];
  const sessions = [{ id: 'session-1', status: 'locked' }];
  const cleared = clearCandidateState({
    candidateDigits: [1, 2],
    selectedEvidenceDigit: 2,
    fullCandidates: [2, 12],
    rowBuilder: [2, 12],
    slipNumbers: [2, 12, null, null, null],
    draftRows,
    sessions
  });

  assert.deepEqual(cleared.candidateDigits, []);
  assert.equal(cleared.selectedEvidenceDigit, null);
  assert.deepEqual(cleared.fullCandidates, []);
  assert.deepEqual(cleared.rowBuilder, []);
  assert.deepEqual(cleared.slipNumbers, [2, 12, null, null, null]);
  assert.equal(cleared.draftRows, draftRows);
  assert.equal(cleared.sessions, sessions);
});

test('ticket rows require five unique Cash 5 numbers', () => {
  assert.equal(validateTicketRow([1, 2, 3, 4, 5]).valid, true);
  assert.equal(validateTicketRow([1, 1, 2, 3, 4]).valid, false);
  assert.equal(validateTicketRow([1, 2, 3, 4, 43]).valid, false);
});

test('finalized snapshot is independent from later draft mutations', () => {
  const row = createDraftRow([5, 1, 4, 3, 2], 'strong', 'good shape');
  const workspace = { candidateDigits: [1], fullCandidates: [1, 2, 3, 4, 5], draftRows: [row] };
  const session = finalizeSession(workspace, { id: 'latest', date: '2026-01-10' }, new Date('2026-01-10T12:00:00Z'));
  workspace.draftRows[0].numbers[0] = 42;
  assert.deepEqual(session.rows[0].numbers, [1, 2, 3, 4, 5]);
});

test('session scores against the first draw after its baseline', () => {
  const row = createDraftRow([1, 2, 3, 4, 5]);
  const session = finalizeSession({ fullCandidates: [1, 2, 9], draftRows: [row] }, { id: 'base', date: '2026-01-10' }, new Date('2026-01-10T12:00:00Z'));
  assert.deepEqual(session.candidateDigits, []);
  assert.deepEqual(session.fullCandidates, []);
  const scored = scoreSession(session, [
    { id: 'later', date: '2026-01-12', numbers: [10, 11, 12, 13, 14] },
    { id: 'next', date: '2026-01-11', numbers: [1, 2, 6, 7, 8] }
  ]);
  assert.equal(scored.result.drawId, 'next');
  assert.equal(scored.result.candidateHits, 0);
  assert.equal(scored.result.rowScores[0].hits, 2);
});

test('locked slips format cleanly for copying into iMessage', () => {
  const session = finalizeSession({ fullCandidates: [], draftRows: [
    createDraftRow([1, 5, 12, 23, 42]),
    createDraftRow([2, 9, 17, 31, 40])
  ] }, { id: 'base', date: '2026-01-10' }, new Date('2026-01-10T12:00:00Z'));
  assert.equal(formatSessionForMessage(session), [
    'Cash 5 slips — next draw after 2026-01-10',
    'Row 1: 01 - 05 - 12 - 23 - 42',
    'Row 2: 02 - 09 - 17 - 31 - 40'
  ].join('\n'));
});

test('pending sessions return to the Ticket Builder while scored sessions are copied', () => {
  const row = createDraftRow([1, 5, 12, 23, 42]);
  const pending = finalizeSession({ fullCandidates: [], draftRows: [row] }, { id: 'base', date: '2026-01-10' });
  const pendingEdit = editSessionInBuilder({ draftRows: [], sessions: [pending] }, pending.id, 123);
  assert.equal(pendingEdit.sessions.length, 0);
  assert.deepEqual(pendingEdit.draftRows[0].numbers, row.numbers);

  const scored = { ...pending, status: 'scored', result: { numbers: [1, 2, 3, 4, 5] } };
  const scoredEdit = editSessionInBuilder({ draftRows: [], sessions: [scored] }, scored.id, 123);
  assert.equal(scoredEdit.sessions.length, 1);
  assert.equal(scoredEdit.draftRows[0].id, 'row-123-0');
});

test('prediction ledger backfills ten scored dates and leaves one pending without leakage', () => {
  const initialized = initializePredictionLedger({ sessions: [] }, SAMPLE_CASH_5, new Date('2026-08-05T00:00:00Z'));
  const sessions = initialized.workspace.sessions;
  assert.equal(initialized.initialized, true);
  assert.equal(sessions.length, 11);
  assert.equal(sessions.filter(session => session.result).length, 10);
  assert.equal(sessions.filter(session => !session.result).length, 1);
  assert.equal(sessions[0].baselineDate, '2026-08-04');
  assert.equal(sessions[0].status, 'pending');
  assert.equal(initialized.workspace.predictionTracker.version, 4);
  assert.ok(sessions.every(session => session.analyzerVersion === 5));

  const chronological = [...SAMPLE_CASH_5].sort((a, b) => a.date.localeCompare(b.date));
  const historical = sessions.find(session => session.baselineDate === '2026-07-25');
  const prefix = chronological.filter(draw => draw.date <= historical.baselineDate);
  const rebuilt = createPredictionSession(prefix, { creationSource: 'test' });
  assert.deepEqual(historical.rows, rebuilt.rows);
  assert.deepEqual(historical.patternSignals, rebuilt.patternSignals);
  assert.equal(historical.historyDrawCount, 25);
  assert.equal(historical.result.date, '2026-07-26');

  const secondPass = initializePredictionLedger(initialized.workspace, SAMPLE_CASH_5);
  assert.equal(secondPass.initialized, false);
  assert.equal(secondPass.workspace.sessions.length, 11);
});

test('system rows use deterministic optimized lines and expose sparse history as unavailable', () => {
  const first = createPredictionSession(SAMPLE_CASH_5);
  const second = createPredictionSession([...SAMPLE_CASH_5].reverse());
  assert.deepEqual(first.rows, second.rows);
  first.rows.filter(row => row.available).forEach(row => {
    assert.equal(row.analyzerVersion, 5);
    assert.equal(row.numbers.length, 5);
    assert.equal(new Set(row.numbers).size, 5);
    assert.ok(row.numbers.every((number, index) => index === 0 || number > row.numbers[index - 1]));
    assert.deepEqual(row.numbers.map(number => number % 10), row.digits);
    assert.deepEqual(row.numbers.map(number => Math.floor(number / 10)), row.tensBands);
    const endingCounts = row.digits.reduce((counts, digit) => counts.set(digit, (counts.get(digit) || 0) + 1), new Map());
    assert.ok(Math.max(...endingCounts.values()) <= 2);
  });
  assert.equal(new Set(first.rows.filter(row => row.available).flatMap(row => row.numbers)).size, 15);
  for (let column = 0; column < 5; column += 1) {
    assert.equal(new Set(first.rows.filter(row => row.available).map(row => row.digits[column])).size, 3);
  }

  const sparse = createPredictionSession([
    { id: 'same-digits', date: '2026-08-01', numbers: [1, 11, 21, 31, 41] }
  ]);
  assert.equal(sparse.rows[2].available, false);
  assert.match(sparse.rows[2].unavailableReason, /requires.*history/i);
});

test('model-v5 migration preserves scored sessions and user rows while rebuilding pending system lines', () => {
  const latest = [...SAMPLE_CASH_5].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const userRow = createDraftRow([1, 5, 12, 23, 42], 'strong', 'preserve me');
  const scoredV1 = {
    id: 'scored-v1', kind: 'prediction', trackingVersion: 1, analyzerVersion: 1,
    status: 'scored', baselineDate: '2026-08-02', rows: [], patternSignals: [],
    result: { date: '2026-08-03', numbers: [11, 23, 25, 37, 42], rowScores: [], patternSignalScores: [] }
  };
  const pendingV1 = {
    id: 'pending-v4', kind: 'prediction', trackingVersion: 3, analyzerVersion: 4,
    status: 'pending', baselineDate: latest.date, baselineDrawId: latest.id,
    finalizedAt: '2026-08-04T23:00:00.000Z', rows: [
      { id: 'old-system', source: 'system', rank: 1, available: false, numbers: [], digits: [] },
      userRow
    ], patternSignals: [], result: null
  };
  const workspace = {
    sessions: [pendingV1, scoredV1],
    predictionTracker: { version: 3, initializedAt: '2026-08-01T00:00:00.000Z' }
  };
  const migrated = initializePredictionLedger(workspace, SAMPLE_CASH_5, new Date('2026-08-05T00:00:00.000Z'));
  assert.equal(migrated.workspace.predictionTracker.version, 4);
  assert.deepEqual(migrated.workspace.sessions.find(session => session.id === scoredV1.id), scoredV1);
  const pending = migrated.workspace.sessions.find(session => session.id === pendingV1.id);
  assert.equal(pending.analyzerVersion, 5);
  assert.equal(pending.rows.filter(row => row.source === 'system').length, 3);
  assert.deepEqual(pending.rows.find(row => row.source !== 'system').numbers, userRow.numbers);
  assert.equal(pending.rows.find(row => row.source !== 'system').note, 'preserve me');
});

test('prediction scoring records exact, ending, tens, and every signal outcome', () => {
  const session = {
    id: 'prediction-base',
    kind: 'prediction',
    status: 'pending',
    baselineDate: '2026-08-01',
    rows: [{
      id: 'system-rank-1', source: 'system', rank: 1, available: true,
      numbers: [1, 12, 23, 34, 41]
    }],
    patternSignals: [
      { id: 'signal-win', pattern: 'inline', operation: 'add', code: 'IM:+', targetColumn: 0, digit: 1 },
      { id: 'signal-loss', pattern: 'diagonal', operation: 'subtract', code: 'DM:−A', targetColumn: 1, digit: 2 }
    ]
  };
  const scored = scorePredictionSession(session, {
    id: 'actual', date: '2026-08-02', numbers: [1, 15, 23, 37, 42]
  });
  const row = scored.result.rowScores[0];
  assert.equal(row.hits, 2);
  assert.equal(row.matchRate, 0.4);
  assert.equal(row.missRate, 0.6);
  assert.equal(row.endingHits, 2);
  assert.equal(row.tensHits, 5);
  assert.equal(row.positions[1].diagnostic, 'tens right / ending wrong');
  assert.deepEqual(scored.result.patternSignalScores.map(item => item.hit), [true, false]);
  assert.equal(scored.result.patternSummary.families.find(item => item.pattern === 'inline').hits, 1);
});

test('ticket matches count and highlight a drawn number even when its sorted Ball position shifts', () => {
  const session = {
    id: 'prediction-shifted-match',
    kind: 'prediction',
    status: 'pending',
    baselineDate: '2026-08-25',
    rows: [{
      id: 'system-rank-2', source: 'system', rank: 2, available: true,
      numbers: [4, 11, 21, 30, 31]
    }],
    patternSignals: []
  };
  const scored = scorePredictionSession(session, {
    id: 'actual', date: '2026-08-26', numbers: [14, 16, 19, 31, 41]
  });
  const row = scored.result.rowScores[0];
  assert.equal(row.hits, 1);
  assert.equal(row.exactPositionHits, 0);
  assert.deepEqual(row.matchedNumbers, [31]);
  assert.equal(row.positions[4].numberHit, true);
  assert.equal(row.positions[4].matchedColumn, 3);
  assert.equal(row.positions[4].diagnostic, 'number drawn in Ball 4');

  const persistedWithOldScore = {
    ...scored,
    result: { ...scored.result, rowScores: [{ rowId: 'system-rank-2', hits: 0 }] }
  };
  const refreshed = refreshPredictionSessionScores([persistedWithOldScore])[0];
  assert.equal(refreshed.result.rowScores[0].hits, 1);
});

test('official reconciliation processes multiple unseen draws and leaves one pending session', () => {
  const initialized = initializePredictionLedger({ sessions: [] }, SAMPLE_CASH_5).workspace;
  const additions = [
    { id: 'c5-new-1', date: '2026-08-05', numbers: [2, 7, 18, 29, 40] },
    { id: 'c5-new-2', date: '2026-08-06', numbers: [3, 9, 20, 31, 42] }
  ];
  const official = [...SAMPLE_CASH_5, ...additions];
  const reconciled = reconcileOfficialDraws(initialized, SAMPLE_CASH_5, official, new Date('2026-08-06T23:00:00Z'));
  assert.deepEqual(reconciled.processedDraws.map(draw => draw.date), ['2026-08-05', '2026-08-06']);
  const sessions = reconciled.workspace.sessions;
  assert.equal(sessions.filter(session => session.kind === 'prediction' && !session.result).length, 1);
  assert.equal(sessions.find(session => session.baselineDate === '2026-08-04').result.date, '2026-08-05');
  assert.equal(sessions.find(session => session.baselineDate === '2026-08-05').result.date, '2026-08-06');
  assert.equal(sessions[0].baselineDate, '2026-08-06');
});

test('user lines append to the active prediction and duplicate rows are ignored', () => {
  const initialized = initializePredictionLedger({ sessions: [] }, SAMPLE_CASH_5).workspace;
  const latest = [...SAMPLE_CASH_5].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const draft = createDraftRow([1, 5, 12, 23, 42], 'strong', 'mine', {
    tensFilters: [0, 0, 1, 2, 4],
    tensSources: ['automatic', 'manual', 'automatic', 'manual', 'manual']
  });
  const first = appendDraftRowsToPendingSession({ ...initialized, draftRows: [draft] }, latest, SAMPLE_CASH_5);
  assert.equal(first.addedCount, 1);
  assert.equal(first.session.rows.filter(row => row.source === 'user').length, 1);
  const duplicate = appendDraftRowsToPendingSession({ ...first.workspace, draftRows: [draft] }, latest, SAMPLE_CASH_5);
  assert.equal(duplicate.addedCount, 0);
  assert.equal(duplicate.session.rows.filter(row => row.source === 'user').length, 1);
});

test('automatic tens preserve manual bands and a manual Any tens choice', () => {
  const selected = autoSelectTensFilters({
    futureDigitMap: [{ column: 2, digit: 3 }],
    slipNumbers: [null, null, null, null, null],
    slipTensFilters: [null, 1, null, null, null],
    slipTensSources: ['manual', 'manual', 'empty', 'automatic', 'empty']
  }, SAMPLE_CASH_5);
  assert.equal(selected.tensSources[0], 'manual');
  assert.equal(selected.tensFilters[0], null);
  assert.equal(selected.tensSources[1], 'manual');
  assert.equal(selected.tensFilters[1], 1);
  assert.ok(selected.tensSources.slice(2).every(source => source === 'automatic'));
});

test('historical summary separates system ranks from user lines', () => {
  const initialized = initializePredictionLedger({ sessions: [] }, SAMPLE_CASH_5).workspace;
  const summary = summarizePredictionHistory(initialized.sessions);
  assert.equal(summary.groups.find(group => group.key === 'system-1').trials, 50);
  assert.equal(summary.groups.find(group => group.key === 'user').trials, 0);
  assert.ok(summary.patterns.families.length >= 7);
  assert.ok(summary.patterns.families.every(item => item.hits <= item.trials));
});
