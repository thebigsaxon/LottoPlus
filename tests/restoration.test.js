import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from '../js/validation.js';

test('state restoration accepts a combined PA 5 Studio project', () => {
  const restored = validateProject({
    appName: 'PA 5 Studio', version: 4, activeGame: 'treasureHunt',
    games: {
      cash5: { draws: [{ id: 'c5', date: '2026-08-03', numbers: [8, 20, 31, 38, 43] }], workspace: {}, manualLines: [] },
      treasureHunt: { draws: [{ id: 'th', date: '2026-08-03', numbers: [1, 5, 12, 23, 30] }], workspace: {}, manualLines: [] }
    }
  });
  assert.equal(restored.valid, true);
  assert.equal(restored.activeGame, 'treasureHunt');
  assert.equal(restored.games.cash5.draws[0].id, 'c5');
  assert.equal(restored.games.treasureHunt.draws[0].id, 'th');
});
