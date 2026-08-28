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

  const manualLines = Array.isArray(projectData.manualLines) ? projectData.manualLines.filter(l => l && typeof l === 'object' && l.fromCellId && l.toCellId) : [];
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
        stream: Number(row.selectionScore.stream) || 0
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
      misses: Math.max(0, Math.min(5, Number(score?.misses) || 0)),
      matchRate: score?.matchRate === null ? null : Math.max(0, Math.min(1, Number(score?.matchRate) || 0)),
      missRate: score?.missRate === null ? null : Math.max(0, Math.min(1, Number(score?.missRate) || 0)),
      exactPositionHits: Math.max(0, Math.min(5, Number(score?.exactPositionHits) || 0)),
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
      rowScores: sanitizeRowScores(rawResult.rowScores),
      patternSignalScores: sanitizePatternSignalScores(rawResult.patternSignalScores)
    } : null;
    const kind = session.kind === 'prediction' ? 'prediction' : 'legacy';
    return {
      id: String(session.id || `imported-session-${index}`),
      kind,
      trackingVersion: kind === 'prediction' ? Math.max(1, Number(session.trackingVersion) || 1) : null,
      analyzerVersion: kind === 'prediction' ? Math.max(1, Number(session.analyzerVersion || session.trackingVersion) || 1) : null,
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
      rows,
      patternSignals: sanitizePatternSignals(session.patternSignals),
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
  const rowBuilder = sanitizeCash5Numbers(workspace.rowBuilder).slice(0, 5);
  return {
    futureDigitMap,
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
    slipNumbers: sanitizeSlipNumbers(workspace.slipNumbers, rowBuilder),
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
