import test from 'node:test';
import assert from 'node:assert/strict';
import {
  endingDistribution,
  feasibleOrderStatisticRange,
  orderStatisticDistribution,
  orderStatisticProbability,
  shrinkDistribution,
  tensDistribution
} from '../js/orderStats.js';

const close = (left, right, epsilon = 1e-12) => assert.ok(Math.abs(left - right) < epsilon, `${left} != ${right}`);

test('order-statistic distributions are normalized and respect legal Ball ranges', () => {
  for (let column = 0; column < 5; column += 1) {
    const distribution = orderStatisticDistribution(column);
    close(distribution.reduce((sum, value) => sum + value, 0), 1);
    close(endingDistribution(column).reduce((sum, value) => sum + value, 0), 1);
    close(tensDistribution(column).reduce((sum, value) => sum + value, 0), 1);
    const range = feasibleOrderStatisticRange(column);
    distribution.forEach((probability, index) => {
      const number = index + 1;
      assert.equal(probability === 0, number < range.min || number > range.max);
    });
  }
});

test('order-statistic endpoint identities and mirror symmetry match the closed form', () => {
  close(orderStatisticProbability(0, 1), 5 / 42);
  close(orderStatisticProbability(4, 42), 5 / 42);
  for (let column = 0; column < 5; column += 1) {
    for (let number = 1; number <= 42; number += 1) {
      close(orderStatisticProbability(column, number), orderStatisticProbability(4 - column, 43 - number));
    }
  }
  assert.equal(orderStatisticProbability(0, 42), 0);
  assert.equal(orderStatisticProbability(4, 1), 0);
});

test('empirical Bayes shrinkage falls back to its prior and incorporates counts', () => {
  const prior = [0.2, 0.3, 0.5];
  assert.deepEqual(shrinkDistribution(prior, [], 50), prior);
  const posterior = shrinkDistribution(prior, [10, 0, 0], 50);
  close(posterior.reduce((sum, value) => sum + value, 0), 1);
  assert.ok(posterior[0] > prior[0]);
  assert.ok(posterior[2] < prior[2]);
});
