import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeNextDrawBoard } from '../js/patternRecommendations.js';
import {
  buildTrackPortfolio,
  compareV9TicketOutcomes,
  evaluateV9Arm,
  scoreTicketPortfolio,
  trackNumberProbabilities,
  v9ChronologicalSplit
} from '../js/v9Evaluation.js';

const archivePath = new URL('./fixtures/cash5-history.json', import.meta.url);
const reportPath = new URL('./fixtures/v9-ticket-policy-report.json', import.meta.url);

async function loadFixture() {
  return JSON.parse(await readFile(archivePath, 'utf8'));
}

test('v9 uses chronological 60/20/20 partitions after its fixed warmup', async () => {
  const archive = await loadFixture();
  const split = v9ChronologicalSplit(archive.draws);

  assert.equal(split.train.start, 25);
  assert.equal(split.train.end, Math.floor(archive.drawCount * 0.6));
  assert.equal(split.validation.start, split.train.end);
  assert.equal(split.validation.end, Math.floor(archive.drawCount * 0.8));
  assert.equal(split.test.start, split.validation.end);
  assert.equal(split.test.end, archive.drawCount);
  assert.ok(split.ordered[split.train.end - 1].date < split.ordered[split.validation.start].date);
  assert.ok(split.ordered[split.validation.end - 1].date < split.ordered[split.test.start].date);
});

test('control and challenger portfolios are deterministic, legal, and contain 15 unique numbers', async () => {
  const archive = await loadFixture();
  const history = archive.draws.slice(-50);
  const first = analyzeNextDrawBoard(history, { includeWalkForward: false });
  const second = analyzeNextDrawBoard(history, { includeWalkForward: false });

  assert.deepEqual(first.lines, second.lines);
  for (const track of ['control', 'temporal', 'structure', 'hncde', 'combined']) {
    const portfolio = buildTrackPortfolio(history, first, track);
    assert.equal(portfolio.lines.length, 3);
    assert.equal(new Set(portfolio.lines.flatMap(line => line.numbers)).size, 15);
    portfolio.lines.forEach(line => {
      assert.equal(line.numbers.length, 5);
      assert.deepEqual(line.numbers, [...line.numbers].sort((left, right) => left - right));
      assert.ok(line.numbers.every(number => Number.isInteger(number) && number >= 1 && number <= 42));
    });
    assert.equal(portfolio.probabilities.length, 42);
    assert.ok(portfolio.probabilities.every(probability => probability >= 0 && probability <= 1));
    assert.ok(Math.abs(portfolio.probabilities.reduce((sum, value) => sum + value, 0) - 5) < 1e-9);
  }

  const probabilities = trackNumberProbabilities(history, first, 'structure');
  assert.equal(probabilities.length, 42);
});

test('ticket scoring is unordered and reports every paid-line tier plus portfolio coverage', () => {
  const lines = [
    { numbers: [1, 2, 3, 4, 5] },
    { numbers: [6, 7, 8, 9, 10] },
    { numbers: [11, 12, 13, 14, 15] }
  ];
  const actual = [5, 4, 3, 11, 42];
  const metrics = scoreTicketPortfolio(lines, actual, Array(42).fill(5 / 42));

  assert.equal(metrics.meanHitsPerLine, 4 / 3);
  assert.equal(metrics.matchTwoRate, 1 / 3);
  assert.equal(metrics.matchThreeRate, 1 / 3);
  assert.equal(metrics.matchFourRate, 0);
  assert.equal(metrics.matchFiveRate, 0);
  assert.equal(metrics.portfolioCoverage, 4);
  assert.equal(metrics.bestLineHits, 3);
  assert.ok(metrics.brier > 0);
});

test('an evaluation target cannot read its target row or any later draw', async () => {
  const archive = await loadFixture();
  const original = archive.draws.slice(0, 80);
  const targetIndex = 50;
  const range = { start: targetIndex, end: targetIndex + 1 };
  const expected = evaluateV9Arm(original, range, 'structure', 25);
  const changedLater = structuredClone(original);
  changedLater[targetIndex + 1].numbers = [1, 2, 3, 4, 5];
  changedLater[targetIndex + 2].numbers = [38, 39, 40, 41, 42];

  assert.deepEqual(evaluateV9Arm(changedLater, range, 'structure', 25), expected);
});

test('promotion requires both held-out gates and the checked report keeps Blue active', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const passingMetrics = {
    perDraw: [
      { date: 'a', meanHitsPerLine: 1, matchTwoRate: 1, matchThreeRate: 1, brier: 0 },
      { date: 'b', meanHitsPerLine: 1, matchTwoRate: 1, matchThreeRate: 1, brier: 0 }
    ]
  };
  const controlMetrics = {
    perDraw: [
      { date: 'a', meanHitsPerLine: 0, matchTwoRate: 0, matchThreeRate: 0, brier: 1 },
      { date: 'b', meanHitsPerLine: 0, matchTwoRate: 0, matchThreeRate: 0, brier: 1 }
    ]
  };
  assert.equal(compareV9TicketOutcomes(passingMetrics, controlMetrics).passed, true);
  assert.equal(report.archiveDrawCount, 910);
  assert.deepEqual(new Set(report.pivotCalibration.training.map(item => item.pivotMode)), new Set(['low', 'high', 'both']));
  assert.ok(report.training.some(item => item.track === 'combined' && item.combinationWeights?.label === 'balanced'));
  assert.ok(report.training.every(item => item.control && item.comparison));
  assert.equal(report.promotionAllowed, false);
  assert.equal(report.activeTrack, 'control');
  assert.equal(report.validation.gate.passed && report.test.gate.passed, false);
});
