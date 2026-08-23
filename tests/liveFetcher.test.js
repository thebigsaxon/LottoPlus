import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PA_HISTORY_ENDPOINT,
  fetchGameDraws,
  fetchLiveGameUpdate,
  formatPaDrawingDate,
  mergeDrawHistory,
  parsePaHistory,
  parsePaJackpotFeed
} from '../js/liveFetcher.js';

function record(gameId, drawId, epoch, numbers) {
  return Object.fromEntries([
    ['drawingGameID', gameId], ['drawingNumberID', drawId], ['drawingNumberDate', `/Date(${epoch})/`],
    ...numbers.map((number, index) => [`drawingNumber${index + 1}`, number])
  ]);
}

const rss = `<?xml version="1.0"?><rss><channel>
  <item><title>Cash 5 - 08/22/2026</title><description>Winning Numbers: 2 3 30 31 33 &lt;br /&gt;Cash 5 jackpot for 08/23/2026 is $500,000</description></item>
  <item><title>Treasure Hunt - 08/22/2026</title><description>Winning Numbers: 7 16 21 25 30 &lt;br /&gt;Treasure Hunt jackpot for 08/23/2026 is $12,000</description></item>
</channel></rss>`;

test('PA epoch dates are converted in America/New_York', () => {
  assert.equal(formatPaDrawingDate('/Date(1787371200000)/'), '2026-08-22');
  assert.equal(formatPaDrawingDate('not-a-date'), '');
});

test('official history parser validates each game range and ignores other games', () => {
  const payload = JSON.stringify([
    record(8, 101, 1787371200000, [2, 3, 30, 31, 43]),
    record(7, 102, 1787371200000, [7, 16, 21, 25, 30]),
    record(8, 103, 1787284800000, [1, 2, 3, 4, 44])
  ]);
  assert.deepEqual(parsePaHistory(payload, 'cash5').map(draw => draw.numbers), [[2, 3, 30, 31, 43]]);
  assert.deepEqual(parsePaHistory(payload, 'treasureHunt').map(draw => draw.numbers), [[7, 16, 21, 25, 30]]);
  assert.throws(() => parsePaHistory('<html>blocked</html>'), /not valid JSON/);
});

test('history merge deduplicates, sorts newest first, and caps research at 50', () => {
  const draws = Array.from({ length: 55 }, (_, index) => ({ id: `d-${index}`, date: `2026-07-${String((index % 28) + 1).padStart(2, '0')}`, numbers: [1, 2, 3, 4, 5] }));
  const result = mergeDrawHistory(draws, [draws[0]]);
  assert.equal(result.length, 50);
  assert.ok(result.every((draw, index) => index === 0 || draw.date <= result[index - 1].date));
});

test('year boundary retrieval requests the previous year when fewer than 50 current draws exist', async () => {
  const urls = [];
  const current = [record(8, 201, 1767330000000, [1, 2, 3, 4, 43])];
  const previous = [record(8, 200, 1767243600000, [5, 6, 7, 8, 42])];
  const draws = await fetchGameDraws('cash5', {
    year: 2026,
    fetchText: async url => {
      urls.push(url);
      return JSON.stringify(url.endsWith('y=2026') ? current : previous);
    }
  });
  assert.equal(draws.length, 2);
  assert.equal(urls[0], `${PA_HISTORY_ENDPOINT}?g=8&y=2026`);
  assert.equal(urls[1], `${PA_HISTORY_ENDPOINT}?g=8&y=2025`);
});

test('official feed returns independent next jackpots for both games', () => {
  const now = new Date('2026-08-22T20:00:00.000Z');
  assert.deepEqual(parsePaJackpotFeed(rss, 'cash5', now), {
    amount: 500000, display: '$500,000', nextDrawDate: '2026-08-23',
    fetchedAt: now.toISOString(), source: 'https://www.palottery.pa.gov/feeds/games.aspx'
  });
  assert.equal(parsePaJackpotFeed(rss, 'treasureHunt', now).amount, 12000);
  assert.throws(() => parsePaJackpotFeed('<rss></rss>', 'cash5'), /did not include Cash 5/);
});

test('combined update reports draw and jackpot failures independently', async () => {
  const draws = [{ id: 'draw-1', date: '2026-08-22', numbers: [1, 2, 3, 4, 43] }];
  const jackpot = { amount: 500000, display: '$500,000', fetchedAt: '2026-08-22T20:00:00.000Z' };
  const partial = await fetchLiveGameUpdate('cash5', {
    fetchDraws: async () => draws,
    fetchJackpot: async () => { throw new Error('jackpot offline'); }
  });
  assert.equal(partial.draws.ok, true);
  assert.equal(partial.jackpot.ok, false);
  const jackpotOnly = await fetchLiveGameUpdate('cash5', {
    fetchDraws: async () => { throw new Error('draws offline'); }, fetchJackpot: async () => jackpot
  });
  assert.equal(jackpotOnly.draws.ok, false);
  assert.equal(jackpotOnly.jackpot.ok, true);
});
