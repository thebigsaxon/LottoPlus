import { onesDigit } from './onesAnalysis.js';
import {
  analyzeNextDrawBoard,
  NEXT_DRAW_ANALYZER_VERSION,
  snapshotNextPatternSignals
} from './patternRecommendations.js?v=7';
import {
  recommendTensBands,
  tensDigitForNumber
} from './fuzzyTens.js?v=3';

export const PREDICTION_TRACKER_VERSION = 4;
export const PREDICTION_BACKFILL_COUNT = 10;

export const PATTERN_SHORTHAND = {
  repeat: 'AR',
  vertical: 'SC',
  sister: 'SS',
  inline: 'IM',
  diagonal: 'DM',
  sisterOutput: 'SO',
  lPattern: 'LP'
};

export const PATTERN_LABELS = {
  repeat: 'Adjacent repeat',
  vertical: 'Same-column run',
  sister: 'Sister shift',
  inline: 'Inline mathematics',
  diagonal: 'Diagonal mathematics',
  sisterOutput: 'Sister-output mathematics',
  lPattern: 'L-pattern mathematics'
};

function uniqueSortedNumbers(values) {
  return [...new Set((values || []).map(Number))].sort((a, b) => a - b);
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function chronologicalDraws(draws = []) {
  return (Array.isArray(draws) ? draws : [])
    .filter(draw => typeof draw?.date === 'string'
      && Array.isArray(draw.numbers)
      && draw.numbers.length === 5
      && draw.numbers.every(number => Number.isInteger(Number(number)) && Number(number) >= 1 && Number(number) <= 42))
    .map(draw => ({ ...draw, id: String(draw.id || draw.date), numbers: draw.numbers.map(Number).sort((a, b) => a - b) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function rate(hits, trials) {
  return trials ? hits / trials : null;
}

function operationSuffix(operation, explanation = '') {
  if (operation === 'add') return explanation.includes('→') ? '+M' : '+';
  if (operation === 'subtract') return '−A';
  if (operation === 'borrow-left' || operation === 'borrow-right') return '−B';
  if (operation === 'left') return '←';
  if (operation === 'right') return '→';
  return '';
}

export function patternSignalCode(signal = {}) {
  const family = PATTERN_SHORTHAND[signal.pattern] || String(signal.pattern || '—').toUpperCase();
  const suffix = operationSuffix(signal.operation, signal.explanation);
  return suffix ? `${family}:${suffix}` : family;
}

export function clearCandidateState(workspace = {}) {
  return {
    ...workspace,
    candidateDigits: [],
    selectedEvidenceDigit: null,
    fullCandidates: [],
    rowBuilder: []
  };
}

export function validateTicketRow(numbers) {
  const normalized = uniqueSortedNumbers(numbers);
  const valid = normalized.length === 5 && normalized.every(number => Number.isInteger(number) && number >= 1 && number <= 42);
  return { valid, numbers: valid ? normalized : [] };
}

export function createDraftRow(numbers, label = 'uncertain', note = '', metadata = {}) {
  const result = validateTicketRow(numbers);
  if (!result.valid) throw new Error('A ticket row requires five unique Cash 5 numbers from 1 to 42.');
  const filters = Array.from({ length: 5 }, (_, column) => {
    const value = metadata.tensFilters?.[column];
    return Number.isInteger(value) && value >= 0 && value <= 4 ? value : null;
  });
  const sources = Array.from({ length: 5 }, (_, column) => {
    const source = metadata.tensSources?.[column];
    return ['automatic', 'manual', 'empty'].includes(source) ? source : 'empty';
  });
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    source: 'user',
    available: true,
    numbers: result.numbers,
    digits: result.numbers.map(onesDigit),
    tensBands: result.numbers.map(tensDigitForNumber),
    tensFilters: filters,
    tensSources: sources,
    label: ['strong', 'uncertain', 'ugly'].includes(label) ? label : 'uncertain',
    note: String(note || '')
  };
}

/** Legacy version-3 snapshot creator retained for imported projects and tests. */
export function finalizeSession(workspace, latestDraw, now = new Date()) {
  if (!latestDraw) throw new Error('A latest draw is required to finalize a session.');
  if (!workspace.draftRows?.length) throw new Error('Add at least one complete ticket row before finalizing.');

  return {
    id: `session-${now.getTime()}`,
    kind: 'legacy',
    status: 'locked',
    finalizedAt: now.toISOString(),
    baselineDrawId: latestDraw.id,
    baselineDate: latestDraw.date,
    motifSelections: structuredCloneSafe(workspace.motifSelections || []),
    motifMatches: structuredCloneSafe(workspace.motifMatches || []),
    candidateDigits: [],
    fullCandidates: [],
    rows: structuredCloneSafe(workspace.draftRows).map(row => ({ source: 'user', available: true, ...row })),
    patternSignals: [],
    result: null
  };
}

function buildSystemRow(history, analysis, rank) {
  const line = analysis.lines.find(item => item.rank === rank);
  const base = {
    id: `system-rank-${rank}`,
    source: 'system',
    rank,
    analyzerVersion: NEXT_DRAW_ANALYZER_VERSION,
    label: 'strong',
    note: '',
    createdFromDrawCount: history.length,
    candidateEvidence: (line?.positions || []).map((position, column) => {
      const columnResult = analysis.columns[column];
      return {
        column,
        number: position.number,
        digit: position.digit,
        score: Math.round(position.combinedScore),
        combinedScore: position.combinedScore,
        endingScore: position.endingScore,
        numberScore: position.numberScore,
        frequencyScore: position.frequencyScore,
        stateScore: position.stateScore,
        stateLabels: [...(position.stateLabels || [])],
        patternScore: position.patternScore,
        streamScore: position.streamScore,
        streamDistance: position.distance,
        forecast: columnResult?.stream?.forecast ?? null,
        recentValues: columnResult?.stream?.recentValues || [],
        deltas: columnResult?.stream?.deltas || [],
        averageDelta: columnResult?.stream?.averageDelta ?? null,
        familyCount: position.familyCount,
        families: (position.families || []).map(family => ({
        key: family.key,
        code: PATTERN_SHORTHAND[family.key] || family.key,
        label: family.label,
        reliability: family.reliability,
        baselineRate: family.baselineRate,
        lift: family.lift,
        hits: family.hits,
        trials: family.trials
      }))
      };
    })
  };
  if (!line?.available) {
    return {
      ...base,
      available: false,
      unavailableReason: line?.unavailableReason || `System line ${rank} is unavailable.`,
      numbers: [],
      digits: [],
      tensBands: [],
      tensFilters: [],
      tensSources: []
    };
  }
  const tensBands = line.numbers.map(tensDigitForNumber);
  return {
    ...base,
    available: true,
    unavailableReason: '',
    numbers: [...line.numbers],
    digits: [...line.digits],
    tensBands,
    tensFilters: tensBands,
    tensSources: Array(5).fill('automatic'),
    selectionScore: {
      combined: line.totalCombinedScore,
      ending: line.totalEndingScore,
      number: line.totalNumberScore,
      pattern: line.totalPatternScore,
      stream: line.totalStreamScore
    },
    numberEvidence: base.candidateEvidence
  };
}

export function createPredictionSession(history, options = {}) {
  const chronological = chronologicalDraws(history);
  const window = chronological.slice(-50);
  const latestDraw = window.at(-1);
  if (!latestDraw) return null;
  const analysis = analyzeNextDrawBoard(window, { limit: 3, includeWalkForward: false });
  const rawSignals = snapshotNextPatternSignals(window);
  const patternSignals = rawSignals.map((signal, index) => ({
    id: `signal-${latestDraw.date}-${index}-${signal.pattern}-${signal.targetColumn}-${signal.digit}`,
    ...signal,
    code: patternSignalCode(signal),
    label: PATTERN_LABELS[signal.pattern] || signal.pattern,
    sourceDrawIds: signal.sourceDrawIds || []
  }));
  return {
    id: `prediction-${latestDraw.id}`,
    kind: 'prediction',
    trackingVersion: PREDICTION_TRACKER_VERSION,
    analyzerVersion: NEXT_DRAW_ANALYZER_VERSION,
    creationSource: options.creationSource || 'official',
    status: 'pending',
    finalizedAt: options.createdAt || `${latestDraw.date}T23:59:59.000Z`,
    baselineDrawId: latestDraw.id,
    baselineDate: latestDraw.date,
    historyStartDate: window[0].date,
    historyDrawCount: window.length,
    motifSelections: [],
    motifMatches: [],
    candidateDigits: [],
    fullCandidates: [],
    rows: [1, 2, 3].map(rank => buildSystemRow(window, analysis, rank)),
    streamSnapshot: analysis.columns.map(result => ({
      column: result.column,
      available: result.available,
      unavailableReason: result.unavailableReason,
      ...(result.stream || {})
    })),
    patternSignals,
    result: null
  };
}

export function appendDraftRowsToPendingSession(workspace, latestDraw, history, now = new Date()) {
  if (!latestDraw) throw new Error('A latest draw is required to save rows for the next drawing.');
  if (!workspace.draftRows?.length) throw new Error('Add at least one complete ticket row before finalizing.');
  let sessions = [...(workspace.sessions || [])];
  let sessionIndex = sessions.findIndex(session => session.kind === 'prediction'
    && !session.result && session.baselineDate === latestDraw.date);
  if (sessionIndex < 0) {
    const prediction = createPredictionSession(history, { creationSource: 'manual', createdAt: now.toISOString() });
    if (!prediction) throw new Error('The current draw history cannot create a pending prediction session.');
    sessions.unshift(prediction);
    sessionIndex = 0;
  }
  const session = sessions[sessionIndex];
  const existing = new Set(session.rows
    .filter(row => row.source === 'user' && row.available !== false)
    .map(row => row.numbers.join(',')));
  const additions = workspace.draftRows.filter(row => {
    const key = row.numbers.join(',');
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  }).map((row, index) => ({
    ...structuredCloneSafe(row),
    id: `user-${session.baselineDate}-${session.rows.filter(item => item.source === 'user').length + index + 1}`,
    source: 'user',
    available: true,
    savedAt: now.toISOString(),
    digits: row.numbers.map(onesDigit),
    tensBands: row.numbers.map(tensDigitForNumber)
  }));
  const updatedSession = { ...session, rows: [...session.rows, ...additions] };
  sessions[sessionIndex] = updatedSession;
  return {
    workspace: { ...workspace, sessions, draftRows: [] },
    session: updatedSession,
    addedCount: additions.length
  };
}

export function formatSessionForMessage(session) {
  const rows = (session?.rows || []).filter(row => row.available !== false && row.numbers?.length === 5);
  if (!rows.length) return '';
  const heading = `Cash 5 slips — next draw after ${session.baselineDate}`;
  let userIndex = 0;
  const lines = rows.map((row, index) => {
    if (row.source !== 'system') userIndex += 1;
    const label = session.kind !== 'prediction' ? `Row ${index + 1}`
      : row.source === 'system'
        ? `${Number(session.analyzerVersion || session.trackingVersion || 1) >= 2 ? 'System Line' : 'System Rank'} ${row.rank}`
        : `User Row ${userIndex}`;
    return `${label}: ${row.numbers.map(number => String(number).padStart(2, '0')).join(' - ')}`;
  });
  return [heading, ...lines].join('\n');
}

export function editSessionInBuilder(workspace, sessionId, now = Date.now()) {
  const sessions = workspace?.sessions || [];
  const session = sessions.find(item => item.id === sessionId);
  if (!session) return workspace;
  const userRows = session.kind === 'prediction'
    ? session.rows.filter(row => row.source === 'user' && row.available !== false)
    : session.rows.filter(row => row.available !== false);
  const editableRows = userRows.map((row, index) => ({
    ...structuredCloneSafe(row),
    id: session.result ? `row-${now}-${index}` : row.id,
    source: 'user'
  }));
  const nextSessions = session.kind === 'prediction' && !session.result
    ? sessions.map(item => item.id === session.id
      ? { ...item, rows: item.rows.filter(row => row.source !== 'user') }
      : item)
    : session.result ? sessions : sessions.filter(item => item.id !== sessionId);
  return {
    ...workspace,
    draftRows: [...(workspace.draftRows || []), ...editableRows],
    sessions: nextSessions
  };
}

function scoreRow(row, actualNumbers) {
  if (row.available === false || !Array.isArray(row.numbers) || row.numbers.length !== 5) {
    return { rowId: row.id, source: row.source, rank: row.rank || null, available: false, unavailableReason: row.unavailableReason || '' };
  }
  const winningNumbers = new Set(actualNumbers);
  const positions = row.numbers.map((selected, column) => {
    const actual = actualNumbers[column];
    const exact = selected === actual;
    const numberHit = winningNumbers.has(selected);
    const matchedColumn = numberHit ? actualNumbers.indexOf(selected) : null;
    const endingHit = onesDigit(selected) === onesDigit(actual);
    const tensHit = tensDigitForNumber(selected) === tensDigitForNumber(actual);
    const diagnostic = exact ? 'exact position match'
      : numberHit ? `number drawn in Ball ${matchedColumn + 1}`
      : endingHit && !tensHit ? 'ending right / tens wrong'
        : tensHit && !endingHit ? 'tens right / ending wrong'
          : 'both wrong';
    return { column, selected, actual, exact, numberHit, matchedColumn, endingHit, tensHit, diagnostic };
  });
  const hits = positions.filter(item => item.numberHit).length;
  const exactPositionHits = positions.filter(item => item.exact).length;
  const endingHits = positions.filter(item => item.endingHit).length;
  const tensHits = positions.filter(item => item.tensHit).length;
  return {
    rowId: row.id,
    source: row.source || 'user',
    rank: row.rank || null,
    available: true,
    hits,
    misses: 5 - hits,
    matchRate: rate(hits, 5),
    missRate: rate(5 - hits, 5),
    exactPositionHits,
    endingHits,
    endingRate: rate(endingHits, 5),
    tensHits,
    tensRate: rate(tensHits, 5),
    matchedNumbers: positions.filter(item => item.numberHit).map(item => item.selected),
    missedNumbers: positions.filter(item => !item.numberHit).map(item => item.selected),
    positions
  };
}

function aggregatePatternScores(patternScores) {
  const byFamily = new Map();
  const byOperation = new Map();
  patternScores.forEach(score => {
    const family = byFamily.get(score.pattern) || {
      pattern: score.pattern,
      code: PATTERN_SHORTHAND[score.pattern] || score.pattern,
      label: PATTERN_LABELS[score.pattern] || score.pattern,
      hits: 0,
      trials: 0
    };
    family.trials += 1;
    if (score.hit) family.hits += 1;
    byFamily.set(score.pattern, family);

    const operationKey = `${score.pattern}:${score.code || score.operation}`;
    const operation = byOperation.get(operationKey) || {
      key: operationKey,
      pattern: score.pattern,
      operation: score.operation,
      code: score.code,
      hits: 0,
      trials: 0
    };
    operation.trials += 1;
    if (score.hit) operation.hits += 1;
    byOperation.set(operationKey, operation);
  });
  const finish = item => ({ ...item, misses: item.trials - item.hits, rate: rate(item.hits, item.trials) });
  return {
    families: [...byFamily.values()].map(finish).sort((a, b) => b.rate - a.rate || b.trials - a.trials || a.code.localeCompare(b.code)),
    operations: [...byOperation.values()].map(finish).sort((a, b) => b.rate - a.rate || b.trials - a.trials || a.code.localeCompare(b.code))
  };
}

export function scorePredictionSession(session, actualDraw) {
  if (!session || session.result || !actualDraw || actualDraw.date <= session.baselineDate) return session;
  const numbers = [...actualDraw.numbers].map(Number).sort((a, b) => a - b);
  const rowScores = (session.rows || []).map(row => scoreRow(row, numbers));
  const patternSignalScores = (session.patternSignals || []).map(signal => {
    const actualDigit = onesDigit(numbers[signal.targetColumn]);
    return {
      signalId: signal.id,
      pattern: signal.pattern,
      operation: signal.operation,
      code: signal.code || patternSignalCode(signal),
      targetColumn: signal.targetColumn,
      predictedDigit: signal.digit,
      actualDigit,
      hit: signal.digit === actualDigit
    };
  });
  return {
    ...session,
    status: 'scored',
    result: {
      drawId: String(actualDraw.id || actualDraw.date),
      date: actualDraw.date,
      numbers,
      candidateHits: 0,
      rowScores,
      patternSignalScores,
      patternSummary: aggregatePatternScores(patternSignalScores)
    }
  };
}

/** Recalculate persisted prediction results after scoring rules evolve. */
export function refreshPredictionSessionScores(sessions = []) {
  return (sessions || []).map(session => {
    if (session?.kind !== 'prediction' || !session.result?.numbers?.length) return session;
    return scorePredictionSession(
      { ...session, status: 'pending', result: null },
      {
        id: session.result.drawId,
        date: session.result.date,
        numbers: session.result.numbers
      }
    );
  });
}

export function scoreSession(session, draws) {
  if (!session || session.result) return session;
  const nextDraw = chronologicalDraws(draws).find(draw => draw.date > session.baselineDate);
  if (!nextDraw) return session;
  if (session.kind === 'prediction') return scorePredictionSession(session, nextDraw);
  const winning = new Set(nextDraw.numbers);
  return {
    ...session,
    status: 'scored',
    result: {
      drawId: nextDraw.id,
      date: nextDraw.date,
      numbers: nextDraw.numbers,
      candidateHits: (session.fullCandidates || []).filter(number => winning.has(number)).length,
      rowScores: (session.rows || []).map(row => ({
        rowId: row.id,
        source: row.source || 'user',
        available: true,
        hits: row.numbers.filter(number => winning.has(number)).length
      }))
    }
  };
}

export function scorePendingSessions(sessions, draws) {
  return (sessions || []).map(session => scoreSession(session, draws));
}

function predictionSessionForBaseline(sessions, baselineDate) {
  return sessions.find(session => session.kind === 'prediction' && session.baselineDate === baselineDate);
}

function migratePendingPredictionSessions(workspace, chronological, now) {
  const sessions = (workspace.sessions || []).map(session => {
    if (session.kind !== 'prediction' || session.result
        || Number(session.analyzerVersion || session.trackingVersion || 1) >= NEXT_DRAW_ANALYZER_VERSION) {
      return session;
    }
    const history = chronological.filter(draw => draw.date <= session.baselineDate);
    const rebuilt = createPredictionSession(history, {
      creationSource: `model-v${NEXT_DRAW_ANALYZER_VERSION}-migration`,
      createdAt: session.finalizedAt || now.toISOString()
    });
    if (!rebuilt) return session;
    const userRows = (session.rows || []).filter(row => row.source !== 'system');
    return {
      ...rebuilt,
      id: session.id,
      finalizedAt: session.finalizedAt || rebuilt.finalizedAt,
      rows: [...rebuilt.rows, ...structuredCloneSafe(userRows)],
      migratedFromAnalyzerVersion: Number(session.analyzerVersion || session.trackingVersion || 1)
    };
  });
  return {
    ...workspace,
    sessions,
    predictionTracker: {
      version: PREDICTION_TRACKER_VERSION,
      initializedAt: workspace.predictionTracker?.initializedAt || now.toISOString(),
      upgradedAt: now.toISOString(),
      latestOfficialDrawDate: chronological.at(-1)?.date || workspace.predictionTracker?.latestOfficialDrawDate || ''
    }
  };
}

export function initializePredictionLedger(workspace, draws, now = new Date()) {
  const tracker = workspace?.predictionTracker;
  if (tracker?.version === PREDICTION_TRACKER_VERSION) return { workspace, initialized: false };
  const chronological = chronologicalDraws(draws);
  if (chronological.length < 2) return { workspace, initialized: false };
  if (Number(tracker?.version) > 0 && Number(tracker.version) < PREDICTION_TRACKER_VERSION) {
    return {
      initialized: true,
      workspace: migratePendingPredictionSessions(workspace, chronological, now)
    };
  }
  const existing = [...(workspace.sessions || [])];
  const firstTargetIndex = Math.max(1, chronological.length - PREDICTION_BACKFILL_COUNT);
  const generated = [];

  for (let targetIndex = firstTargetIndex; targetIndex < chronological.length; targetIndex += 1) {
    const baseline = chronological[targetIndex - 1];
    const already = predictionSessionForBaseline([...existing, ...generated], baseline.date);
    if (already) continue;
    const pending = createPredictionSession(chronological.slice(0, targetIndex), { creationSource: 'backfill' });
    if (pending) generated.push(scorePredictionSession(pending, chronological[targetIndex]));
  }
  const latest = chronological.at(-1);
  if (!predictionSessionForBaseline([...existing, ...generated], latest.date)) {
    const pending = createPredictionSession(chronological, { creationSource: 'backfill-pending', createdAt: now.toISOString() });
    if (pending) generated.push(pending);
  }
  const sessions = [...generated, ...existing]
    .sort((a, b) => b.baselineDate.localeCompare(a.baselineDate) || a.id.localeCompare(b.id));
  return {
    initialized: true,
    workspace: {
      ...workspace,
      predictionTracker: {
        version: PREDICTION_TRACKER_VERSION,
        initializedAt: now.toISOString(),
        latestOfficialDrawDate: latest.date
      },
      sessions
    }
  };
}

export function reconcileOfficialDraws(workspace, previousDraws, officialDraws, now = new Date()) {
  const previous = chronologicalDraws(previousDraws);
  const official = chronologicalDraws(officialDraws);
  if (!official.length) return { workspace, processedDraws: [] };
  const previousLatestDate = previous.at(-1)?.date || '';
  const newDraws = official.filter(draw => draw.date > previousLatestDate);
  if (!newDraws.length) return { workspace, processedDraws: [] };
  let sessions = [...(workspace.sessions || [])];

  newDraws.forEach(actualDraw => {
    sessions = sessions.map(session => (
      !session.result && session.baselineDate < actualDraw.date
        ? session.kind === 'prediction'
          ? scorePredictionSession(session, actualDraw)
          : scoreSession(session, [actualDraw])
        : session
    ));
    if (!predictionSessionForBaseline(sessions, actualDraw.date)) {
      const history = official.filter(draw => draw.date <= actualDraw.date);
      const pending = createPredictionSession(history, { creationSource: 'official', createdAt: now.toISOString() });
      if (pending) sessions.push(pending);
    }
  });

  sessions.sort((a, b) => b.baselineDate.localeCompare(a.baselineDate) || a.id.localeCompare(b.id));
  return {
    processedDraws: newDraws,
    workspace: {
      ...workspace,
      predictionTracker: {
        version: PREDICTION_TRACKER_VERSION,
        initializedAt: workspace.predictionTracker?.initializedAt || now.toISOString(),
        latestOfficialDrawDate: official.at(-1).date
      },
      sessions
    }
  };
}

export function autoSelectTensFilters(workspace, draws) {
  const filters = Array.from({ length: 5 }, (_, column) => {
    const value = workspace?.slipTensFilters?.[column];
    return Number.isInteger(value) && value >= 0 && value <= 4 ? value : null;
  });
  const sources = Array.from({ length: 5 }, (_, column) => {
    const source = workspace?.slipTensSources?.[column];
    return ['automatic', 'manual', 'empty'].includes(source) ? source : 'empty';
  });
  const mapped = new Map((workspace?.futureDigitMap || []).map(item => [Number(item.column), Number(item.digit)]));
  const mappedDigits = Array.from({ length: 5 }, (_, column) => mapped.get(column) ?? null);
  const fixedNumbers = Array.from({ length: 5 }, (_, column) => {
    const value = workspace?.slipNumbers?.[column];
    return sources[column] === 'manual' && Number.isInteger(value) ? value : null;
  });
  const nextFilters = filters.map((value, column) => sources[column] === 'manual' ? value : null);

  for (let column = 0; column < 5; column += 1) {
    if (sources[column] === 'manual') continue;
    const recommendations = recommendTensBands(draws, {
      mappedDigits,
      tensFilters: nextFilters,
      fixedNumbers
    });
    const primary = recommendations[column]?.primary;
    if (primary?.available) {
      nextFilters[column] = primary.digit;
      sources[column] = 'automatic';
    } else {
      nextFilters[column] = null;
      sources[column] = 'empty';
    }
  }
  return { tensFilters: nextFilters, tensSources: sources };
}

export function summarizePredictionHistory(sessions = []) {
  const modelGroups = new Map();
  const groupTemplate = version => new Map([
    ['system-1', { key: 'system-1', label: version >= 2 ? 'System Line 1' : 'System Rank 1', exactHits: 0, endingHits: 0, tensHits: 0, trials: 0, lines: 0 }],
    ['system-2', { key: 'system-2', label: version >= 2 ? 'System Line 2' : 'System Rank 2', exactHits: 0, endingHits: 0, tensHits: 0, trials: 0, lines: 0 }],
    ['system-3', { key: 'system-3', label: version >= 2 ? 'System Line 3' : 'System Rank 3', exactHits: 0, endingHits: 0, tensHits: 0, trials: 0, lines: 0 }],
    ['user', { key: 'user', label: 'Your saved lines', exactHits: 0, endingHits: 0, tensHits: 0, trials: 0, lines: 0 }]
  ]);
  (sessions || []).filter(session => session.kind === 'prediction' && session.result).forEach(session => {
    const version = Number(session.analyzerVersion || session.trackingVersion || 1);
    const model = modelGroups.get(version) || { version, groups: groupTemplate(version), patternScores: [] };
    session.result.rowScores.forEach(score => {
      if (!score.available) return;
      const key = score.source === 'system' ? `system-${score.rank}` : 'user';
      const group = model.groups.get(key);
      if (!group) return;
      group.lines += 1;
      group.trials += 5;
      group.exactHits += score.hits || 0;
      group.endingHits += score.endingHits || 0;
      group.tensHits += score.tensHits || 0;
    });
    model.patternScores.push(...(session.result.patternSignalScores || []));
    modelGroups.set(version, model);
  });
  const finishGroups = groups => [...groups.values()].map(group => ({
    ...group,
    exactRate: rate(group.exactHits, group.trials),
    missRate: rate(group.trials - group.exactHits, group.trials),
    endingRate: rate(group.endingHits, group.trials),
    tensRate: rate(group.tensHits, group.trials)
  }));
  const models = [...modelGroups.values()]
    .sort((a, b) => b.version - a.version)
    .map(model => ({
      version: model.version,
      groups: finishGroups(model.groups),
      patterns: aggregatePatternScores(model.patternScores)
    }));
  const primary = models[0] || { version: NEXT_DRAW_ANALYZER_VERSION, groups: finishGroups(groupTemplate(NEXT_DRAW_ANALYZER_VERSION)), patterns: aggregatePatternScores([]) };
  return {
    models,
    groups: primary.groups,
    patterns: primary.patterns
  };
}
