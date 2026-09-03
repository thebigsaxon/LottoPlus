/** Compose Core / Spread / Guard tickets from a workbench 0–9 pool. */

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

function numbersForEnding(digit) {
  return Array.from({ length: 42 }, (_, index) => index + 1).filter(number => number % 10 === digit);
}

function spreadOrderedNumbers(digit, avoid = new Set()) {
  const all = numbersForEnding(digit);
  const interleave = (list) => {
    const buckets = [0, 1, 2, 3, 4].map(tens => list.filter(number => tensBand(number) === tens));
    const ordered = [];
    let safety = 0;
    while (ordered.length < list.length && safety < 40) {
      buckets.forEach(bucket => {
        if (bucket.length) ordered.push(bucket.shift());
      });
      safety += 1;
    }
    return ordered;
  };
  return [
    ...interleave(all.filter(number => !avoid.has(number))),
    ...interleave(all.filter(number => avoid.has(number)))
  ];
}

function reducedMatrix(pool) {
  return pool.flatMap(digit => numbersForEnding(digit));
}

function pickFifteen(pool, equations, avoidNumbers) {
  const ranked = rankPoolEndings(pool, equations);
  const queues = new Map(ranked.map(digit => [digit, spreadOrderedNumbers(digit, avoidNumbers)]));
  const selected = [];
  let index = 0;
  let stalled = 0;
  while (selected.length < 15 && stalled < ranked.length) {
    const digit = ranked[index % ranked.length];
    index += 1;
    const queue = queues.get(digit);
    while (queue.length && selected.includes(queue[0])) queue.shift();
    if (queue.length) {
      selected.push(queue.shift());
      stalled = 0;
    } else {
      stalled += 1;
    }
  }
  return selected;
}

function dealLines(selected) {
  const lines = LINE_ROLES.map(role => ({ role, label: LINE_LABELS[role], numbers: [] }));
  let roleIndex = 0;
  selected.forEach(number => {
    while (roleIndex < lines.length && lines[roleIndex].numbers.length >= 5) roleIndex += 1;
    if (roleIndex >= lines.length) return;
    lines[roleIndex].numbers.push(number);
  });
  return lines;
}

function endingClause(digit, equations = [], pivots = []) {
  if (pivots.includes(digit) && equations.some(item => item.operation === 'pivot' && item.result === digit)) {
    return `ending ${digit} is the pivot`;
  }
  const arithmetic = equations.find(item => item.result === digit && item.operation !== 'pivot');
  if (arithmetic?.explanation) return `ending ${digit} from ${arithmetic.explanation}`;
  return `ending ${digit} is in the pool`;
}

function roleClause(role, digit, mostSupported) {
  if (role === 'core') {
    return `Core plays the strongest tell (${mostSupported} had the most equations).`;
  }
  if (role === 'spread') {
    return 'Spread covers the same pool with different tens.';
  }
  return digit === mostSupported
    ? `Guard still stays inside the pool so the tell is not abandoned.`
    : `Guard plays ${digit}, which had less support than ${mostSupported}.`;
}

export function reasonForNumber(number, role, context = {}) {
  const digit = Number(number) % 10;
  const ending = endingClause(digit, context.equations, context.pivots);
  const roleText = roleClause(role, digit, context.mostSupported);
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
  const pool = [...new Set(workbench?.combined?.digits || [])].sort((left, right) => left - right);
  const equations = workbench?.pool?.equations || [];
  const pivots = workbench?.activePivots || [];
  const sourceNumbers = new Set(workbench?.source?.numbers || []);
  const narrowReason = pool.length < NARROW_COMPOSE_POOL
    ? 'Pool is under 3 digits, so the app will not invent tickets outside the tell.'
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
  const matrix = reducedMatrix(pool);
  const selected = pickFifteen(pool, equations, sourceNumbers);
  const dealt = dealLines(selected);
  const lines = dealt.map((line, index) => {
    if (line.numbers.length < 5) {
      const reason = matrix.length < 15
        ? `This pool has ${matrix.length} numbers. ${LINE_LABELS[line.role]} stays empty so every ticket stays inside the pool.`
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
