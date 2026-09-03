/** Full deterministic v6 archive bake-off and checked-in policy report generator. */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeNextDrawBoard,
  analyzeNextDrawBoardV5,
  scoreNextDrawColumnsV6
} from '../js/patternRecommendations.js';
import {
  chronologicalSplit,
  compareEvaluations,
  fairHistory,
  pairedBootstrap,
  policyGrid
} from '../js/v6Evaluation.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE_PATH = path.join(ROOT, 'tests', 'fixtures', 'cash5-history.json');
const REPORT_PATH = path.join(ROOT, 'tests', 'fixtures', 'v6-policy-report.json');
const POLICY_PATH = path.join(ROOT, 'js', 'v6Policy.js');
const COMBO = { kind: 'combo', priorStrength: 50, patternWeight: 0, stateWeight: 0, evidenceId: 'v6-combo-baseline-2026-08-29' };

function exactHits(lines, actual) {
  return lines.filter(line => line.available).reduce((hits, line) => (
    hits + line.numbers.reduce((count, number, column) => count + (actual[column] === number ? 1 : 0), 0)
  ), 0);
}

async function evaluateFull(draws, range, policy, version = 6) {
  const perDraw = [];
  let constantLines = null;
  if (version === 6 && policy.kind === 'combo') {
    constantLines = analyzeNextDrawBoard(draws.slice(0, 50), { includeWalkForward: false, policy }).lines;
  }
  for (let target = range.start; target < range.end; target += 1) {
    const history = draws.slice(Math.max(0, target - 50), target);
    const lines = constantLines || (version === 5
      ? analyzeNextDrawBoardV5(history, { includeWalkForward: false }).lines
      : analyzeNextDrawBoard(history, { includeWalkForward: false, policy }).lines);
    perDraw.push({ date: draws[target].date, exactHits: exactHits(lines, draws[target].numbers) });
  }
  const hits = perDraw.reduce((sum, item) => sum + item.exactHits, 0);
  return { hits, trials: perDraw.length * 15, rate: perDraw.length ? hits / (perDraw.length * 15) : 0, perDraw };
}

async function evaluateTrainingArm(draws, range, policy) {
  const perDraw = [];
  for (let target = range.start; target < range.end; target += 1) {
    const history = draws.slice(Math.max(0, target - 50), target);
    const columns = scoreNextDrawColumnsV6(history, 3, policy);
    const actual = draws[target].numbers;
    const exact = columns.reduce((sum, column) => (
      sum + column.numberCandidates.slice(0, 3).filter(candidate => candidate.number === actual[column.column]).length
    ), 0);
    perDraw.push({ date: draws[target].date, exactHits: exact });
  }
  const hits = perDraw.reduce((sum, item) => sum + item.exactHits, 0);
  return { hits, trials: perDraw.length * 15, rate: hits / (perDraw.length * 15), perDraw };
}

async function main() {
  const archive = JSON.parse(await readFile(ARCHIVE_PATH, 'utf8'));
  const split = chronologicalSplit(archive.draws);
  const trainingResults = [];
  for (const policy of policyGrid()) {
    const evaluation = await evaluateTrainingArm(split.ordered, split.train, policy);
    trainingResults.push({ policy, rate: evaluation.rate });
  }
  trainingResults.sort((a, b) => b.rate - a.rate
    || a.policy.patternWeight + a.policy.stateWeight - (b.policy.patternWeight + b.policy.stateWeight)
    || a.policy.evidenceId.localeCompare(b.policy.evidenceId));
  const selected = trainingResults[0].policy;
  const [validationCombo, validationSelected, testCombo, testSelected, testV5] = await Promise.all([
    evaluateFull(split.ordered, split.validation, COMBO),
    evaluateFull(split.ordered, split.validation, selected),
    evaluateFull(split.ordered, split.test, COMBO),
    evaluateFull(split.ordered, split.test, selected),
    evaluateFull(split.ordered, split.test, null, 5)
  ]);
  const validationGate = compareEvaluations(validationSelected, validationCombo);
  const testGate = compareEvaluations(testSelected, testCombo);
  const learnedArchiveGate = validationGate.passed && testGate.passed;

  const comboSimulationLines = analyzeNextDrawBoard(split.ordered.slice(0, 50), { includeWalkForward: false, policy: COMBO }).lines;
  const simulationDifferences = [];
  for (let seed = 1; seed <= 200; seed += 1) {
    const history = fairHistory(seed, 500);
    const actual = history.at(-1).numbers;
    const selectedLines = analyzeNextDrawBoard(history.slice(0, -1), { includeWalkForward: false, policy: selected }).lines;
    simulationDifferences.push(exactHits(selectedLines, actual) - exactHits(comboSimulationLines, actual));
  }
  const simulationConfidence = pairedBootstrap(simulationDifferences, { denominator: 15 });
  const simulation = {
    seeds: 200,
    drawsPerSeed: 500,
    evaluated: true,
    meanDifference: simulationConfidence.mean,
    lowerBound: simulationConfidence.lower,
    upperBound: simulationConfidence.upper,
    nonInferiorityMargin: -0.0025,
    passed: simulationConfidence.lower >= -0.0025,
    comparedPolicy: selected.evidenceId
  };

  const learnedGatePassed = learnedArchiveGate && simulation.passed;
  const activePolicy = learnedGatePassed ? {
    ...selected,
    evidenceId: `v6-gated-${archive.checksum.slice(0, 12)}`
  } : COMBO;
  const v5Comparison = compareEvaluations(testCombo, testV5);
  const report = {
    schemaVersion: 1,
    generatedAt: archive.retrievedAt,
    archiveChecksum: archive.checksum,
    archiveDrawCount: archive.drawCount,
    splits: {
      train: [split.ordered[split.train.start].date, split.ordered[split.train.end - 1].date],
      validation: [split.ordered[split.validation.start].date, split.ordered[split.validation.end - 1].date],
      test: [split.ordered[split.test.start].date, split.ordered[split.test.end - 1].date]
    },
    trainingResults,
    selectedChallenger: selected,
    validation: { comboRate: validationCombo.rate, challengerRate: validationSelected.rate, gate: validationGate },
    test: { comboRate: testCombo.rate, challengerRate: testSelected.rate, v5Rate: testV5.rate, challengerGate: testGate, comboVsV5: v5Comparison },
    simulation,
    learnedGatePassed,
    activePolicy,
    improvementClaimAllowed: v5Comparison.passed
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(POLICY_PATH, `/** Generated by scripts/evaluate_v6.js. */\nexport const V6_POLICY = Object.freeze(${JSON.stringify(activePolicy, null, 2)});\n`);
  console.log(`Selected training arm ${selected.evidenceId}; learned gate ${learnedGatePassed ? 'passed' : 'failed'}.`);
  console.log(`Active v6 policy: ${activePolicy.kind}. Report: ${REPORT_PATH}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
