import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from '../js/validation.js';

test('state restoration accepts a Cash 5 Studio project', () => {
  const restoredProject = {
    appName: 'Cash 5 Studio',
    version: 3,
    draws: [
      { id: 'c5-r1', date: '2026-08-03', numbers: [8, 20, 31, 38, 42] },
      { id: 'c5-r2', date: '2026-08-01', numbers: [6, 17, 27, 38, 40] }
    ],
    manualLines: []
  };

  const valRes = validateProject(restoredProject);
  assert.equal(valRes.valid, true);
  assert.equal(valRes.validDraws.length, 2);

  // Simulate applyFilters()
  let filteredDraws = [...valRes.validDraws];
  assert.equal(filteredDraws.length, 2);
  assert.equal(filteredDraws[0].id, 'c5-r1');
});
