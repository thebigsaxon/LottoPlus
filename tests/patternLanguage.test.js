import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePatternLanguage, encodeDraw, PATTERN_PRIOR_STRENGTH } from '../js/patternLanguage.js';

const draw = (day, numbers) => ({ date: `2026-08-${String(day).padStart(2, '0')}`, numbers });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('alphabet describes parity, halves, endings, consecutive pairs, repeats, spread and occupancy', () => {
  const source = draw(2, [40, 8, 36, 6, 34]);
  const before = JSON.stringify(source);
  const encoded = encodeDraw(source, draw(1, [6, 9, 23, 24, 41]));
  assert.deepEqual(encoded.features, { O: 0, L: 2, U: 4, C: 0, R: 1, S: 'w', B: '20021' });
  assert.equal(encoded.code, 'O0 L2 U4 C0 R1 Sw B20021');
  assert.equal(JSON.stringify(source), before);
  assert.equal(encodeDraw(draw(3, [1, 2, 3, 11, 15])).features.C, 2);
  assert.equal(encodeDraw(draw(3, [1, 2, 3, 11, 15])).features.S, 'c');
  assert.equal(encodeDraw(draw(3, [1, 2, 3, 11, 16])).features.S, 'm');
  assert.equal(encodeDraw(draw(3, [1, 2, 3, 11, 29])).features.S, 'm');
  assert.equal(encodeDraw(draw(3, [1, 2, 3, 11, 30])).features.S, 'w');
  assert.equal(encodeDraw(draw(3, [1, 1, 3, 11, 30])), null);
});

test('a forecast cutoff excludes future labels and future state encodings', () => {
  const history = [draw(1, [1, 2, 3, 4, 5]), draw(2, [6, 7, 8, 9, 10]), draw(3, [11, 12, 13, 14, 15])];
  const expected = analyzePatternLanguage(history.slice(0, 2));
  const all = analyzePatternLanguage(history, { throughDate: history[1].date });
  assert.deepEqual(all, expected);
  assert.deepEqual(analyzePatternLanguage([...history.slice(0, 2), draw(3, [30, 31, 32, 33, 34])], { throughDate: history[1].date }), expected);
  assert.equal(all.completedPairs, 1);
  assert.ok(all.components.flatMap(c => c.matches).every(m => m.targetDate <= all.sourceDate && m.sourceDate < all.sourceDate));
  assert.equal(analyzePatternLanguage(history.slice(0, 1)).completedPairs, 0);
  analyzePatternLanguage(history.slice(0, 1)).scores.forEach(score => near(score, 5 / 42));
});

test('gaps break repeat and two-word sequence context and never supply training targets', () => {
  const numbers = [1, 2, 3, 4, 5];
  const result = analyzePatternLanguage([draw(1, numbers), draw(2, numbers), draw(5, numbers), draw(6, numbers)]);
  assert.equal(result.completedPairs, 2);
  assert.equal(result.skippedGaps, 1);
  assert.equal(result.recentLetters[2].features.R, null);
  assert.equal(result.components.find(c => c.family === 'sequence').support, 0);
  const afterGap = analyzePatternLanguage([draw(1, numbers), draw(2, numbers), draw(5, numbers)]);
  assert.equal(afterGap.sequence, null);
  assert.equal(afterGap.source.features.R, null);
  assert.equal(afterGap.components.find(c => c.family === 'sequence').key, null);
  assert.equal(afterGap.completedPairs, 1);
});

test('sparse matches have exact auditable shrinkage and normalized inclusion mass', () => {
  const numbers = [1, 3, 5, 7, 9];
  const result = analyzePatternLanguage([draw(1, numbers), draw(2, numbers), draw(3, numbers)]);
  assert.ok(PATTERN_PRIOR_STRENGTH >= 24);
  const word = result.components.find(c => c.family === 'word');
  assert.equal(word.support, 2);
  assert.equal(word.smallSample, true);
  near(word.scores[0], (2 + 24 * result.baselineScores[0]) / 26);
  near(word.scores[1], 24 * result.baselineScores[1] / 26);
  assert.equal(word.matches[1].sourceDate, '2026-08-02');
  assert.equal(word.matches[1].targetDate, '2026-08-03');
  assert.equal(word.successors[0].empiricalProbability, 1);
  near(word.successors[0].shrunkProbability, 1);
  for (const vector of [result.scores, result.baselineScores, ...result.components.map(c => c.scores)]) {
    assert.equal(vector.length, 42);
    assert.ok(vector.every(score => score > 0 && score < 1));
    near(vector.reduce((sum, score) => sum + score, 0), 5);
  }
});

test('two-word matches require a completed three-day sequence, with deterministic cleaning', () => {
  const numbers = [1, 3, 5, 7, 9];
  const history = Array.from({ length: 4 }, (_, i) => draw(i + 1, numbers));
  const result = analyzePatternLanguage(history);
  assert.equal(result.components.find(c => c.family === 'sequence').support, 2);
  assert.deepEqual(analyzePatternLanguage([...history].reverse()), result);
  assert.deepEqual(analyzePatternLanguage([...history, history[1], { ...draw(5, numbers), preview: true }]), result);
  assert.equal(analyzePatternLanguage([]), null);
});
