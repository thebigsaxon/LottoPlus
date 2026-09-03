import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  chronologicalSplit,
  compareEvaluations,
  fairHistory,
  pairedBootstrap,
  policyGrid
} from '../js/v6Evaluation.js';
import { V6_POLICY } from '../js/v6Policy.js';
import { NEXT_DRAW_LIVE_POLICY, NEXT_DRAW_STUDY_POLICY } from '../js/nextDrawPolicy.js';

const archive = JSON.parse(readFileSync(new URL('./fixtures/cash5-history.json', import.meta.url), 'utf8'));
const report = JSON.parse(readFileSync(new URL('./fixtures/v6-policy-report.json', import.meta.url), 'utf8'));
const endingReport = JSON.parse(readFileSync(new URL('./fixtures/v7-ending-policy-report.json', import.meta.url), 'utf8'));
const v9Report = JSON.parse(readFileSync(new URL('./fixtures/v9-ticket-policy-report.json', import.meta.url), 'utf8'));

test('v6 evaluation uses fixed chronological 60/20/20 boundaries after warmup', () => {
  const split = chronologicalSplit(archive.draws);
  assert.equal(split.train.start, 50);
  assert.equal(split.train.end, Math.floor(archive.drawCount * 0.6));
  assert.equal(split.validation.start, split.train.end);
  assert.equal(split.validation.end, Math.floor(archive.drawCount * 0.8));
  assert.equal(split.test.start, split.validation.end);
  assert.equal(split.test.end, archive.drawCount);
});

test('paired draw-cluster bootstrap is reproducible and enforces both lift gates', () => {
  const differences = [1, 0, -1, 2, 1, 0, 1, -1];
  assert.deepEqual(pairedBootstrap(differences), pairedBootstrap(differences));
  const dates = Array.from({ length: 120 }, (_, index) => `d-${index}`);
  const baseline = { perDraw: dates.map(date => ({ date, exactHits: 0 })) };
  const strong = { perDraw: dates.map(date => ({ date, exactHits: 1 })) };
  const weak = { perDraw: dates.map((date, index) => ({ date, exactHits: index % 20 === 0 ? 1 : 0 })) };
  assert.equal(compareEvaluations(strong, baseline).passed, true);
  assert.equal(compareEvaluations(weak, baseline).passed, false);
});

test('policy grid is bounded and the checked report falls back to combo', () => {
  assert.ok(policyGrid().every(policy => policy.patternWeight + policy.stateWeight <= 0.3000001));
  assert.equal(report.archiveChecksum, archive.checksum);
  assert.equal(report.learnedGatePassed, false);
  assert.equal(report.improvementClaimAllowed, false);
  assert.deepEqual(V6_POLICY, report.activePolicy);
  assert.equal(V6_POLICY.kind, 'combo');
  assert.equal(V6_POLICY.patternWeight, 0);
  assert.equal(V6_POLICY.stateWeight, 0);
});

test('fair-history generator is deterministic and produces legal unique draws', () => {
  const first = fairHistory(42, 10);
  assert.deepEqual(first, fairHistory(42, 10));
  first.forEach(draw => {
    assert.equal(new Set(draw.numbers).size, 5);
    assert.ok(draw.numbers.every((number, index) => number >= 1 && number <= 42
      && (index === 0 || number > draw.numbers[index - 1])));
  });
});

test('v7 ending policy is selected by probability scoring and carries no unsupported improvement claim', () => {
  assert.equal(endingReport.archiveChecksum, archive.checksum);
  assert.deepEqual(endingReport.selectedWeights, {
    combo: 0.7, history: 0.2, pattern: 0.05, hncde: 0.05
  });
  assert.deepEqual(NEXT_DRAW_STUDY_POLICY.comboWeight, 0.7);
  assert.equal(endingReport.improvementClaimAllowed, false);
  assert.ok(endingReport.validation.evidence.cells >= 500);
  assert.ok(Number.isFinite(endingReport.test.evidence.brier));
  assert.ok(Number.isFinite(endingReport.test.evidence.logLoss));
});

test('live v9 policy is the control and no challenger votes without held-out proof', () => {
  assert.equal(NEXT_DRAW_LIVE_POLICY.kind, 'control');
  assert.equal(NEXT_DRAW_LIVE_POLICY.patternWeight, 0);
  assert.equal(NEXT_DRAW_LIVE_POLICY.historyWeight, 0);
  assert.equal(NEXT_DRAW_LIVE_POLICY.comboWeight, 1);
  assert.equal(endingReport.unconstrainedRecency.recencyVoteAllowed, false);
  assert.deepEqual(endingReport.unconstrainedRecency.selectedWeights, {
    combo: 0.95, history: 0.05, pattern: 0, hncde: 0
  });
  assert.equal(v9Report.archiveChecksum, archive.checksum);
  assert.equal(v9Report.promotionAllowed, false);
  assert.equal(v9Report.activeTrack, 'control');
});
