import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendTensBands, tensDigitForNumber } from '../js/fuzzyTens.js';

test('fuzzy tens recommendations follow sorted-position history', () => {
  const draws = Array.from({ length: 10 }, (_, index) => ({
    numbers: [index % 8 + 1, 12, 23, 34, 41]
  }));
  const recommendations = recommendTensBands(draws);
  assert.equal(recommendations.length, 5);
  assert.equal(recommendations[0].primary.digit, 0);
  assert.equal(recommendations[2].primary.digit, 2);
  assert.equal(recommendations[4].primary.digit, 4);
  assert.match(recommendations[2].primary.reason, /10 of 10 draws here/);
});

test('fuzzy tens recommendations use newer draws as stronger evidence', () => {
  const draws = [
    ...Array.from({ length: 5 }, () => ({ numbers: [1, 12, 23, 34, 41] })),
    ...Array.from({ length: 5 }, () => ({ numbers: [11, 22, 23, 34, 41] }))
  ];
  const firstBall = recommendTensBands(draws)[0];
  const ones = firstBall.ranked.find(item => item.digit === 1);
  const singles = firstBall.ranked.find(item => item.digit === 0);
  assert.ok(ones.recentRate > singles.recentRate);
  assert.ok(ones.score > singles.score);
});

test('tens digit helper treats 1–9 and 40–42 as distinct bands', () => {
  assert.equal(tensDigitForNumber(7), 0);
  assert.equal(tensDigitForNumber(19), 1);
  assert.equal(tensDigitForNumber(42), 4);
  assert.equal(tensDigitForNumber(43), null);
});
