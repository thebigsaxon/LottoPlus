/** Deterministic probability calibration for the v7 ending-evidence board. */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreNextDrawColumnsV6 } from '../js/patternRecommendations.js';
import { NEXT_DRAW_STUDY_POLICY } from '../js/nextDrawPolicy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE_PATH = path.join(ROOT, 'tests', 'fixtures', 'cash5-history.json');
const REPORT_PATH = path.join(ROOT, 'tests', 'fixtures', 'v7-ending-policy-report.json');

function pool(record, weights) {
  const raw = Array.from({ length: 10 }, (_, digit) => Math.exp(
    weights.combo * Math.log(record.combo[digit])
    + weights.history * Math.log(record.history[digit])
    + weights.pattern * Math.log(record.pattern[digit])
    + weights.hncde * Math.log(record.hncde[digit])
  ));
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map(value => value / total);
}

function metrics(records, weights) {
  let brier = 0;
  let logLoss = 0;
  let topThreeHits = 0;
  records.forEach(record => {
    const probabilities = pool(record, weights);
    brier += probabilities.reduce((sum, probability, digit) => (
      sum + (probability - (digit === record.actual ? 1 : 0)) ** 2
    ), 0);
    logLoss -= Math.log(Math.max(1e-12, probabilities[record.actual]));
    const top = [...probabilities.keys()].sort((a, b) => probabilities[b] - probabilities[a] || a - b).slice(0, 3);
    if (top.includes(record.actual)) topThreeHits += 1;
  });
  return {
    cells: records.length,
    brier: brier / records.length,
    logLoss: logLoss / records.length,
    topThreeRate: topThreeHits / records.length
  };
}

function weightGrid() {
  const result = [];
  for (let combo = 4; combo <= 14; combo += 1) {
    for (let history = 4; history <= 14; history += 1) {
      for (let pattern = 1; pattern <= 8; pattern += 1) {
        const hncde = 20 - combo - history - pattern;
        if (hncde < 1 || hncde > 8) continue;
        result.push({
          combo: combo / 20,
          history: history / 20,
          pattern: pattern / 20,
          hncde: hncde / 20
        });
      }
    }
  }
  return result;
}

function unconstrainedRecencyGrid() {
  return Array.from({ length: 21 }, (_, combo) => ({
    combo: combo / 20,
    history: (20 - combo) / 20,
    pattern: 0,
    hncde: 0
  }));
}

async function main() {
  const archive = JSON.parse(await readFile(ARCHIVE_PATH, 'utf8'));
  const records = [];
  for (let target = 50; target < archive.draws.length; target += 1) {
    const history = archive.draws.slice(target - 50, target);
    const columns = scoreNextDrawColumnsV6(history, 10, NEXT_DRAW_STUDY_POLICY);
    columns.forEach((column, columnIndex) => {
      const record = {
        target,
        date: archive.draws[target].date,
        actual: archive.draws[target].numbers[columnIndex] % 10,
        combo: Array(10), history: Array(10), pattern: Array(10), hncde: Array(10)
      };
      column.allCandidates.forEach(candidate => {
        record.combo[candidate.digit] = candidate.comboEndingProbability;
        record.history[candidate.digit] = candidate.historyProbability;
        record.pattern[candidate.digit] = candidate.patternProbability;
        record.hncde[candidate.digit] = candidate.stateProbability;
      });
      records.push(record);
    });
  }
  const targetCount = archive.draws.length - 50;
  const trainEnd = 50 + Math.floor(targetCount * 0.6);
  const validationEnd = trainEnd + Math.floor(targetCount * 0.2);
  const train = records.filter(record => record.target < trainEnd);
  const validation = records.filter(record => record.target >= trainEnd && record.target < validationEnd);
  const test = records.filter(record => record.target >= validationEnd);
  const candidates = weightGrid().map(weights => ({ weights, metrics: metrics(train, weights) }))
    .sort((left, right) => left.metrics.brier - right.metrics.brier
      || left.metrics.logLoss - right.metrics.logLoss
      || right.weights.combo - left.weights.combo);
  const selected = candidates[0].weights;
  const configured = {
    combo: NEXT_DRAW_STUDY_POLICY.comboWeight,
    history: NEXT_DRAW_STUDY_POLICY.historyWeight,
    pattern: NEXT_DRAW_STUDY_POLICY.patternWeight,
    hncde: NEXT_DRAW_STUDY_POLICY.stateWeight
  };
  if (JSON.stringify(selected) !== JSON.stringify(configured)) {
    throw new Error(`Configured v7 weights ${JSON.stringify(configured)} do not match deterministic training selection ${JSON.stringify(selected)}.`);
  }
  const combo = { combo: 1, history: 0, pattern: 0, hncde: 0 };
  const unconstrainedCandidates = unconstrainedRecencyGrid().map(weights => ({
    weights, metrics: metrics(train, weights)
  })).sort((left, right) => left.metrics.brier - right.metrics.brier
    || left.metrics.logLoss - right.metrics.logLoss
    || right.weights.combo - left.weights.combo);
  const unconstrainedSelected = unconstrainedCandidates[0].weights;
  const unconstrainedValidation = metrics(validation, unconstrainedSelected);
  const unconstrainedTest = metrics(test, unconstrainedSelected);
  const comboValidation = metrics(validation, combo);
  const comboTest = metrics(test, combo);
  const recencyVoteAllowed = unconstrainedSelected.history > 0
    && unconstrainedValidation.brier < comboValidation.brier
    && unconstrainedValidation.logLoss < comboValidation.logLoss
    && unconstrainedTest.brier < comboTest.brier
    && unconstrainedTest.logLoss < comboTest.logLoss;
  const report = {
    schemaVersion: 1,
    generatedAt: archive.retrievedAt,
    archiveChecksum: archive.checksum,
    objective: 'Calibrated ending probabilities by Ball position; lower Brier score and log loss are better.',
    selectionConstraint: 'All four requested evidence sources remain active; combo and history are at least 20%, pattern and HNCDE are at least 5%.',
    splitDates: {
      train: [archive.draws[50].date, archive.draws[trainEnd - 1].date],
      validation: [archive.draws[trainEnd].date, archive.draws[validationEnd - 1].date],
      test: [archive.draws[validationEnd].date, archive.draws.at(-1).date]
    },
    selectedWeights: selected,
    train: { evidence: metrics(train, selected), combo: metrics(train, combo) },
    validation: { evidence: metrics(validation, selected), combo: metrics(validation, combo) },
    test: { evidence: metrics(test, selected), combo: metrics(test, combo) }
  };
  report.improvementClaimAllowed = ['validation', 'test'].every(split => (
    report[split].evidence.brier < report[split].combo.brier
    && report[split].evidence.logLoss < report[split].combo.logLoss
  ));
  report.unconstrainedRecency = {
    selectedWeights: unconstrainedSelected,
    recencyVoteAllowed,
    train: unconstrainedCandidates[0].metrics,
    validation: unconstrainedValidation,
    test: unconstrainedTest,
    combo: { validation: comboValidation, test: comboTest }
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`V7 ending calibration selected ${JSON.stringify(selected)}. Improvement claim: ${report.improvementClaimAllowed ? 'allowed' : 'not allowed'}.`);
  console.log(`Unconstrained recency vote ${recencyVoteAllowed ? 'allowed' : 'not allowed'} at ${JSON.stringify(unconstrainedSelected)}.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
