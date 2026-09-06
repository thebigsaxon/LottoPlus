import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeAutomaticPivot, cleanPivotHistory, buildAutomaticPool, scoreAutomaticPivot, sanitizeAutomaticSelection } from '../js/automaticPivot.js';
import { buildPivotWorkbench, automaticSelectionForDraw, migrateLiveWorkbenchSettings } from '../js/pivotWorkbench.js';
import { evaluateWinningPivotPair } from '../js/pivotPools.js';
import { createPredictionSession, savePoolSelection, reconcileOfficialDraws, rebuildPendingSystemRows } from '../js/sessionStore.js';
import { validateProject } from '../js/validation.js';
const archive = JSON.parse(await readFile(new URL('./fixtures/cash5-history.json', import.meta.url), 'utf8')).draws;

test('automatic defaults replace old live chooser preferences once, preserving explicit later overrides', () => {
  const migrated = migrateLiveWorkbenchSettings({ methodVersion: 2, chooser: 'manual', selectedPivots: [8] });
  assert.equal(migrated.chooser, 'auto');
  assert.equal(migrateLiveWorkbenchSettings({ ...migrated, chooser: 'low' }).chooser, 'low');
  const board = buildPivotWorkbench(archive.slice(-50));
  assert.equal(board.settings.chooser, 'auto');
  assert.ok(board.activePivots.length >= 1 && board.activePivots.length <= 2);
  assert.ok(board.activePivots.every(d => board.source.digits.includes(d)));
  assert.ok(board.eligibleNumbers.length > 0);
});

test('archive and loaded future results cannot enter a forecast for an earlier source date', () => {
  const source = archive[100];
  const expected = analyzeAutomaticPivot(archive.slice(0, 101));
  const futureChanged = archive.map((d, i) => i > 100 ? { ...d, numbers: [1, 2, 3, 4, 5] } : d);
  assert.deepEqual(automaticSelectionForDraw(futureChanged, source.date), expected);
  assert.deepEqual(buildPivotWorkbench(archive.slice(80, 101)).automaticSelection, expected);
  assert.equal(expected.historyDraws, 101);
  assert.equal(expected.completedPairs, 100);
  assert.equal(expected.validation.through, source.date);
});

test('loaded corrections replace archive records on the same date and invalid rows cannot train the model', () => {
  const last = archive.at(-1);
  const replacement = { ...last, numbers: [1, 2, 3, 4, 5] };
  const result = automaticSelectionForDraw([replacement], last.date);
  assert.equal(result.historyDraws, archive.length);
  assert.deepEqual(result.sourceNumbers, replacement.numbers);
  const clean = cleanPivotHistory([archive[0], archive[0],
    { date: '2026-02-30', numbers: [1, 2, 3, 4, 5] },
    { date: '2026-99-99', numbers: [1, 2, 3, 4, 5] },
    { date: '2026-09-01', numbers: [1, 1, 3, 4, 5] },
    { date: '2026-09-02', numbers: [1, 2, 3, 4, 43] },
    { ...last, preview: true }]);
  assert.equal(clean.length, 1);
});

test('missing days do not count as completed next-draw pairs or continue a recurrence chain', () => {
  const estimate = analyzeAutomaticPivot([archive[0], archive[1], archive[4]]);
  assert.equal(estimate.completedPairs, 1);
  assert.deepEqual(estimate.recentWinners, []);
  assert.equal(estimate.validation.trials, 0);
  assert.equal(estimate.method, 'historical-baseline');
});

test('automatic pool and its retrospective score use identical Winning Pivot arithmetic', () => {
  const source = { date: '2026-09-04', numbers: [5, 8, 12, 28, 36] };
  const target = { date: '2026-09-05', numbers: [3, 9, 14, 27, 42] };
  const evaluation = evaluateWinningPivotPair(source, target);
  for (const candidate of evaluation.candidates) {
    const pool = buildAutomaticPool(source.numbers, [candidate.digit]);
    assert.deepEqual(pool.digits, candidate.digits);
    const saved = { sourceDate: source.date, sourceNumbers: source.numbers, pivots: [candidate.digit] };
    const score = scoreAutomaticPivot(saved, target);
    assert.equal(score.matchedNumbers.length, candidate.hitCount);
    assert.equal(score.pickedWinningPivot, candidate.isWinner);
  }
  // Repeated 8 contributes an ending 6 from 8 + 8 and ending 0 from 8 − 8.
  const repeated = buildAutomaticPool(source.numbers, [8]);
  assert.ok(repeated.equations.some(e => e.otherDigit === 8 && e.result === 6));
});

test('pattern estimates are bounded and cannot bypass prior validation gates', () => {
  const estimate = analyzeAutomaticPivot(archive);
  assert.equal(estimate.completedPairs, 909);
  assert.equal(estimate.validation.trials, 240);
  for (const c of estimate.candidates) {
    assert.ok(c.probability >= 0 && c.probability <= 1);
    assert.ok(c.poolSize >= 1 && c.poolSize <= 42);
  }
  if (estimate.method === 'patterns') {
    assert.ok(estimate.validation.brierGain.lower > 0);
    assert.ok(estimate.validation.coverageGain.lower > 0);
  } else {
    assert.equal(estimate.candidates[0].probability, Math.max(...estimate.candidates.map(c => c.baselineProbability)));
    assert.deepEqual(estimate.pivots, [estimate.candidates[0].digit]);
  }
  if (estimate.pivots.length === 2) assert.equal(estimate.validation.pairPromoted, true);
});

test('automatic session and optional pool snapshot survive saving, results, and project roundtrip without retraining', () => {
  const history = archive.slice(0, 120);
  const now = new Date(`${history.at(-1).date}T23:00:00Z`);
  const board = buildPivotWorkbench(history);
  const session = createPredictionSession(history);
  assert.deepEqual(session.automaticSelection, sanitizeAutomaticSelection(board.automaticSelection));
  assert.deepEqual(session.automaticSelection.poolNumbers, board.eligibleNumbers);
  const saved = savePoolSelection({ sessions: [session], poolPickDraft: null }, history, { chooser: 'auto' }, now);
  assert.deepEqual(saved.selection.automaticSelection, session.automaticSelection);
  const target = archive[120];
  const scored = reconcileOfficialDraws(saved.workspace, history, [...history, target], now);
  const frozen = scored.workspace.sessions.find(s => s.id === session.id);
  assert.deepEqual(frozen.automaticSelection, session.automaticSelection);
  assert.deepEqual(frozen.poolSelections[0].automaticSelection, session.automaticSelection);
  const rebuilt = rebuildPendingSystemRows(scored.workspace, [...history, target], { chooser: 'low' });
  assert.deepEqual(rebuilt.sessions.find(s => s.id === frozen.id), frozen);
  const restored = validateProject(JSON.parse(JSON.stringify({ version: 4, gameType: 'cash5', draws: [...history, target], workspace: scored.workspace })));
  assert.equal(restored.valid, true);
  const imported = restored.workspace.sessions.find(s => s.id === session.id);
  assert.deepEqual(imported.automaticSelection, frozen.automaticSelection);
  assert.deepEqual(imported.poolSelections, frozen.poolSelections);
  assert.deepEqual(imported.workbenchSettings, frozen.workbenchSettings);
});
