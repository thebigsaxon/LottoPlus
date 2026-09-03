/** Cash 5 Studio data validation and HTML sanitization. */

/**
 * Escapes special HTML characters to prevent XSS.
 * @param {*} str - Input value to escape
 * @returns {string} Escaped string
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseStrictInteger(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null;
  }

  if (typeof value !== 'string' || !/^[+-]?\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isValidISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

/**
 * Validates a single SC Palmetto Cash 5 draw.
 * @param {object} rawDraw - The draw record to validate
 * @returns {{ valid: boolean, errors: string[], draw: object|null }}
 */
export function validateDraw(rawDraw) {
  const errors = [];
  if (!rawDraw || typeof rawDraw !== 'object') {
    return { valid: false, errors: ['Draw item must be an object'], draw: null };
  }

  // 1. Date Validation
  let date = rawDraw.date;
  if (typeof date !== 'string' || !date.trim()) {
    errors.push('Missing or invalid draw date');
  } else {
    date = date.trim();
    if (!isValidISODate(date)) {
      errors.push(`Invalid date value: ${date}`);
    }
  }

  // 2. ID Validation / Normalization
  let id = rawDraw.id;
  if (id === null || id === undefined || String(id).trim() === '') {
    id = `draw-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  } else {
    id = String(id).trim();
  }

  // 3. Numbers Validation
  if (!Array.isArray(rawDraw.numbers)) {
    errors.push('Draw numbers must be an array');
  } else if (rawDraw.numbers.length !== 5) {
    errors.push(`Draw must contain exactly 5 main numbers, found ${rawDraw.numbers.length}`);
  }

  const numbers = [];
  if (Array.isArray(rawDraw.numbers)) {
    for (const num of rawDraw.numbers) {
      const parsed = parseStrictInteger(num);
      if (parsed === null) {
        errors.push(`Invalid main ball number: ${num}`);
      } else if (parsed < 1 || parsed > 42) {
        errors.push(`Main ball number ${parsed} out of range [1..42] for SC Palmetto Cash 5`);
      } else {
        numbers.push(parsed);
      }
    }
  }

  if (new Set(numbers).size !== numbers.length) {
    errors.push('Main ball numbers must be unique');
  }

  // Sort numbers in ascending order
  numbers.sort((a, b) => a - b);

  if (errors.length > 0) {
    return { valid: false, errors, draw: null };
  }

  return {
    valid: true,
    errors: [],
    draw: {
      id,
      date,
      numbers: numbers.slice(0, 5),
      bonus: null
    }
  };
}

/**
 * Validates an imported project structure.
 * @param {object} projectData - The parsed project object
 * Version 3 projects are native Cash 5 Studio documents. Version 2 LottoPlus
 * projects are accepted only when they contain Cash 5 data.
 */
export function validateProject(projectData) {
  const errors = [];
  if (!projectData || typeof projectData !== 'object') {
    return { valid: false, errors: ['Project file does not contain valid JSON data'], validDraws: [], manualLines: [], workspace: null };
  }

  if (!Array.isArray(projectData.draws)) {
    errors.push('Project file is missing a "draws" array');
    return { valid: false, errors, validDraws: [], manualLines: [], workspace: null };
  }

  const rawGame = String(projectData.gameType || projectData.activeGame || 'cash5').toLowerCase();
  if (rawGame !== 'cash5') {
    return {
      valid: false,
      errors: ['This project uses Powerball or Mega Millions data, which Cash 5 Studio does not support.'],
      validDraws: [],
      manualLines: [],
      workspace: null
    };
  }

  const validDraws = [];
  projectData.draws.forEach((item, index) => {
    const res = validateDraw(item);
    if (res.valid) {
      validDraws.push(res.draw);
    } else {
      errors.push(`Draw #${index + 1}: ${res.errors.join(', ')}`);
    }
  });

  const canonicalCellId = cellId => String(cellId).replace(/-b([0-4])-tens$/, '-b$1-ones');
  const manualLines = Array.isArray(projectData.manualLines) ? projectData.manualLines
    .filter(line => line && typeof line === 'object' && line.fromCellId && line.toCellId)
    .map(line => ({
      ...line,
      fromCellId: canonicalCellId(line.fromCellId),
      toCellId: canonicalCellId(line.toCellId)
    }))
    .filter(line => line.fromCellId !== line.toCellId) : [];
  const workspace = sanitizeWorkspace(projectData.workspace);

  return {
    valid: validDraws.length > 0,
    errors,
    validDraws,
    manualLines,
    workspace
  };
}

function sanitizeCash5Numbers(values, exactCount = null) {
  if (!Array.isArray(values)) return [];
  const numbers = [...new Set(values.map(value => parseStrictInteger(value)))]
    .filter(value => value !== null && value >= 1 && value <= 42)
    .sort((a, b) => a - b);
  return exactCount === null || numbers.length === exactCount ? numbers : [];
}

function sanitizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    const numbers = sanitizeCash5Numbers(row?.numbers, 5);
    const source = row?.source === 'system' ? 'system' : 'user';
    const available = row?.available !== false;
    if (numbers.length !== 5 && !(source === 'system' && !available)) return null;
    const sanitizeDigitArray = (values, maximum) => Array.from({ length: 5 }, (_, column) => {
      const parsed = parseStrictInteger(Array.isArray(values) ? values[column] : null);
      return parsed !== null && parsed >= 0 && parsed <= maximum ? parsed : null;
    });
    const tensFilters = sanitizeDigitArray(row?.tensFilters, 4);
    const tensSources = Array.from({ length: 5 }, (_, column) => {
      const value = row?.tensSources?.[column];
      return ['automatic', 'manual', 'empty'].includes(value) ? value : 'empty';
    });
    return {
      id: String(row.id || `imported-row-${index}`),
      source,
      rank: source === 'system' && [1, 2, 3].includes(Number(row.rank)) ? Number(row.rank) : null,
      role: source === 'system' && ['core', 'spread', 'guard'].includes(row?.role) ? row.role : null,
      reasons: Array.isArray(row?.reasons) ? row.reasons.map(reason => String(reason || '').slice(0, 400)).slice(0, 5) : [],
      analyzerVersion: source === 'system' ? Math.max(1, Number(row.analyzerVersion) || 1) : null,
      available,
      unavailableReason: String(row.unavailableReason || '').slice(0, 500),
      numbers,
      digits: numbers.length === 5 ? numbers.map(number => number % 10) : sanitizeDigitArray(row?.digits, 9),
      tensBands: numbers.length === 5 ? numbers.map(number => Math.floor(number / 10)) : [],
      tensFilters,
      tensSources,
      savedAt: String(row.savedAt || ''),
      createdFromDrawCount: Math.max(0, Number(row.createdFromDrawCount) || 0),
      selectionScore: row.selectionScore && typeof row.selectionScore === 'object' ? {
        tens: Number(row.selectionScore.tens) || 0,
        historyFit: Number(row.selectionScore.historyFit) || 0,
        combined: Number(row.selectionScore.combined) || 0,
        pattern: Number(row.selectionScore.pattern) || 0,
        stream: Number(row.selectionScore.stream) || 0,
        exactExpected: row.selectionScore.exactExpected === null || row.selectionScore.exactExpected === undefined ? null : Number(row.selectionScore.exactExpected) || 0,
        endingExpected: row.selectionScore.endingExpected === null || row.selectionScore.endingExpected === undefined ? null : Number(row.selectionScore.endingExpected) || 0,
        tensExpected: row.selectionScore.tensExpected === null || row.selectionScore.tensExpected === undefined ? null : Number(row.selectionScore.tensExpected) || 0
      } : null,
      numberEvidence: Array.isArray(row.numberEvidence) ? row.numberEvidence.slice(0, 5).map(item => ({
        number: Number(item?.number) || 0,
        historyFit: Number(item?.historyFit) || 0,
        rawHistoryFit: Number(item?.rawHistoryFit) || 0,
        motifFutureCount: Number(item?.motifFutureCount) || 0,
        sameColumnCount: Number(item?.sameColumnCount) || 0,
        sisterColumnCount: Number(item?.sisterColumnCount) || 0,
        frequency: Number(item?.frequency) || 0,
        mostRecentRowsAgo: item?.mostRecentRowsAgo === null ? null : Number(item?.mostRecentRowsAgo) || 0,
        tensScore: Number(item?.tensScore) || 0,
        tensReason: String(item?.tensReason || '').slice(0, 300)
      })) : [],
      candidateEvidence: Array.isArray(row.candidateEvidence) ? row.candidateEvidence.slice(0, 5).map(item => ({
        column: Math.max(0, Math.min(4, Number(item?.column) || 0)),
        number: Math.max(0, Math.min(42, Number(item?.number) || 0)),
        digit: Math.max(0, Math.min(9, Number(item?.digit) || 0)),
        score: Math.max(0, Math.min(100, Number(item?.score) || 0)),
        combinedScore: Math.max(0, Math.min(100, Number(item?.combinedScore) || 0)),
        patternScore: Math.max(0, Math.min(100, Number(item?.patternScore) || 0)),
        comboProbability: item?.comboProbability === null || item?.comboProbability === undefined ? null : Math.max(0, Math.min(1, Number(item.comboProbability) || 0)),
        comboEndingProbability: item?.comboEndingProbability === null || item?.comboEndingProbability === undefined ? null : Math.max(0, Math.min(1, Number(item.comboEndingProbability) || 0)),
        empiricalProbability: item?.empiricalProbability === null || item?.empiricalProbability === undefined ? null : Math.max(0, Math.min(1, Number(item.empiricalProbability) || 0)),
        modelProbability: item?.modelProbability === null || item?.modelProbability === undefined ? null : Math.max(0, Math.min(1, Number(item.modelProbability) || 0)),
        endingProbability: item?.endingProbability === null || item?.endingProbability === undefined ? null : Math.max(0, Math.min(1, Number(item.endingProbability) || 0)),
        tensProbability: item?.tensProbability === null || item?.tensProbability === undefined ? null : Math.max(0, Math.min(1, Number(item.tensProbability) || 0)),
        historyProbability: item?.historyProbability === null || item?.historyProbability === undefined ? null : Math.max(0, Math.min(1, Number(item.historyProbability) || 0)),
        patternProbability: item?.patternProbability === null || item?.patternProbability === undefined ? null : Math.max(0, Math.min(1, Number(item.patternProbability) || 0)),
        stateProbability: item?.stateProbability === null || item?.stateProbability === undefined ? null : Math.max(0, Math.min(1, Number(item.stateProbability) || 0)),
        streamScore: Math.max(0, Math.min(100, Number(item?.streamScore) || 0)),
        streamDistance: Math.max(0, Number(item?.streamDistance) || 0),
        forecast: item?.forecast === null ? null : Number(item?.forecast) || 0,
        recentValues: Array.isArray(item?.recentValues) ? item.recentValues.map(Number).filter(Number.isFinite).slice(-4) : [],
        deltas: Array.isArray(item?.deltas) ? item.deltas.map(Number).filter(Number.isFinite).slice(-3) : [],
        averageDelta: item?.averageDelta === null ? null : Number(item?.averageDelta) || 0,
        familyCount: Math.max(0, Number(item?.familyCount) || 0),
        signalCount: Math.max(0, Number(item?.signalCount) || 0),
        families: Array.isArray(item?.families) ? item.families.map(family => ({
          key: String(family?.key || ''),
          code: String(family?.code || '').slice(0, 12),
          label: String(family?.label || '').slice(0, 100),
          reliability: Math.max(0, Math.min(1, Number(family?.reliability) || 0)),
          baselineRate: Math.max(0, Math.min(1, Number(family?.baselineRate) || 0)),
          lift: Math.max(0, Math.min(1, Number(family?.lift) || 0)),
          hits: Math.max(0, Number(family?.hits) || 0),
          trials: Math.max(0, Number(family?.trials) || 0)
        })) : []
      })) : [],
      label: ['strong', 'uncertain', 'ugly'].includes(row.label) ? row.label : 'uncertain',
      note: String(row.note || '').slice(0, 500)
    };
  }).filter(Boolean);
}

function sanitizeSlipNumbers(values, legacyRowBuilder = []) {
  const source = Array.isArray(values) && values.length === 5
    ? values
    : sanitizeCash5Numbers(legacyRowBuilder).slice(0, 5);
  const result = Array.from({ length: 5 }, (_, index) => {
    const parsed = parseStrictInteger(source[index]);
    return parsed !== null && parsed >= 1 && parsed <= 42 ? parsed : null;
  });
  for (let index = 1; index < result.length; index += 1) {
    if (result[index] !== null && result.slice(0, index).some(number => number !== null && number >= result[index])) {
      result[index] = null;
    }
  }
  return result;
}

function sanitizePositionNumbers(values) {
  return Array.from({ length: 5 }, (_, index) => {
    const parsed = parseStrictInteger(Array.isArray(values) ? values[index] : null);
    return parsed !== null && parsed >= 1 && parsed <= 42 ? parsed : null;
  });
}

function sanitizeSlipTensFilters(values) {
  return Array.from({ length: 5 }, (_, index) => {
    const parsed = parseStrictInteger(Array.isArray(values) ? values[index] : null);
    return parsed !== null && parsed >= 0 && parsed <= 4 ? parsed : null;
  });
}

function sanitizeSlipTensSources(values) {
  return Array.from({ length: 5 }, (_, index) => {
    const value = Array.isArray(values) ? values[index] : null;
    return ['automatic', 'manual', 'empty'].includes(value) ? value : 'empty';
  });
}

function sanitizePatternSignals(signals) {
  if (!Array.isArray(signals)) return [];
  return signals.map((signal, index) => {
    const targetColumn = Number(signal?.targetColumn);
    const digit = Number(signal?.digit);
    if (!Number.isInteger(targetColumn) || targetColumn < 0 || targetColumn > 4
        || !Number.isInteger(digit) || digit < 0 || digit > 9) return null;
    return {
      id: String(signal.id || `imported-signal-${index}`),
      pattern: String(signal.pattern || '').slice(0, 40),
      operation: String(signal.operation || '').slice(0, 40),
      code: String(signal.code || '').slice(0, 12),
      label: String(signal.label || '').slice(0, 100),
      digit,
      targetColumn,
      sourceColumns: Array.isArray(signal.sourceColumns)
        ? signal.sourceColumns.map(Number).filter(column => Number.isInteger(column) && column >= 0 && column <= 4).slice(0, 4)
        : [],
      sourceDrawIds: Array.isArray(signal.sourceDrawIds) ? signal.sourceDrawIds.map(String).slice(0, 4) : [],
      explanation: String(signal.explanation || '').slice(0, 500),
      analyzerVersion: Math.max(1, Number(signal.analyzerVersion) || 1),
      direction: Math.max(-4, Math.min(4, Number(signal.direction) || 0)),
      reliabilityHits: Math.max(0, Number(signal.reliabilityHits) || 0),
      reliabilityTrials: Math.max(0, Number(signal.reliabilityTrials) || 0),
      reliability: Math.max(0, Math.min(1, Number(signal.reliability) || 0)),
      baselineRate: Math.max(0, Math.min(1, Number(signal.baselineRate) || 0)),
      posteriorRate: Math.max(0, Math.min(1, Number(signal.posteriorRate) || 0)),
      lift: Math.max(0, Math.min(1, Number(signal.lift) || 0))
    };
  }).filter(Boolean);
}

function sanitizeRowScores(scores) {
  if (!Array.isArray(scores)) return [];
  return scores.map(score => {
    const positions = Array.isArray(score?.positions) ? score.positions.slice(0, 5).map(item => ({
      column: Math.max(0, Math.min(4, Number(item?.column) || 0)),
      selected: Number(item?.selected) || 0,
      actual: Number(item?.actual) || 0,
      exact: Boolean(item?.exact),
      numberHit: Boolean(item?.numberHit),
      matchedColumn: item?.matchedColumn === null || item?.matchedColumn === undefined
        ? null
        : Math.max(0, Math.min(4, Number(item.matchedColumn) || 0)),
      endingHit: Boolean(item?.endingHit),
      tensHit: Boolean(item?.tensHit),
      diagnostic: String(item?.diagnostic || '').slice(0, 100)
    })) : [];
    return {
      rowId: String(score?.rowId || ''),
      source: score?.source === 'system' ? 'system' : 'user',
      rank: [1, 2, 3].includes(Number(score?.rank)) ? Number(score.rank) : null,
      available: score?.available !== false,
      unavailableReason: String(score?.unavailableReason || '').slice(0, 500),
      hits: Math.max(0, Math.min(5, Number(score?.hits) || 0)),
      matchTier: Math.max(0, Math.min(5, Number(score?.matchTier ?? score?.hits) || 0)),
      prizeTier: String(score?.prizeTier || ((Number(score?.hits) || 0) >= 2 ? `match-${Number(score.hits)}` : 'none')).slice(0, 20),
      wonPrizeTier: Boolean(score?.wonPrizeTier ?? ((Number(score?.hits) || 0) >= 2)),
      misses: Math.max(0, Math.min(5, Number(score?.misses) || 0)),
      matchRate: score?.matchRate === null ? null : Math.max(0, Math.min(1, Number(score?.matchRate) || 0)),
      missRate: score?.missRate === null ? null : Math.max(0, Math.min(1, Number(score?.missRate) || 0)),
      exactPositionHits: score?.exactPositionHits === null || score?.exactPositionHits === undefined
        ? (positions.length === 5 ? positions.filter(item => item.exact).length : null)
        : Math.max(0, Math.min(5, Number(score.exactPositionHits) || 0)),
      endingHits: Math.max(0, Math.min(5, Number(score?.endingHits) || 0)),
      endingRate: score?.endingRate === null ? null : Math.max(0, Math.min(1, Number(score?.endingRate) || 0)),
      tensHits: Math.max(0, Math.min(5, Number(score?.tensHits) || 0)),
      tensRate: score?.tensRate === null ? null : Math.max(0, Math.min(1, Number(score?.tensRate) || 0)),
      matchedNumbers: sanitizeCash5Numbers(score?.matchedNumbers),
      missedNumbers: sanitizeCash5Numbers(score?.missedNumbers),
      positions
    };
  });
}

function sanitizeSourceTop(value) {
  const digit = Number(value?.digit);
  return {
    digit: Number.isInteger(digit) && digit >= 0 && digit <= 9 ? digit : null,
    probability: value?.probability === null || value?.probability === undefined
      ? null
      : Math.max(0, Math.min(1, Number(value.probability) || 0))
  };
}

function sanitizeSourceForecasts(forecasts) {
  if (!Array.isArray(forecasts)) return [];
  return Array.from({ length: 5 }, (_, column) => {
    const item = forecasts.find(entry => Number(entry?.column) === column) || forecasts[column] || {};
    return {
      column,
      combo: sanitizeSourceTop(item.combo),
      history: sanitizeSourceTop(item.history),
      pattern: sanitizeSourceTop(item.pattern),
      hncde: sanitizeSourceTop(item.hncde)
    };
  });
}

function sanitizeTrackForecasts(forecasts) {
  if (!Array.isArray(forecasts)) return [];
  const definitions = new Map([
    ['control', { color: 'blue', sourceKey: 'combo' }],
    ['temporal', { color: 'red', sourceKey: 'history' }],
    ['structure', { color: 'green', sourceKey: 'pattern' }],
    ['hncde', { color: 'yellow', sourceKey: 'hncde' }]
  ]);
  return forecasts.map(track => {
    const key = String(track?.key || '');
    const definition = definitions.get(key);
    if (!definition) return null;
    const columns = Array.from({ length: 5 }, (_, column) => {
      const item = track?.columns?.find(entry => Number(entry?.column) === column) || track?.columns?.[column] || {};
      const distribution = Array.from({ length: 10 }, (_, digit) => Math.max(0, Math.min(1, Number(item?.distribution?.[digit]) || 0)));
      const fullNumberCandidates = Array.isArray(item?.fullNumberCandidates) ? item.fullNumberCandidates.slice(0, 12).map(candidate => ({
        number: Math.max(1, Math.min(42, Number(candidate?.number) || 1)),
        digit: Math.max(0, Math.min(9, Number(candidate?.digit) || 0)),
        column,
        studyScore: Math.max(0, Number(candidate?.studyScore) || 0),
        supportingTracks: Array.isArray(candidate?.supportingTracks)
          ? candidate.supportingTracks.map(String).filter(value => definitions.has(value)).slice(0, 4)
          : []
      })) : [];
      return {
        column,
        distribution,
        topDigits: Array.isArray(item?.topDigits) ? item.topDigits.slice(0, 3).map(sanitizeSourceTop) : [],
        successorCandidates: Array.isArray(item?.successorCandidates) ? item.successorCandidates.slice(0, 4).map(candidate => ({
          digit: Math.max(0, Math.min(9, Number(candidate?.digit) || 0)),
          rank: Math.max(1, Math.min(4, Number(candidate?.rank) || 1)),
          count: Math.max(0, Number(candidate?.count) || 0),
          mostRecentTransitionDate: String(candidate?.mostRecentTransitionDate || '')
        })) : [],
        fullNumberCandidates
      };
    });
    return {
      key,
      sourceKey: definition.sourceKey,
      color: definition.color,
      label: String(track?.label || '').slice(0, 80),
      status: ['control', 'study', 'promoted'].includes(track?.status) ? track.status : 'study',
      sampleSize: Math.max(0, Number(track?.sampleSize) || 0),
      evidenceId: String(track?.evidenceId || '').slice(0, 160),
      columns,
      pivotEvidence: key === 'structure' && track?.pivotEvidence ? {
        valid: Boolean(track.pivotEvidence.valid),
        mode: ['low', 'high', 'both'].includes(track.pivotEvidence.mode) ? track.pivotEvidence.mode : 'both',
        sourceDrawId: String(track.pivotEvidence.sourceDrawId || ''),
        sourceDate: String(track.pivotEvidence.sourceDate || ''),
        digits: Array.isArray(track.pivotEvidence.digits)
          ? track.pivotEvidence.digits.map(Number).filter(digit => Number.isInteger(digit) && digit >= 0 && digit <= 9)
          : [],
        equations: Array.isArray(track.pivotEvidence.equations) ? track.pivotEvidence.equations.map(String).slice(0, 40) : [],
        columns: columns.map(item => ({ column: item.column, candidates: item.fullNumberCandidates }))
      } : null
    };
  }).filter(Boolean);
}

function sanitizeSourceScores(scores) {
  if (!scores || typeof scores !== 'object') return null;
  const columns = Array.isArray(scores.columns) ? scores.columns.slice(0, 5).map((item, index) => ({
    column: Math.max(0, Math.min(4, Number(item?.column) || index)),
    actualDigit: Math.max(0, Math.min(9, Number(item?.actualDigit) || 0)),
    sources: Object.fromEntries(['combo', 'history', 'pattern', 'hncde'].map(key => {
      const source = item?.sources?.[key] || {};
      const predicted = Number(source.predictedDigit);
      return [key, {
        predictedDigit: Number.isInteger(predicted) && predicted >= 0 && predicted <= 9 ? predicted : null,
        probability: source.probability === null || source.probability === undefined
          ? null
          : Math.max(0, Math.min(1, Number(source.probability) || 0)),
        actualDigit: Math.max(0, Math.min(9, Number(source.actualDigit ?? item?.actualDigit) || 0)),
        hit: Boolean(source.hit)
      }];
    }))
  })) : [];
  const sources = Array.isArray(scores.sources) ? scores.sources.map(item => ({
    key: String(item?.key || '').slice(0, 20),
    label: String(item?.label || '').slice(0, 80),
    hits: Math.max(0, Number(item?.hits) || 0),
    trials: Math.max(0, Number(item?.trials) || 0),
    rate: item?.rate === null || item?.rate === undefined ? null : Math.max(0, Math.min(1, Number(item.rate) || 0))
  })).filter(item => ['combo', 'history', 'pattern', 'hncde'].includes(item.key)) : [];
  return { columns, sources };
}

function sanitizePatternSignalScores(scores) {
  if (!Array.isArray(scores)) return [];
  return scores.map(score => ({
    signalId: String(score?.signalId || ''),
    pattern: String(score?.pattern || '').slice(0, 40),
    operation: String(score?.operation || '').slice(0, 40),
    code: String(score?.code || '').slice(0, 12),
    targetColumn: Math.max(0, Math.min(4, Number(score?.targetColumn) || 0)),
    predictedDigit: Math.max(0, Math.min(9, Number(score?.predictedDigit) || 0)),
    actualDigit: Math.max(0, Math.min(9, Number(score?.actualDigit) || 0)),
    hit: Boolean(score?.hit)
  }));
}

function sanitizeSessions(sessions) {
  if (!Array.isArray(sessions)) return [];
  return sessions.map((session, index) => {
    if (!session || typeof session !== 'object' || !session.baselineDate) return null;
    const rows = sanitizeRows(session.rows);
    if (!rows.length) return null;
    const rawResult = session.result && typeof session.result === 'object' ? session.result : null;
    const resultNumbers = sanitizeCash5Numbers(rawResult?.numbers, 5);
    const result = rawResult && resultNumbers.length === 5 ? {
      drawId: String(rawResult.drawId || ''),
      date: String(rawResult.date || ''),
      numbers: resultNumbers,
      candidateHits: Math.max(0, Math.min(5, Number(rawResult.candidateHits) || 0)),
      systemPortfolioCoverage: Math.max(0, Math.min(5, Number(rawResult.systemPortfolioCoverage) || 0)),
      systemPrizeLines: Math.max(0, Math.min(3, Number(rawResult.systemPrizeLines) || 0)),
      systemBestLineHits: Math.max(0, Math.min(5, Number(rawResult.systemBestLineHits) || 0)),
      matchTierCounts: Object.fromEntries(Array.from({ length: 6 }, (_, hits) => [hits, Math.max(0, Number(rawResult.matchTierCounts?.[hits]) || 0)])),
      rowScores: sanitizeRowScores(rawResult.rowScores),
      patternSignalScores: sanitizePatternSignalScores(rawResult.patternSignalScores),
      sourceScores: sanitizeSourceScores(rawResult.sourceScores)
    } : null;
    const kind = session.kind === 'prediction' ? 'prediction' : 'legacy';
    const analyzerPolicyKind = ['control', 'combo', 'eb50', 'challenger', 'evidence'].includes(session.analyzerPolicy?.kind)
      ? session.analyzerPolicy.kind
      : 'combo';
    return {
      id: String(session.id || `imported-session-${index}`),
      kind,
      trackingVersion: kind === 'prediction' ? Math.max(1, Number(session.trackingVersion) || 1) : null,
      analyzerVersion: kind === 'prediction' ? Math.max(1, Number(session.analyzerVersion || session.trackingVersion) || 1) : null,
      analyzerPolicy: kind === 'prediction' && session.analyzerPolicy && typeof session.analyzerPolicy === 'object' ? {
        kind: analyzerPolicyKind,
        priorStrength: Math.max(0, Number(session.analyzerPolicy.priorStrength) || 0),
        patternWeight: Math.max(0, Math.min(0.3, Number(session.analyzerPolicy.patternWeight) || 0)),
        stateWeight: Math.max(0, Math.min(0.3, Number(session.analyzerPolicy.stateWeight) || 0)),
        comboWeight: Math.max(0, Math.min(1, Number(session.analyzerPolicy.comboWeight) || 0)),
        historyWeight: Math.max(0, Math.min(1, Number(session.analyzerPolicy.historyWeight) || 0)),
        recencyHalfLife: Math.max(1, Math.min(50, Number(session.analyzerPolicy.recencyHalfLife) || 12)),
        evidenceId: String(session.analyzerPolicy.evidenceId || '').slice(0, 120)
      } : null,
      creationSource: String(session.creationSource || (kind === 'prediction' ? 'imported' : 'legacy')).slice(0, 40),
      status: result ? 'scored' : kind === 'prediction' ? 'pending' : 'locked',
      finalizedAt: String(session.finalizedAt || new Date(0).toISOString()),
      baselineDrawId: String(session.baselineDrawId || ''),
      baselineDate: String(session.baselineDate),
      historyStartDate: String(session.historyStartDate || ''),
      historyDrawCount: Math.max(0, Math.min(50, Number(session.historyDrawCount) || 0)),
      motifSelections: Array.isArray(session.motifSelections) ? session.motifSelections : [],
      motifMatches: Array.isArray(session.motifMatches) ? session.motifMatches : [],
      candidateDigits: Array.isArray(session.candidateDigits) ? [...new Set(session.candidateDigits.map(Number).filter(value => Number.isInteger(value) && value >= 0 && value <= 9))] : [],
      fullCandidates: sanitizeCash5Numbers(session.fullCandidates),
      endingPool: Array.isArray(session.endingPool)
        ? [...new Set(session.endingPool.map(Number).filter(digit => Number.isInteger(digit) && digit >= 0 && digit <= 9))]
        : [],
      rows,
      patternSignals: sanitizePatternSignals(session.patternSignals),
      trackForecasts: sanitizeTrackForecasts(session.trackForecasts),
      pivotNumberEvidence: sanitizeTrackForecasts(session.trackForecasts).find(track => track.key === 'structure')?.pivotEvidence || null,
      promotionPolicy: session.promotionPolicy && typeof session.promotionPolicy === 'object' ? {
        analyzerVersion: Math.max(1, Number(session.promotionPolicy.analyzerVersion) || 1),
        reportId: String(session.promotionPolicy.reportId || '').slice(0, 160),
        status: session.promotionPolicy.status === 'promoted' ? 'promoted' : 'control-only',
        activeTrack: ['control', 'temporal', 'structure', 'hncde'].includes(session.promotionPolicy.activeTrack) ? session.promotionPolicy.activeTrack : 'control',
        promotedTrack: ['temporal', 'structure', 'hncde'].includes(session.promotionPolicy.promotedTrack) ? session.promotionPolicy.promotedTrack : null,
        pivotMode: ['low', 'high', 'both'].includes(session.promotionPolicy.pivotMode) ? session.promotionPolicy.pivotMode : 'both',
        archiveChecksum: String(session.promotionPolicy.archiveChecksum || '').slice(0, 128),
        evidenceId: String(session.promotionPolicy.evidenceId || '').slice(0, 160)
      } : null,
      controlSeed: session.controlSeed === null || session.controlSeed === undefined ? null : (Number(session.controlSeed) >>> 0),
      sourceForecasts: sanitizeSourceForecasts(session.sourceForecasts),
      streamSnapshot: Array.isArray(session.streamSnapshot) ? session.streamSnapshot.slice(0, 5).map((item, column) => ({
        column,
        available: item?.available !== false,
        unavailableReason: String(item?.unavailableReason || '').slice(0, 500),
        recentValues: Array.isArray(item?.recentValues) ? item.recentValues.map(Number).filter(Number.isFinite).slice(-4) : [],
        deltas: Array.isArray(item?.deltas) ? item.deltas.map(Number).filter(Number.isFinite).slice(-3) : [],
        averageDelta: Number(item?.averageDelta) || 0,
        rawForecast: Number(item?.rawForecast) || 0,
        forecast: Number(item?.forecast) || 0,
        unusedCount: Math.max(0, Number(item?.unusedCount) || 0)
      })) : [],
      result
    };
  }).filter(Boolean);
}

function sanitizeWorkspace(workspace) {
  if (!workspace || typeof workspace !== 'object') return null;
  const candidateDigits = Array.isArray(workspace.candidateDigits)
    ? [...new Set(workspace.candidateDigits.map(Number).filter(value => Number.isInteger(value) && value >= 0 && value <= 9))].sort((a, b) => a - b)
    : [];
  const hasSelectedDigit = workspace.selectedEvidenceDigit !== null && workspace.selectedEvidenceDigit !== undefined && workspace.selectedEvidenceDigit !== '';
  const selectedEvidenceDigit = hasSelectedDigit && Number.isInteger(Number(workspace.selectedEvidenceDigit))
    && Number(workspace.selectedEvidenceDigit) >= 0 && Number(workspace.selectedEvidenceDigit) <= 9
    ? Number(workspace.selectedEvidenceDigit)
    : null;
  const activeColumn = Number(workspace.activeFutureCell?.column);
  const activeDigit = Number(workspace.activeFutureCell?.digit);
  const activeFutureCell = Number.isInteger(activeColumn) && activeColumn >= 0 && activeColumn <= 4
    && Number.isInteger(activeDigit) && activeDigit >= 0 && activeDigit <= 9
    ? { column: activeColumn, digit: activeDigit }
    : null;
  const validMappings = Array.isArray(workspace.futureDigitMap) ? workspace.futureDigitMap.map(item => {
    const column = Number(item?.column);
    const digit = Number(item?.digit);
    return Number.isInteger(column) && column >= 0 && column <= 4
      && Number.isInteger(digit) && digit >= 0 && digit <= 9
      ? { column, digit }
      : null;
  }).filter(Boolean) : [];
  const mappingsByColumn = new Map(validMappings.map(item => [item.column, item]));
  if (activeFutureCell && validMappings.some(item => item.column === activeColumn && item.digit === activeDigit)) {
    mappingsByColumn.set(activeColumn, activeFutureCell);
  }
  const futureDigitMap = [...mappingsByColumn.values()].sort((a, b) => a.column - b.column);
  const systemDigitMap = Array.isArray(workspace.systemDigitMap) ? workspace.systemDigitMap.map(item => {
    const column = Number(item?.column);
    const digit = Number(item?.digit);
    return Number.isInteger(column) && column >= 0 && column <= 4
      && Number.isInteger(digit) && digit >= 0 && digit <= 9
      ? { column, digit }
      : null;
  }).filter(Boolean) : [];
  const rowBuilder = sanitizeCash5Numbers(workspace.rowBuilder).slice(0, 5);
  const rawSlipNumbers = sanitizePositionNumbers(workspace.slipNumbers);
  const rawSlipValues = rawSlipNumbers.filter(Number.isInteger);
  const rawSlipIsIncreasing = rawSlipValues.every((number, index) => index === 0 || number > rawSlipValues[index - 1]);
  const looksLikeLegacyDigitLeak = futureDigitMap.length > 0
    && rawSlipValues.length > 0
    && rawSlipNumbers.every((number, column) => (
      !Number.isInteger(number)
      || futureDigitMap.some(item => item.column === column && number === (item.digit === 0 ? 10 : item.digit))
    ))
    && !rawSlipIsIncreasing;
  return {
    futureDigitMap,
    systemDigitMap,
    systemSlipNumbers: sanitizePositionNumbers(workspace.systemSlipNumbers),
    nextDrawingPreviewHidden: workspace.nextDrawingPreviewHidden === true,
    activeFutureCell,
    motifSelections: Array.isArray(workspace.motifSelections) ? workspace.motifSelections.map(item => {
      if (!item || !['past', 'present'].includes(item.role)) return null;
      const column = Number(item.column);
      const digit = Number(item.digit);
      if (!Number.isInteger(column) || column < 0 || column > 4 || !Number.isInteger(digit) || digit < 0 || digit > 9) return null;
      return {
        cellId: String(item.cellId || ''),
        drawId: String(item.drawId || ''),
        role: item.role,
        column,
        digit,
        fullNumber: Number(item.fullNumber) || 0
      };
    }).filter(Boolean) : [],
    // Re-run searches after import so displayable evidence always derives from validated draws.
    motifMatches: [],
    candidateDigits,
    selectedEvidenceDigit,
    fullCandidates: sanitizeCash5Numbers(workspace.fullCandidates),
    rowBuilder,
    // Older builds incorrectly copied digit-only map clicks into the extra
    // line. Drop that malformed legacy state while preserving real rows.
    slipNumbers: looksLikeLegacyDigitLeak ? [null, null, null, null, null] : sanitizeSlipNumbers(workspace.slipNumbers, rowBuilder),
    slipTensFilters: sanitizeSlipTensFilters(workspace.slipTensFilters),
    slipTensSources: sanitizeSlipTensSources(workspace.slipTensSources),
    draftRows: sanitizeRows(workspace.draftRows),
    sessions: sanitizeSessions(workspace.sessions),
    predictionTracker: workspace.predictionTracker && typeof workspace.predictionTracker === 'object' ? {
      version: Math.max(0, Number(workspace.predictionTracker.version) || 0),
      initializedAt: String(workspace.predictionTracker.initializedAt || ''),
      upgradedAt: String(workspace.predictionTracker.upgradedAt || ''),
      latestOfficialDrawDate: String(workspace.predictionTracker.latestOfficialDrawDate || '')
    } : null
  };
}
