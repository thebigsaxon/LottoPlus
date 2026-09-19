import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPivotWorkbench } from '../js/pivotWorkbench.js';
import { currentPoolDraft, togglePoolNumber, sanitizePoolSelections } from '../js/poolSelections.js';
import { savePoolSelection, rebuildPendingSystemRows, reconcileOfficialDraws, initializePredictionLedger, createDraftRow, autoSelectTensFilters } from '../js/sessionStore.js';
import { validateProject } from '../js/validation.js';

const draws = [{ id: 'source', date: '2026-09-04', numbers: [5, 8, 12, 28, 36] }];
const settings = { methodVersion: 2, chooser: 'manual', selectedPivots: [8] };
const board = buildPivotWorkbench(draws, settings);
const now = new Date('2026-09-05T14:00:00Z');
const withPicks = numbers => ({ sessions: [], poolPickDraft: { baselineDate: draws[0].date, selectedNumbers: numbers } });

test('pool picks toggle independently and are not limited to a five-number ticket', () => {
  let draft = null;
  for (const number of board.eligibleNumbers.slice(0, 7)) draft = togglePoolNumber(draft, board, number);
  assert.equal(draft.selectedNumbers.length, 7);
  draft = togglePoolNumber(draft, board, 2);
  assert.equal(draft.selectedNumbers.includes(2), false);
  assert.equal(draft.selectedNumbers.length, 6);
  assert.deepEqual(togglePoolNumber(draft, board, 41), draft);
});

test('changing pools filters the draft and the next drawing starts with no selected picks', () => {
  const draft = withPicks([2, 3, 10, 42]).poolPickDraft;
  const changed = { source: draws[0], eligibleNumbers: [3, 10, 20] };
  assert.deepEqual(currentPoolDraft(draft, changed).selectedNumbers, [3, 10]);
  assert.deepEqual(currentPoolDraft(draft, { ...board, source: { date: '2026-09-05' } }).selectedNumbers, []);
});

test('save freezes both the complete pool and selected subset; identical saves do not duplicate', () => {
  const saved = savePoolSelection(withPicks([42, 3, 3]), draws, settings, now);
  assert.equal(saved.added, true);
  assert.deepEqual(saved.selection.selectedNumbers, [3, 42]);
  assert.deepEqual(saved.selection.poolNumbers, board.eligibleNumbers);
  assert.equal(saved.session.baselineDate, '2026-09-04');
  assert.deepEqual(saved.workspace.poolPickDraft, {
    baselineDate: '2026-09-04',
    selectedNumbers: []
  });
  const again = savePoolSelection({ ...saved.workspace, poolPickDraft: withPicks([42, 3]).poolPickDraft }, draws, settings, now);
  assert.equal(again.added, false);
  assert.equal(again.session.poolSelections.length, 1);
  const rebuilt = rebuildPendingSystemRows(saved.workspace, draws, { methodVersion: 2, chooser: 'low' });
  assert.deepEqual(rebuilt.sessions[0].poolSelections, saved.session.poolSelections);
  assert.deepEqual(saved.selection.pivots, [8]);
});

test('whole pools can be saved without picks, and changed picks create a distinct saved record', () => {
  const first = savePoolSelection(withPicks([]), draws, settings, now);
  assert.deepEqual(first.selection.selectedNumbers, []);
  const second = savePoolSelection({ ...first.workspace, poolPickDraft: withPicks([3]).poolPickDraft }, draws, settings, now);
  assert.equal(second.session.poolSelections.length, 2);
  assert.notEqual(second.session.poolSelections[0].id, second.session.poolSelections[1].id);
  assert.deepEqual(second.session.poolSelections[0].selectedNumbers, []);
});

test('official results score saved picks and full pools separately, freezing the prior record', () => {
  const saved = savePoolSelection(withPicks([3, 10, 42]), draws, settings, now);
  const actual = { id: 'result', date: '2026-09-05', numbers: [3, 9, 14, 27, 42] };
  const reconciled = reconcileOfficialDraws(saved.workspace, draws, [...draws, actual], new Date('2026-09-06T01:00:00Z'));
  const scored = reconciled.workspace.sessions.find(session => session.baselineDate === '2026-09-04');
  assert.deepEqual(scored.poolSelections, saved.session.poolSelections);
  assert.deepEqual(scored.result.poolScores[0].selectedMatchedNumbers, [3, 42]);
  assert.deepEqual(scored.result.poolScores[0].poolMatchedNumbers, [3, 14, 42]);
  assert.equal(scored.result.rowScores.length, 3); // Pool coverage is not a ticket or prize tier.
  assert.throws(() => savePoolSelection({ ...saved.workspace, sessions: [scored] }, draws, settings, now), /already scored/);
  const rebuilt = rebuildPendingSystemRows(reconciled.workspace, [...draws, actual], { chooser: 'low' });
  assert.deepEqual(rebuilt.sessions.find(session => session.id === scored.id), scored);
});

test('project roundtrips preserve drafts, saved pool snapshots, and scored matches', () => {
  const saved = savePoolSelection(withPicks([3, 10, 42]), draws, settings, now);
  const actual = { id: 'result', date: '2026-09-05', numbers: [3, 9, 14, 27, 42] };
  const scored = reconcileOfficialDraws(saved.workspace, draws, [...draws, actual], now);
  const restored = validateProject(JSON.parse(JSON.stringify({ version: 4, gameType: 'cash5', draws: [...draws, actual], workspace: scored.workspace })));
  assert.equal(restored.valid, true);
  assert.equal(restored.workspace.poolPickDraft, null);
  const session = restored.workspace.sessions.find(item => item.baselineDate === '2026-09-04');
  assert.deepEqual(session.poolSelections, saved.session.poolSelections);
  assert.deepEqual(session.result.poolScores[0].selectedMatchedNumbers, [3, 42]);
});

test('invalid imported pool numbers are discarded and selections stay inside their saved pool', () => {
  const result = sanitizePoolSelections([{ poolNumbers: [2, '3', 3, 42, 43, 0, null, true, ''], selectedNumbers: [3, 10, 42, 43], pivots: [8, 8, -1, 12] }])[0];
  assert.deepEqual(result.poolNumbers, [2, 3, 42]);
  assert.deepEqual(result.selectedNumbers, [3, 42]);
  assert.deepEqual(result.pivots, [8]);
});

test('pending analyzer migration preserves saved pool snapshots', () => {
  const history = [{ id: 'prior', date: '2026-09-03', numbers: [2, 13, 26, 33, 36] }, ...draws];
  const saved = savePoolSelection(withPicks([3, 42]), history, settings, now);
  saved.session.analyzerVersion = 10;
  const migrated = initializePredictionLedger({ ...saved.workspace, predictionTracker: { version: 8 } }, history, now);
  assert.deepEqual(migrated.workspace.sessions.find(item => item.id === saved.session.id).poolSelections, saved.session.poolSelections);
});

test('updating draws preserves unsubmitted pool picks and both forms of user line through reopening', () => {
  const workspace = {
    ...withPicks([3, 10, 42]),
    slipNumbers: [3, 9, 14, 27, 42],
    slipTensFilters: [0, 0, 1, 2, 4],
    slipTensSources: Array(5).fill('automatic'),
    draftRows: [createDraftRow([1, 2, 3, 4, 5])]
  };
  const reopen = (state, history) => validateProject(JSON.parse(JSON.stringify({
    version: 4, draws: history, workspace: state
  }))).workspace;
  const restored = reopen(workspace, draws);
  const actual = { id: 'result', date: '2026-09-05', numbers: [3, 9, 14, 27, 42] };
  const later = { id: 'later', date: '2026-09-06', numbers: [1, 2, 4, 5, 6] };
  const history = [...draws, actual, later];
  const updated = reconcileOfficialDraws(restored, draws, history, now, settings);
  const scored = updated.workspace.sessions.find(session => session.baselineDate === draws[0].date);
  assert.deepEqual(scored.poolSelections[0].selectedNumbers, [3, 10, 42]);
  assert.deepEqual(scored.poolSelections[0].poolNumbers, board.eligibleNumbers);
  assert.deepEqual(scored.result.poolScores[0].selectedMatchedNumbers, [3, 42]);
  assert.equal(scored.result.date, actual.date);
  assert.deepEqual(scored.rows.filter(row => row.source === 'user').map(row => row.numbers), [
    [1, 2, 3, 4, 5], [3, 9, 14, 27, 42]
  ]);
  assert.deepEqual(scored.result.rowScores.filter(row => row.source === 'user').map(row => row.hits), [1, 5]);
  assert.deepEqual(updated.workspace.slipNumbers, Array(5).fill(null));
  assert.deepEqual(updated.workspace.draftRows, []);
  assert.equal(updated.workspace.poolPickDraft, null);
  assert.deepEqual(workspace.poolPickDraft.selectedNumbers, [3, 10, 42]);
  const reopened = reopen(updated.workspace, history);
  const saved = reopened.sessions.find(session => session.id === scored.id);
  assert.deepEqual(saved.poolSelections, scored.poolSelections);
  assert.deepEqual(saved.rows.filter(row => row.source === 'user').map(row => row.numbers), [[1, 2, 3, 4, 5], [3, 9, 14, 27, 42]]);
  const again = reconcileOfficialDraws(reopened, history, history, now, settings).workspace;
  assert.deepEqual(again.sessions, reopened.sessions);
  assert.ok(again.sessions.filter(session => session.baselineDate > draws[0].date)
    .every(session => !session.poolSelections?.length && session.rows.every(row => row.source === 'system')));
});

test('refreshing without new results retains visible picks and deduplicates saved selections', () => {
  const workspace = { ...withPicks([3, 42]), slipNumbers: [1, 2, 3, 4, 5], draftRows: [createDraftRow([1, 2, 3, 4, 5])] };
  const first = reconcileOfficialDraws(workspace, draws, draws, now, settings).workspace;
  const second = reconcileOfficialDraws(first, draws, draws, now, settings).workspace;
  assert.deepEqual(second.poolPickDraft, workspace.poolPickDraft);
  assert.deepEqual(second.slipNumbers, workspace.slipNumbers);
  assert.deepEqual(second.draftRows, workspace.draftRows);
  assert.equal(second.sessions[0].poolSelections.length, 1);
  assert.equal(second.sessions[0].rows.filter(row => row.source === 'user').length, 1);
  assert.deepEqual(reconcileOfficialDraws(workspace, draws, [], now, settings).workspace, workspace);
});

test('partial picks survive result updates and automatic range recalculation without becoming a ticket', () => {
  const workspace = { sessions: [], slipNumbers: [3, null, 22, null, 42], slipTensSources: Array(5).fill('automatic') };
  const actual = { id: 'result', date: '2026-09-05', numbers: [3, 9, 14, 27, 42] };
  const updated = reconcileOfficialDraws(workspace, draws, [...draws, actual], now, settings).workspace;
  assert.deepEqual(updated.slipNumbers, workspace.slipNumbers);
  assert.ok(updated.sessions.every(session => session.rows.every(row => row.source === 'system')));
  const ranges = autoSelectTensFilters(updated, [...draws, actual]);
  for (const [column, number] of [[0, 3], [2, 22], [4, 42]]) {
    assert.equal(ranges.tensSources[column], 'manual');
    assert.equal(ranges.tensFilters[column], Math.floor(number / 10));
  }
});
