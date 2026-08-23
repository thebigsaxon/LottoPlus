import test from 'node:test';
import assert from 'node:assert/strict';
import { arithmeticRelationships, classifyOnesHeat, mathematicalSequenceRelationships, movementType, onesDigit } from '../js/onesAnalysis.js';

test('ones digit analysis ignores tens', () => {
  assert.deepEqual([12, 24, 34, 41].map(onesDigit), [2, 4, 4, 1]);
});

test('core arithmetic uses modulo-10 addition and multiplication plus absolute subtraction', () => {
  const relationships = arithmeticRelationships(2, 9);
  assert.deepEqual(relationships.map(item => item.result), [1, 7, 8]);
});

test('mathematical sequence relationships include addition, difference, and borrowed subtraction', () => {
  assert.deepEqual(
    mathematicalSequenceRelationships(3, 8).map(item => item.result),
    [1, 5]
  );
  assert.deepEqual(
    mathematicalSequenceRelationships(7, 8).map(item => item.result),
    [1, 5, 9]
  );
});

test('movement distinguishes same columns and sister shifts', () => {
  assert.equal(movementType(1, 1), 'same column');
  assert.equal(movementType(1, 0), 'sister left');
  assert.equal(movementType(1, 2), 'sister right');
  assert.equal(movementType(1, 3), null);
});

test('heat tiers include ties at rank cutoffs', () => {
  const draws = [
    { numbers: [1, 11, 21, 2, 12] },
    { numbers: [3, 13, 4, 14, 5] }
  ];
  const heat = classifyOnesHeat(draws);
  assert.equal(heat.find(item => item.digit === 1).tier, 'hot');
  assert.equal(heat.find(item => item.digit === 3).count, 2);
  assert.ok(heat.every(item => ['hot', 'warm', 'cold'].includes(item.tier)));
});
