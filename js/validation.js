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
    if (numbers.length !== 5) return null;
    return {
      id: String(row.id || `imported-row-${index}`),
      numbers,
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
      rowScores: Array.isArray(rawResult.rowScores) ? rawResult.rowScores.map(score => ({
        rowId: String(score?.rowId || ''),
        hits: Math.max(0, Math.min(5, Number(score?.hits) || 0))
      })) : []
    } : null;
    return {
      id: String(session.id || `imported-session-${index}`),
      status: result ? 'scored' : 'locked',
      finalizedAt: String(session.finalizedAt || new Date(0).toISOString()),
      baselineDrawId: String(session.baselineDrawId || ''),
      baselineDate: String(session.baselineDate),
      motifSelections: Array.isArray(session.motifSelections) ? session.motifSelections : [],
      motifMatches: Array.isArray(session.motifMatches) ? session.motifMatches : [],
      candidateDigits: Array.isArray(session.candidateDigits) ? [...new Set(session.candidateDigits.map(Number).filter(value => Number.isInteger(value) && value >= 0 && value <= 9))] : [],
      fullCandidates: sanitizeCash5Numbers(session.fullCandidates),
      rows,
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
    draftRows: sanitizeRows(workspace.draftRows),
    sessions: sanitizeSessions(workspace.sessions)
  };
}
