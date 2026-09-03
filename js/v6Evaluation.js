/** Deterministic chronological evaluation helpers for the v6 release policy. */

export function chronologicalSplit(draws = []) {
  const ordered = [...draws].sort((a, b) => a.date.localeCompare(b.date));
  const trainEnd = Math.floor(ordered.length * 0.6);
  const validationEnd = Math.floor(ordered.length * 0.8);
  return {
    ordered,
    train: { start: 50, end: trainEnd },
    validation: { start: trainEnd, end: validationEnd },
    test: { start: validationEnd, end: ordered.length }
  };
}

function seededRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function pairedBootstrap(differences = [], options = {}) {
  const iterations = Math.max(1, Number(options.iterations) || 10_000);
  const denominator = Math.max(1, Number(options.denominator) || 15);
  if (!differences.length) return { lower: 0, upper: 0, mean: 0, iterations };
  const random = seededRandom(options.seed ?? 0x5ca5_0006);
  const samples = Array.from({ length: iterations }, () => {
    let sum = 0;
    for (let index = 0; index < differences.length; index += 1) {
      sum += differences[Math.floor(random() * differences.length)];
    }
    return sum / (differences.length * denominator);
  }).sort((a, b) => a - b);
  const mean = differences.reduce((sum, value) => sum + value, 0) / (differences.length * denominator);
  return {
    lower: samples[Math.floor(iterations * 0.025)],
    upper: samples[Math.min(iterations - 1, Math.floor(iterations * 0.975))],
    mean,
    iterations
  };
}

export function compareEvaluations(challenger, baseline, options = {}) {
  const baselineByDate = new Map(baseline.perDraw.map(item => [item.date, item.exactHits]));
  const differences = challenger.perDraw
    .filter(item => baselineByDate.has(item.date))
    .map(item => item.exactHits - baselineByDate.get(item.date));
  const confidence = pairedBootstrap(differences, options);
  return {
    drawCount: differences.length,
    lift: confidence.mean,
    liftPercentagePoints: confidence.mean * 100,
    confidence,
    passed: confidence.mean >= 0.01 && confidence.lower > 0
  };
}

export function policyGrid() {
  const weights = [0, 0.05, 0.1, 0.2];
  const policies = [{ kind: 'eb50', priorStrength: 50, patternWeight: 0, stateWeight: 0, evidenceId: 'evaluation-eb50' }];
  weights.forEach(patternWeight => weights.forEach(stateWeight => {
    if (patternWeight + stateWeight <= 0 || patternWeight + stateWeight > 0.3000001) return;
    policies.push({
      kind: 'challenger', priorStrength: 50, patternWeight, stateWeight,
      evidenceId: `evaluation-p${patternWeight}-s${stateWeight}`
    });
  }));
  return policies;
}

export function fairDraw(random) {
  const available = Array.from({ length: 42 }, (_, index) => index + 1);
  const selected = [];
  for (let index = 0; index < 5; index += 1) {
    selected.push(available.splice(Math.floor(random() * available.length), 1)[0]);
  }
  return selected.sort((a, b) => a - b);
}

export function fairHistory(seed, count = 500) {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, index) => ({
    id: `synthetic-${seed}-${index}`,
    date: `s-${String(index).padStart(5, '0')}`,
    numbers: fairDraw(random)
  }));
}
