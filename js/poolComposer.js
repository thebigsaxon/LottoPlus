/** Compose Core / Spread / Guard tickets from a workbench 0–9 pool. */
import { fullNumbersForPool } from './pivotWorkbench.js?v=4';

export const LINE_ROLES = Object.freeze(['core', 'spread', 'guard']);
export const LINE_LABELS = Object.freeze({
  core: 'Core',
  spread: 'Spread',
  guard: 'Guard'
});

export const NARROW_COMPOSE_POOL = 3;

function tensBand(number) {
  return Math.floor(Number(number) / 10);
}

function tensPhrase(number) {
  const tens = tensBand(number);
  if (tens === 0) return '1–9';
  if (tens === 4) return '40s';
  return `${tens}0s`;
}

function ballPlace(index) {
  return ['a low ball', 'a low-middle ball', 'a middle ball', 'a high-middle ball', 'a high ball'][index] || 'this line';
}

export function endingSupport(pool = [], equations = []) {
  const counts = new Map((pool || []).map(digit => [digit, 0]));
  (equations || []).forEach(item => {
    if (counts.has(item.result)) counts.set(item.result, (counts.get(item.result) || 0) + 1);
  });
  return counts;
}

export function rankPoolEndings(pool = [], equations = []) {
  const support = endingSupport(pool, equations);
  return [...pool].sort((left, right) => (support.get(right) || 0) - (support.get(left) || 0) || left - right);
}

export const LINE_DESCRIPTIONS = Object.freeze({
  core: 'Favor endings with more equations; use distinct endings first.',
  spread: 'Cover as many tens ranges as the remaining numbers allow.',
  guard: 'Balance ending coverage across all three lines.'
});

// Exhaustively compare valid five-number subsets of the remaining pool. The
// maximum search is C(42, 5); ordinary ending pools are substantially smaller.
// Role objectives are lexicographic, so spacing never overrides a line's job.
function chooseLine(available, role, support, usedEndingCounts, usedBands) {
  if (available.length < 5) return [];
  const endingCounts = Array(10).fill(0);
  const bandCounts = Array(5).fill(0);
  const chosen = [];
  let best = [];
  let bestScore = null;
  function visit(start, distinctEndings, distinctBands, newBands, equationCount, coverageCost, repetitionCost, spacingCost) {
    if (chosen.length === 5) {
      const score = role === 'core'
        ? [distinctEndings, -repetitionCost, equationCount, distinctBands, -spacingCost]
        : role === 'spread'
          ? [distinctBands, newBands, distinctEndings, -repetitionCost, -coverageCost, -spacingCost]
          : [-coverageCost, distinctEndings, distinctBands, -spacingCost];
      const difference = bestScore ? score.findIndex((value, i) => value !== bestScore[i]) : -1;
      if (!bestScore || (difference >= 0 && score[difference] > bestScore[difference])) {
        bestScore = score;
        best = [...chosen];
      }
      return;
    }
    const remaining = 5 - chosen.length;
    // Centers of five equal intervals across 1–42, used only as a spacing tie-break.
    const target = 1 + 41 * (chosen.length + 0.5) / 5;
    for (let i = start; i <= available.length - remaining; i += 1) {
      const number = available[i];
      const digit = number % 10;
      const band = tensBand(number);
      const newEnding = endingCounts[digit] === 0;
      const newBand = bandCounts[band] === 0;
      endingCounts[digit] += 1;
      bandCounts[band] += 1;
      chosen.push(number);
      visit(i + 1, distinctEndings + Number(newEnding), distinctBands + Number(newBand),
        newBands + Number(newBand && !usedBands.has(band)),
        equationCount + (support.get(digit) || 0),
        coverageCost + 2 * (usedEndingCounts[digit] + endingCounts[digit]) - 1,
        repetitionCost + 2 * endingCounts[digit] - 1,
        spacingCost + (number - target) ** 2);
      chosen.pop();
      endingCounts[digit] -= 1;
      bandCounts[band] -= 1;
    }
  }
  visit(0, 0, 0, 0, 0, 0, 0, 0);
  return best;
}

function endingClause(digit, equations = [], pivots = []) {
  if (pivots.includes(digit) && equations.some(item => item.operation === 'pivot' && item.result === digit)) {
    return `ending ${digit} is the pivot`;
  }
  const arithmetic = equations.find(item => item.result === digit && item.operation !== 'pivot');
  if (arithmetic?.explanation) return `ending ${digit} from ${arithmetic.explanation}`;
  return `ending ${digit} is in the pool`;
}

export function reasonForNumber(number, role, context = {}) {
  const digit = Number(number) % 10;
  const ending = endingClause(digit, context.equations, context.pivots);
  const roleText = LINE_DESCRIPTIONS[role] || '';
  const sorted = [...(context.lineNumbers || [])].sort((left, right) => left - right);
  const place = ballPlace(Math.max(0, sorted.indexOf(number)));
  return `${number} · ${ending}. ${roleText} ${tensPhrase(number)} for ${place}.`;
}

function emptyLine(role, rank, reason) {
  return {
    role,
    label: LINE_LABELS[role],
    rank,
    available: false,
    unavailableReason: reason,
    numbers: [],
    digits: [],
    positions: []
  };
}

export function systemLineLabel(row, analyzerVersion = 10) {
  if (row?.role && LINE_LABELS[row.role]) return LINE_LABELS[row.role];
  const rank = Number(row?.rank);
  if (analyzerVersion >= 10 && rank >= 1 && rank <= 3) return LINE_LABELS[LINE_ROLES[rank - 1]];
  if (analyzerVersion >= 9 && rank >= 1 && rank <= 3) return `System ${String.fromCharCode(64 + rank)}`;
  if (analyzerVersion >= 2) return `System Line ${rank}`;
  return `System Rank ${rank}`;
}

export function composePoolLines(workbench = {}) {
  const expanded = fullNumbersForPool(workbench?.combined?.digits);
  const pool = expanded.map(item => item.digit);
  const equations = workbench?.pool?.equations || [];
  const pivots = workbench?.activePivots || [];
  const narrowReason = pool.length < NARROW_COMPOSE_POOL
    ? 'Choose at least 3 endings to build system lines. Numbers stay inside the pool.'
    : '';
  if (narrowReason) {
    return {
      available: false,
      pool,
      selected: [],
      mostSupported: null,
      unavailableReason: narrowReason,
      lines: LINE_ROLES.map((role, index) => emptyLine(role, index + 1, narrowReason))
    };
  }

  const ranked = rankPoolEndings(pool, equations);
  const mostSupported = ranked[0];
  const matrix = expanded.flatMap(item => item.numbers).sort((left, right) => left - right);
  const support = endingSupport(pool, equations);
  const selected = [];
  const usedEndingCounts = Array(10).fill(0);
  const usedBands = new Set();
  const dealt = LINE_ROLES.map(role => {
    const used = new Set(selected);
    const numbers = chooseLine(matrix.filter(number => !used.has(number)), role, support, usedEndingCounts, usedBands);
    selected.push(...numbers);
    numbers.forEach(number => {
      usedEndingCounts[number % 10] += 1;
      usedBands.add(tensBand(number));
    });
    return { role, label: LINE_LABELS[role], numbers };
  });
  const lines = dealt.map((line, index) => {
    if (line.numbers.length < 5) {
      const reason = matrix.length < 15
        ? `This pool has ${matrix.length} eligible numbers; ${matrix.length - selected.length} remain unused. ${LINE_LABELS[line.role]} needs 5 unused numbers.`
        : `${LINE_LABELS[line.role]} could not fill five unique numbers from this pool.`;
      return emptyLine(line.role, index + 1, reason);
    }
    const numbers = [...line.numbers].sort((left, right) => left - right);
    const context = { equations, pivots, mostSupported, lineNumbers: numbers };
    const positions = numbers.map(number => ({
      number,
      digit: number % 10,
      tens: tensBand(number),
      role: line.role,
      reason: reasonForNumber(number, line.role, context)
    }));
    return {
      role: line.role,
      label: line.label,
      rank: index + 1,
      available: true,
      unavailableReason: '',
      numbers,
      digits: numbers.map(number => number % 10),
      positions
    };
  });

  return {
    available: lines.some(line => line.available),
    pool,
    selected,
    mostSupported,
    matrixSize: matrix.length,
    unavailableReason: '',
    lines
  };
}
