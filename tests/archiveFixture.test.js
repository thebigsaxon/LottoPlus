import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SAMPLE_CASH_5 } from '../js/sampleData.js';

const artifact = JSON.parse(readFileSync(new URL('./fixtures/cash5-history.json', import.meta.url), 'utf8'));

test('current-matrix archive begins in March 2024 and is chronological, valid, and checksummed', () => {
  assert.ok(artifact.drawCount >= 850);
  assert.equal(artifact.startDate, '2024-03-03');
  assert.equal(artifact.drawCount, artifact.draws.length);
  assert.equal(new Set(artifact.draws.map(draw => draw.date)).size, artifact.draws.length);
  assert.deepEqual([...artifact.draws].sort((a, b) => a.date.localeCompare(b.date)), artifact.draws);
  artifact.draws.forEach(draw => {
    assert.match(draw.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(draw.numbers.length, 5);
    assert.equal(new Set(draw.numbers).size, 5);
    assert.ok(draw.numbers.every((number, index) => Number.isInteger(number) && number >= 1 && number <= 42
      && (index === 0 || number > draw.numbers[index - 1])));
  });
  const checksum = createHash('sha256').update(JSON.stringify(artifact.draws)).digest('hex');
  assert.equal(checksum, artifact.checksum);
});

test('archive agrees with LotteryUSA-derived project samples and current SCEL overlap', () => {
  const byDate = new Map(artifact.draws.map(draw => [draw.date, draw.numbers]));
  SAMPLE_CASH_5.forEach(draw => assert.deepEqual(byDate.get(draw.date), draw.numbers));
  const officialOverlap = [
    ['2026-08-26', [14, 16, 19, 31, 41]],
    ['2026-08-25', [2, 4, 13, 20, 39]],
    ['2026-08-24', [16, 17, 28, 33, 40]],
    ['2026-08-23', [1, 13, 17, 40, 41]]
  ];
  officialOverlap.forEach(([date, numbers]) => assert.deepEqual(byDate.get(date), numbers));
});
