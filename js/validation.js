/** PA 5 Studio data validation and project sanitization. */

import { DEFAULT_GAME_ID, GAME_IDS, getGameConfig, isSupportedGameId } from './gameConfig.js';

export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function parseStrictInteger(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isValidISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateDraw(rawDraw, game = DEFAULT_GAME_ID) {
  const config = getGameConfig(game);
  const errors = [];
  if (!rawDraw || typeof rawDraw !== 'object') return { valid: false, errors: ['Draw item must be an object'], draw: null };
  let date = rawDraw.date;
  if (typeof date !== 'string' || !date.trim()) errors.push('Missing or invalid draw date');
  else {
    date = date.trim();
    if (!isValidISODate(date)) errors.push(`Invalid date value: ${date}`);
  }
  const id = rawDraw.id === null || rawDraw.id === undefined || String(rawDraw.id).trim() === ''
    ? `draw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : String(rawDraw.id).trim();
  if (!Array.isArray(rawDraw.numbers)) errors.push('Draw numbers must be an array');
  else if (rawDraw.numbers.length !== config.ballCount) errors.push(`Draw must contain exactly ${config.ballCount} main numbers, found ${rawDraw.numbers.length}`);
  const numbers = [];
  if (Array.isArray(rawDraw.numbers)) rawDraw.numbers.forEach(value => {
    const parsed = parseStrictInteger(value);
    if (parsed === null) errors.push(`Invalid main ball number: ${value}`);
    else if (parsed < config.minimumNumber || parsed > config.maximumNumber) {
      errors.push(`Main ball number ${parsed} out of range [${config.minimumNumber}..${config.maximumNumber}] for ${config.displayName}`);
    } else numbers.push(parsed);
  });
  if (new Set(numbers).size !== numbers.length) errors.push('Main ball numbers must be unique');
  numbers.sort((a, b) => a - b);
  return errors.length ? { valid: false, errors, draw: null } : {
    valid: true, errors: [], draw: { id, date, numbers: numbers.slice(0, config.ballCount), bonus: null }
  };
}

function sanitizeNumbers(values, config, exactCount = null) {
  if (!Array.isArray(values)) return [];
  const numbers = [...new Set(values.map(parseStrictInteger))]
    .filter(value => value !== null && value >= config.minimumNumber && value <= config.maximumNumber)
    .sort((a, b) => a - b);
  return exactCount === null || numbers.length === exactCount ? numbers : [];
}

function sanitizeRows(rows, config) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    const numbers = sanitizeNumbers(row?.numbers, config, config.ballCount);
    if (numbers.length !== config.ballCount) return null;
    return { id: String(row.id || `imported-row-${index}`), numbers,
      label: ['strong', 'uncertain', 'ugly'].includes(row.label) ? row.label : 'uncertain', note: String(row.note || '').slice(0, 500) };
  }).filter(Boolean);
}

function sanitizeSlipNumbers(values, legacyRowBuilder, config) {
  const source = Array.isArray(values) && values.length === config.ballCount ? values : sanitizeNumbers(legacyRowBuilder, config).slice(0, config.ballCount);
  const result = Array.from({ length: config.ballCount }, (_, index) => {
    const parsed = parseStrictInteger(source[index]);
    return parsed !== null && parsed >= config.minimumNumber && parsed <= config.maximumNumber ? parsed : null;
  });
  for (let index = 1; index < result.length; index += 1) {
    if (result[index] !== null && result.slice(0, index).some(number => number !== null && number >= result[index])) result[index] = null;
  }
  return result;
}

function sanitizeTensFilters(values, config) {
  const maximumDigit = Math.floor(config.maximumNumber / 10);
  return Array.from({ length: config.ballCount }, (_, index) => {
    const parsed = parseStrictInteger(Array.isArray(values) ? values[index] : null);
    return parsed !== null && parsed >= 0 && parsed <= maximumDigit ? parsed : null;
  });
}

function sanitizeSessions(sessions, config) {
  if (!Array.isArray(sessions)) return [];
  return sessions.map((session, index) => {
    if (!session || typeof session !== 'object' || !session.baselineDate) return null;
    const rows = sanitizeRows(session.rows, config);
    if (!rows.length) return null;
    const rawResult = session.result && typeof session.result === 'object' ? session.result : null;
    const resultNumbers = sanitizeNumbers(rawResult?.numbers, config, config.ballCount);
    const result = rawResult && resultNumbers.length === config.ballCount ? {
      drawId: String(rawResult.drawId || ''), date: String(rawResult.date || ''), numbers: resultNumbers,
      candidateHits: Math.max(0, Math.min(config.ballCount, Number(rawResult.candidateHits) || 0)),
      rowScores: Array.isArray(rawResult.rowScores) ? rawResult.rowScores.map(score => ({ rowId: String(score?.rowId || ''), hits: Math.max(0, Math.min(config.ballCount, Number(score?.hits) || 0)) })) : []
    } : null;
    return { id: String(session.id || `imported-session-${index}`), gameId: config.id, status: result ? 'scored' : 'locked',
      finalizedAt: String(session.finalizedAt || new Date(0).toISOString()), baselineDrawId: String(session.baselineDrawId || ''),
      baselineDate: String(session.baselineDate), motifSelections: [], motifMatches: [], candidateDigits: [],
      fullCandidates: sanitizeNumbers(session.fullCandidates, config), rows, result };
  }).filter(Boolean);
}

export function sanitizeWorkspace(workspace, game = DEFAULT_GAME_ID) {
  if (!workspace || typeof workspace !== 'object') return null;
  const config = getGameConfig(game);
  const activeColumn = Number(workspace.activeFutureCell?.column);
  const activeDigit = Number(workspace.activeFutureCell?.digit);
  const activeFutureCell = Number.isInteger(activeColumn) && activeColumn >= 0 && activeColumn < config.ballCount
    && Number.isInteger(activeDigit) && activeDigit >= 0 && activeDigit <= 9 ? { column: activeColumn, digit: activeDigit } : null;
  const validMappings = Array.isArray(workspace.futureDigitMap) ? workspace.futureDigitMap.map(item => {
    const column = Number(item?.column); const digit = Number(item?.digit);
    return Number.isInteger(column) && column >= 0 && column < config.ballCount && Number.isInteger(digit) && digit >= 0 && digit <= 9 ? { column, digit } : null;
  }).filter(Boolean) : [];
  const byColumn = new Map(validMappings.map(item => [item.column, item]));
  const futureDigitMap = [...byColumn.values()].sort((a, b) => a.column - b.column);
  const rowBuilder = sanitizeNumbers(workspace.rowBuilder, config).slice(0, config.ballCount);
  return { futureDigitMap, activeFutureCell: activeFutureCell && byColumn.has(activeFutureCell.column) ? activeFutureCell : null,
    motifSelections: [], motifMatches: [], candidateDigits: [], selectedEvidenceDigit: null,
    fullCandidates: sanitizeNumbers(workspace.fullCandidates, config), rowBuilder,
    slipNumbers: sanitizeSlipNumbers(workspace.slipNumbers, rowBuilder, config),
    slipTensFilters: sanitizeTensFilters(workspace.slipTensFilters, config), draftRows: sanitizeRows(workspace.draftRows, config),
    sessions: sanitizeSessions(workspace.sessions, config) };
}

function sanitizeJackpot(value) {
  if (!value || !Number.isSafeInteger(value.amount) || value.amount <= 0 || typeof value.fetchedAt !== 'string') return null;
  const nextDrawDate = typeof value.nextDrawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.nextDrawDate)
    ? value.nextDrawDate : null;
  return { amount: value.amount, display: `$${value.amount.toLocaleString('en-US')}`, nextDrawDate,
    fetchedAt: value.fetchedAt, source: String(value.source || '') };
}

export function validateProject(projectData) {
  const empty = { valid: false, errors: [], activeGame: DEFAULT_GAME_ID, games: null };
  if (!projectData || typeof projectData !== 'object') return { ...empty, errors: ['Project file does not contain valid JSON data'] };
  if (projectData.version !== 4 || projectData.appName !== 'PA 5 Studio') {
    return { ...empty, errors: ['Only PA 5 Studio version 4 (.pa5studio) projects are supported; SC and legacy projects cannot be imported.'] };
  }
  if (!projectData.games || typeof projectData.games !== 'object') return { ...empty, errors: ['Project file is missing its game data.'] };
  const errors = []; const games = {};
  for (const gameId of GAME_IDS) {
    const config = getGameConfig(gameId); const rawState = projectData.games[gameId];
    if (!rawState || !Array.isArray(rawState.draws)) { errors.push(`${config.displayName} data is missing its draws array.`); continue; }
    const draws = [];
    rawState.draws.forEach((item, index) => {
      const result = validateDraw(item, config);
      if (result.valid) draws.push(result.draw); else errors.push(`${config.displayName} draw #${index + 1}: ${result.errors.join(', ')}`);
    });
    if (!draws.length) errors.push(`${config.displayName} does not contain any valid draws.`);
    games[gameId] = { draws,
      manualLines: Array.isArray(rawState.manualLines) ? rawState.manualLines.filter(line => line && typeof line === 'object' && line.fromCellId && line.toCellId) : [],
      workspace: sanitizeWorkspace(rawState.workspace || {}, config), jackpot: sanitizeJackpot(rawState.jackpot),
      jackpotIsStale: Boolean(rawState.jackpotIsStale) };
  }
  const activeGame = isSupportedGameId(projectData.activeGame) ? getGameConfig(projectData.activeGame).id : DEFAULT_GAME_ID;
  return { valid: GAME_IDS.every(id => games[id]?.draws?.length), errors, activeGame, games };
}
