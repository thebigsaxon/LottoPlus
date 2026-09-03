/**
 * Study-track mixture kept for inspector display and the checked v7 report.
 * It is not the live line generator: the v6 lift gate and unconstrained
 * recency bake-off did not authorize an improvement claim.
 */
export const NEXT_DRAW_STUDY_POLICY = Object.freeze({
  kind: 'evidence',
  priorStrength: 10,
  comboWeight: 0.70,
  historyWeight: 0.20,
  patternWeight: 0.05,
  stateWeight: 0.05,
  recencyHalfLife: 12,
  evidenceId: 'v9-study-tracks-2026-08-30'
});

/**
 * V9 live system lines are a reproducible, chance-honest control portfolio.
 * Challengers remain scored study tracks until a checked evaluation report
 * clears the validation and locked-test promotion gates.
 */
export const NEXT_DRAW_LIVE_POLICY = Object.freeze({
  kind: 'control',
  activeTrack: 'control',
  priorStrength: 0,
  comboWeight: 1,
  historyWeight: 0,
  patternWeight: 0,
  stateWeight: 0,
  recencyHalfLife: 12,
  evidenceId: 'v9-uniform-control-2026-08-30'
});

export const NEXT_DRAW_EVIDENCE_POLICY = NEXT_DRAW_LIVE_POLICY;

export const STUDY_SOURCE_KEYS = Object.freeze(['combo', 'history', 'pattern', 'hncde']);

export const STUDY_SOURCE_LABELS = Object.freeze({
  combo: 'Blue · Control',
  history: 'Red · Temporal',
  pattern: 'Green · Structure',
  hncde: 'Yellow · HNCDE'
});

export const NEXT_DRAW_TRACKS = Object.freeze([
  Object.freeze({ key: 'control', sourceKey: 'combo', color: 'blue', label: 'Blue · Control' }),
  Object.freeze({ key: 'temporal', sourceKey: 'history', color: 'red', label: 'Red · Temporal' }),
  Object.freeze({ key: 'structure', sourceKey: 'pattern', color: 'green', label: 'Green · Structure' }),
  Object.freeze({ key: 'hncde', sourceKey: 'hncde', color: 'yellow', label: 'Yellow · HNCDE' })
]);

export const NEXT_DRAW_PROMOTION_POLICY = Object.freeze({
  analyzerVersion: 9,
  reportId: 'v9-ticket-policy-2026-08-30',
  status: 'control-only',
  activeTrack: 'control',
  promotedTrack: null,
  pivotMode: 'high',
  archiveChecksum: 'ef0377d8798287532a1d3f988914add823f5fd9c4b15f634dec00a2a8c877004',
  evidenceId: NEXT_DRAW_LIVE_POLICY.evidenceId,
  gates: Object.freeze({
    validationPassed: false,
    lockedTestPassed: false,
    bootstrapLowerBoundPositive: false,
    matchTwoNonInferior: false,
    matchThreeNonInferior: false
  })
});
