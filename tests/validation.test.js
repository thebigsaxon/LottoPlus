import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHTML, validateDraw, validateProject } from '../js/validation.js';

const cashDraw = { id: 'c5', date: '2026-08-22', numbers: [2, 3, 30, 31, 43] };
const treasureDraw = { id: 'th', date: '2026-08-22', numbers: [7, 16, 21, 25, 30] };

function project(overrides = {}) {
  return {
    appName: 'PA 5 Studio', version: 4, activeGame: 'cash5',
    games: {
      cash5: { draws: [cashDraw], manualLines: [], workspace: {} },
      treasureHunt: { draws: [treasureDraw], manualLines: [], workspace: {} }
    },
    ...overrides
  };
}

test('escapeHTML sanitizes dangerous HTML injection strings', () => {
  assert.equal(escapeHTML('<script>alert("x")</script>&\''), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#039;');
});

test('draw validation applies Cash 5 and Treasure Hunt ranges independently', () => {
  assert.equal(validateDraw(cashDraw, 'cash5').valid, true);
  assert.equal(validateDraw(treasureDraw, 'treasureHunt').valid, true);
  assert.equal(validateDraw({ ...treasureDraw, numbers: [7, 16, 21, 25, 31] }, 'treasureHunt').valid, false);
  assert.equal(validateDraw({ ...cashDraw, numbers: [2, 3, 30, 31, 44] }, 'cash5').valid, false);
});

test('draw validation requires five unique strict integers and a real date', () => {
  const duplicate = validateDraw({ id: 'dup', date: '2026-08-01', numbers: [1, 1, 2, 3, 4] });
  const partial = validateDraw({ id: 'partial', date: '2026-02-30', numbers: ['12abc', 13, 14, 15, 16] });
  assert.ok(duplicate.errors.some(error => error.includes('unique')));
  assert.ok(partial.errors.some(error => error.includes('Invalid main ball')));
  assert.ok(partial.errors.some(error => error.includes('Invalid date')));
});

test('version 4 project validation keeps game data and workspaces separate', () => {
  const input = project({ activeGame: 'treasureHunt' });
  input.games.cash5.workspace = {
    slipNumbers: [1, 11, 23, 32, 43],
    draftRows: [{ id: 'cash-row', numbers: [1, 11, 23, 32, 43], label: 'strong' }]
  };
  input.games.treasureHunt.workspace = {
    slipNumbers: [1, 11, 23, 29, 30],
    draftRows: [{ id: 'th-row', numbers: [1, 11, 23, 29, 30], label: 'uncertain' }]
  };
  const result = validateProject(input);
  assert.equal(result.valid, true);
  assert.equal(result.activeGame, 'treasureHunt');
  assert.equal(result.games.cash5.workspace.draftRows[0].id, 'cash-row');
  assert.equal(result.games.treasureHunt.workspace.draftRows[0].id, 'th-row');
  assert.notStrictEqual(result.games.cash5.workspace, result.games.treasureHunt.workspace);
});

test('project validation filters bad rows without mixing game rules', () => {
  const input = project();
  input.games.cash5.draws.push({ id: 'bad-c5', date: '2026-08-21', numbers: [1, 2, 3, 4, 44] });
  input.games.treasureHunt.draws.push({ id: 'bad-th', date: '2026-08-21', numbers: [1, 2, 3, 4, 43] });
  const result = validateProject(input);
  assert.equal(result.valid, true);
  assert.equal(result.games.cash5.draws.length, 1);
  assert.equal(result.games.treasureHunt.draws.length, 1);
  assert.equal(result.errors.length, 2);
});

test('project validation preserves independent jackpot metadata and freshness', () => {
  const input = project();
  input.games.cash5.jackpot = {
    amount: 500000, display: '$500,000', nextDrawDate: '2026-08-23',
    fetchedAt: '2026-08-22T16:00:00.000Z', source: 'official-feed'
  };
  input.games.cash5.jackpotIsStale = false;
  input.games.treasureHunt.jackpot = {
    amount: 25000, display: '$25,000', nextDrawDate: '2026-08-23',
    fetchedAt: '2026-08-21T16:00:00.000Z', source: 'official-feed'
  };
  input.games.treasureHunt.jackpotIsStale = true;
  const result = validateProject(input);
  assert.equal(result.games.cash5.jackpot.nextDrawDate, '2026-08-23');
  assert.equal(result.games.cash5.jackpotIsStale, false);
  assert.equal(result.games.treasureHunt.jackpotIsStale, true);
});

test('legacy SC and malformed projects are rejected clearly', () => {
  const legacy = validateProject({ appName: 'Cash 5 Studio', version: 3, draws: [cashDraw] });
  assert.equal(legacy.valid, false);
  assert.match(legacy.errors[0], /SC and legacy projects cannot be imported/);
  assert.equal(validateProject(null).valid, false);
});
