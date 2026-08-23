import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCandidateState, createDraftRow, editSessionInBuilder, finalizeSession, formatSessionForMessage, scoreSession, validateTicketRow } from '../js/sessionStore.js';

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

test('ticket rows apply each game range', () => {
  assert.equal(validateTicketRow([1, 2, 3, 4, 5]).valid, true);
  assert.equal(validateTicketRow([1, 1, 2, 3, 4]).valid, false);
  assert.equal(validateTicketRow([1, 2, 3, 4, 43], 'cash5').valid, true);
  assert.equal(validateTicketRow([1, 2, 3, 4, 31], 'treasureHunt').valid, false);
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

test('locked slips format cleanly for the active game', () => {
  const session = finalizeSession({ fullCandidates: [], draftRows: [
    createDraftRow([1, 5, 12, 23, 42]),
    createDraftRow([2, 9, 17, 31, 40])
  ] }, { id: 'base', date: '2026-01-10' }, new Date('2026-01-10T12:00:00Z'));
  assert.equal(formatSessionForMessage(session), [
    'Cash 5 slips — next draw after 2026-01-10',
    'Row 1: 01 - 05 - 12 - 23 - 42',
    'Row 2: 02 - 09 - 17 - 31 - 40'
  ].join('\n'));

  const treasure = finalizeSession({ fullCandidates: [], draftRows: [
    createDraftRow([1, 5, 12, 23, 30], 'uncertain', '', 'treasureHunt')
  ] }, { id: 'th-base', date: '2026-01-10' }, new Date('2026-01-10T12:00:00Z'), 'treasureHunt');
  assert.match(formatSessionForMessage(treasure), /^Treasure Hunt slips/);
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
