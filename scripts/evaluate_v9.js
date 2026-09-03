/** Generate the checked v9 ticket-outcome policy report. */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareV9TicketOutcomes,
  evaluateV9Arm,
  V9_COMBINATION_WEIGHTS,
  V9_PIVOT_MODES,
  V9_TRACK_KEYS,
  V9_WINDOWS,
  v9ChronologicalSplit
} from '../js/v9Evaluation.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE_PATH = path.join(ROOT, 'tests', 'fixtures', 'cash5-history.json');
const REPORT_PATH = path.join(ROOT, 'tests', 'fixtures', 'v9-ticket-policy-report.json');

async function main() {
  const archive = JSON.parse(await readFile(ARCHIVE_PATH, 'utf8'));
  const split = v9ChronologicalSplit(archive.draws);
  const analysisCache = new Map();
  const trainingControls = new Map(V9_WINDOWS.map(window => [
    window,
    evaluateV9Arm(split.ordered, split.train, 'control', window, { analysisCache })
  ]));
  const pivotCalibration = [];
  for (const pivotMode of V9_PIVOT_MODES) {
    for (const window of V9_WINDOWS) {
      const metrics = evaluateV9Arm(split.ordered, split.train, 'structure', window, { pivotMode, analysisCache });
      pivotCalibration.push({
        track: 'structure',
        pivotMode,
        window,
        metrics,
        comparison: compareV9TicketOutcomes(metrics, trainingControls.get(window))
      });
    }
  }
  pivotCalibration.sort((left, right) => right.comparison.meanHitLift - left.comparison.meanHitLift
    || right.comparison.matchTwoLift - left.comparison.matchTwoLift
    || right.comparison.brierLift - left.comparison.brierLift
    || left.pivotMode.localeCompare(right.pivotMode));
  const selectedPivotMode = pivotCalibration[0].pivotMode;
  const training = [];
  for (const track of V9_TRACK_KEYS) {
    for (const window of V9_WINDOWS) {
      if (track === 'combined') {
        for (const combinationWeights of V9_COMBINATION_WEIGHTS) {
          const metrics = evaluateV9Arm(split.ordered, split.train, track, window, {
            pivotMode: selectedPivotMode,
            combinationWeights,
            analysisCache
          });
          training.push({
            track,
            window,
            pivotMode: selectedPivotMode,
            combinationWeights,
            metrics,
            comparison: compareV9TicketOutcomes(metrics, trainingControls.get(window))
          });
        }
      } else {
        const metrics = evaluateV9Arm(split.ordered, split.train, track, window, {
          pivotMode: selectedPivotMode,
          analysisCache
        });
        training.push({
          track,
          window,
          pivotMode: selectedPivotMode,
          combinationWeights: null,
          metrics,
          comparison: compareV9TicketOutcomes(metrics, trainingControls.get(window))
        });
      }
    }
  }
  training.sort((left, right) => right.comparison.meanHitLift - left.comparison.meanHitLift
    || right.comparison.matchTwoLift - left.comparison.matchTwoLift
    || right.comparison.brierLift - left.comparison.brierLift
    || left.track.localeCompare(right.track));
  const selected = training[0];
  const selectedOptions = {
    pivotMode: selectedPivotMode,
    combinationWeights: selected.combinationWeights,
    analysisCache
  };
  const validationControl = evaluateV9Arm(split.ordered, split.validation, 'control', selected.window, selectedOptions);
  const validationChallenger = evaluateV9Arm(split.ordered, split.validation, selected.track, selected.window, selectedOptions);
  const validationGate = compareV9TicketOutcomes(validationChallenger, validationControl);
  const testControl = evaluateV9Arm(split.ordered, split.test, 'control', selected.window, selectedOptions);
  const testChallenger = evaluateV9Arm(split.ordered, split.test, selected.track, selected.window, selectedOptions);
  const testGate = compareV9TicketOutcomes(testChallenger, testControl);
  const promotionAllowed = validationGate.passed && testGate.passed;
  const compact = ({ perDraw, ...metrics }) => metrics;
  const report = {
    schemaVersion: 1,
    generatedAt: archive.retrievedAt,
    archiveChecksum: archive.checksum,
    archiveDrawCount: archive.drawCount,
    objective: 'Unordered Cash 5 ticket outcomes per paid line; higher hit and prize-tier rates and lower multi-label Brier are better.',
    splitDates: {
      train: [split.ordered[split.train.start].date, split.ordered[split.train.end - 1].date],
      validation: [split.ordered[split.validation.start].date, split.ordered[split.validation.end - 1].date],
      test: [split.ordered[split.test.start].date, split.ordered[split.test.end - 1].date]
    },
    training: training.map(item => ({
      track: item.track,
      window: item.window,
      pivotMode: item.pivotMode,
      combinationWeights: item.combinationWeights,
      meanHitsPerLine: item.metrics.meanHitsPerLine,
      matchTwoRate: item.metrics.matchTwoRate,
      matchThreeRate: item.metrics.matchThreeRate,
      brier: item.metrics.brier,
      control: compact(trainingControls.get(item.window)),
      comparison: item.comparison
    })),
    pivotCalibration: {
      selectedMode: selectedPivotMode,
      training: pivotCalibration.map(item => ({
        pivotMode: item.pivotMode,
        window: item.window,
        meanHitsPerLine: item.metrics.meanHitsPerLine,
        matchTwoRate: item.metrics.matchTwoRate,
        matchThreeRate: item.metrics.matchThreeRate,
        brier: item.metrics.brier,
        comparison: item.comparison
      }))
    },
    selectedChallenger: {
      track: selected.track,
      window: selected.window,
      pivotMode: selectedPivotMode,
      combinationWeights: selected.combinationWeights
    },
    validation: { control: compact(validationControl), challenger: compact(validationChallenger), gate: validationGate },
    test: { control: compact(testControl), challenger: compact(testChallenger), gate: testGate },
    promotionAllowed,
    activeTrack: promotionAllowed ? selected.track : 'control',
    pivotMode: selectedPivotMode
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`V9 selected ${selected.track}/${selected.window}; promotion ${promotionAllowed ? 'allowed' : 'denied'}.`);
  console.log(`Report: ${REPORT_PATH}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
