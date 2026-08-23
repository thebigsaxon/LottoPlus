import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, autoMapColumns, convertRowsToDraws, normalizeDate } from '../js/csvParser.js';

test('normalizeDate converts MM/DD/YYYY to YYYY-MM-DD', () => {
  assert.equal(normalizeDate('08/04/2026'), '2026-08-04');
  assert.equal(normalizeDate('2026-08-04'), '2026-08-04');
});

test('parseCSV handles comma and tab separators and header filtering', () => {
  const csvContent = `Draw Date,Ball 1,Ball 2,Ball 3,Ball 4,Ball 5
08/04/2026,1,5,6,11,39
08/03/2026,11,23,25,37,42`;

  const parsed = parseCSV(csvContent);
  assert.equal(parsed.headers.length, 6);
  assert.equal(parsed.rows.length, 2);

  const mapping = autoMapColumns(parsed.headers);
  assert.equal(mapping.dateIndex, 0);
  assert.equal(mapping.ballIndices.length, 5);

  const res = convertRowsToDraws(parsed.headers, parsed.rows, mapping, 'cash5');
  assert.equal(res.draws.length, 2);
  assert.deepEqual(res.draws[0].numbers, [1, 5, 6, 11, 39]);

  const treasure = convertRowsToDraws(parsed.headers, parsed.rows, mapping, 'treasureHunt');
  assert.equal(treasure.draws.length, 0);
  assert.equal(treasure.errors.length, 2);
});
