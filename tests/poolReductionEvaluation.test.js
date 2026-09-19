import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePool, evaluatePoolReduction } from '../scripts/evaluate_pool_reduction.js';

test('evaluation counts full numbers, keeping ending-only matches out', () => {
  assert.deepEqual(scorePool([6,16,26,36,2], [1,2,3,4,5]), {hits:1,matched:[2],missed:[1,3,4,5]});
  assert.equal(scorePool([6,16,26], [1,2,3,4,36]).hits, 0);
});

test('replay creates every forecast before its target and scores exact nested pools', () => {
  const draws = Array.from({ length: 25 }, (_, i) => ({
    date: new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),
    numbers: [0,1,2,3,4].map(j => ((i*7+j*8)%42)+1)
  }));
  const result = evaluatePoolReduction(draws, 20);
  assert.equal(result.records.length, 20);
  for(const record of result.records) {
    assert.ok(record.forecast.sourceDate < record.date);
    assert.equal(record.forecast.historyCount, draws.findIndex(d => d.date === record.date));
    for(const component of record.forecast.language.components) {
      assert.ok(component.matches.every(m => m.targetDate < record.date));
    }
    for(const arm of Object.values(record.arms)) {
      for(const k of [20,18,16]) {
        assert.equal(arm[k].pool.length, k);
        assert.equal(arm[k].hits, record.actual.filter(n => arm[k].pool.includes(n)).length);
      }
    }
  }
  assert.equal(result.summary.combined[20].totalHits, result.records.reduce((s,r)=>s+r.arms.combined[20].hits,0));
});

test('missing days cannot supply next-draw evaluation targets', () => {
  const draws=[{date:'2026-01-01',numbers:[1,2,3,4,5]},{date:'2026-01-03',numbers:[6,7,8,9,10]}];
  assert.throws(()=>evaluatePoolReduction(draws,1),/completed consecutive-day pairs/);
  for (const count of [0, -1, 1.5, NaN]) assert.throws(()=>evaluatePoolReduction(draws,count),/positive integer/);
});
