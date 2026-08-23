import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchLiveCash5Update,
  fetchLottoHtml,
  parseCurrentJackpot,
  parseJackpotAmount
} from '../js/liveFetcher.js';

const validHtml = '<html><tr class="c-draw-card"></tr></html>';

test('uses the native transport before browser proxies', async () => {
  let browserFetchCalled = false;
  const html = await fetchLottoHtml('https://www.lotteryusa.com/example', {
    nativeFetch: async () => validHtml,
    fetchImpl: async () => {
      browserFetchCalled = true;
      throw new Error('should not run');
    }
  });

  assert.equal(html, validHtml);
  assert.equal(browserFetchCalled, false);
});

test('falls back to a proxy when native fetching fails', async () => {
  const requestedUrls = [];
  const html = await fetchLottoHtml('https://www.lotteryusa.com/example', {
    nativeFetch: async () => { throw new Error('offline'); },
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      return { ok: true, status: 200, text: async () => validHtml };
    }
  });

  assert.equal(html, validHtml);
  assert.match(requestedUrls[0], /^https:\/\/api\.allorigins\.win\/raw\?/);
});

test('rejects successful responses that no longer contain draw markup', async () => {
  await assert.rejects(
    fetchLottoHtml('https://www.lotteryusa.com/example', {
      nativeFetch: null,
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => '<html>blocked</html>' })
    }),
    /did not contain draw results/
  );
});

test('parses official jackpot markup and normalizes its metadata', () => {
  const now = new Date('2026-08-22T15:30:00.000Z');
  const result = parseCurrentJackpot('<section><span>Est. Jackpot Now</span><strong>$592,000</strong></section>', now);
  assert.deepEqual(result, {
    amount: 592000,
    display: '$592,000',
    fetchedAt: '2026-08-22T15:30:00.000Z',
    source: 'https://www.sceducationlottery.com/Games/PalmettoCash5'
  });
});

test('parses abbreviated jackpot values', () => {
  assert.equal(parseJackpotAmount('$592,000'), 592000);
  assert.equal(parseJackpotAmount('$100K'), 100000);
  assert.equal(parseJackpotAmount('$1.13 Million'), 1130000);
  assert.equal(parseJackpotAmount('$2.5M'), 2500000);
  assert.equal(parseJackpotAmount('not money'), null);
});

test('rejects official pages without a readable current jackpot', () => {
  assert.throws(() => parseCurrentJackpot('<main>Palmetto Cash 5 results</main>'), /did not include a current Cash 5 jackpot/);
  assert.throws(() => parseCurrentJackpot('<main>Est. Jackpot Now $0</main>'), /unreadable Cash 5 jackpot/);
});

test('combined live update reports draw and jackpot outcomes independently', async () => {
  const draws = [{ id: 'draw-1', date: '2026-08-22', numbers: [1, 2, 3, 4, 5] }];
  const jackpot = { amount: 592000, display: '$592,000', fetchedAt: '2026-08-22T15:30:00.000Z', source: 'official' };
  const full = await fetchLiveCash5Update({
    fetchDraws: async () => draws,
    fetchJackpot: async () => jackpot
  });
  assert.equal(full.draws.ok, true);
  assert.equal(full.jackpot.ok, true);

  const partial = await fetchLiveCash5Update({
    fetchDraws: async () => draws,
    fetchJackpot: async () => { throw new Error('jackpot offline'); }
  });
  assert.equal(partial.draws.ok, true);
  assert.equal(partial.jackpot.ok, false);
  assert.match(partial.jackpot.error.message, /jackpot offline/);

  const jackpotOnly = await fetchLiveCash5Update({
    fetchDraws: async () => { throw new Error('draws offline'); },
    fetchJackpot: async () => jackpot
  });
  assert.equal(jackpotOnly.draws.ok, false);
  assert.equal(jackpotOnly.jackpot.ok, true);
});
