/** Official Pennsylvania Cash 5 and Treasure Hunt retrieval. */

import { getGameConfig } from './gameConfig.js';
import { validateDraw } from './validation.js';

export const PA_HISTORY_ENDPOINT = 'https://www.palottery.pa.gov/Custom/uploadedfiles/winning-numbers-history/PastWinningNumbers.ashx';
export const PA_WINNING_NUMBERS_FEED = 'https://www.palottery.pa.gov/feeds/games.aspx';
const LIVE_FETCH_TIMEOUT_MS = 20_000;

function desktopFetchAvailable() {
  return typeof window !== 'undefined' && typeof window.pa5Desktop?.fetchOfficial === 'function';
}

export async function fetchOfficialText(targetUrl, options = {}) {
  const nativeFetch = options.nativeFetch !== undefined
    ? options.nativeFetch : (desktopFetchAvailable() ? window.pa5Desktop.fetchOfficial : null);
  if (nativeFetch) return nativeFetch(targetUrl);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('No online fetch transport is available.');
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), LIVE_FETCH_TIMEOUT_MS) : null;
  try {
    const response = await fetchImpl(targetUrl, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) throw new Error(`The PA Lottery server returned HTTP ${response.status}.`);
    return response.text();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function paYear(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).formatToParts(now);
  return Number(parts.find(part => part.type === 'year')?.value || now.getUTCFullYear());
}

export function formatPaDrawingDate(value) {
  const epochMatch = String(value || '').match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
  const date = epochMatch ? new Date(Number(epochMatch[1])) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function parsePaHistory(payload, game = 'cash5') {
  const config = getGameConfig(game);
  let records;
  try { records = typeof payload === 'string' ? JSON.parse(payload) : payload; }
  catch (_) { throw new Error('The PA Lottery history response was not valid JSON.'); }
  if (!Array.isArray(records)) throw new Error('The PA Lottery history response did not contain a draw list.');
  const byId = new Map();
  records.forEach(record => {
    if (Number(record?.drawingGameID) !== config.officialGameId) return;
    const raw = {
      id: `pa-${config.id}-${record.drawingNumberID}`,
      date: formatPaDrawingDate(record.drawingNumberDate),
      numbers: Array.from({ length: config.ballCount }, (_, index) => record[`drawingNumber${index + 1}`])
    };
    const result = validateDraw(raw, config);
    if (result.valid) byId.set(result.draw.id, result.draw);
  });
  return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function mergeDrawHistory(...groups) {
  const byId = new Map();
  groups.flat().forEach(draw => {
    if (!draw?.id || byId.has(draw.id)) return;
    byId.set(draw.id, draw);
  });
  return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);
}

export async function fetchGameDraws(game = 'cash5', options = {}) {
  const config = getGameConfig(game);
  const year = options.year || paYear(options.now || new Date());
  const fetchText = options.fetchText || (url => fetchOfficialText(url, options));
  const urlForYear = value => `${PA_HISTORY_ENDPOINT}?g=${config.officialGameId}&y=${value}`;
  const current = parsePaHistory(await fetchText(urlForYear(year)), config);
  let draws = current;
  if (draws.length < 50) {
    const previous = parsePaHistory(await fetchText(urlForYear(year - 1)), config);
    draws = mergeDrawHistory(current, previous);
  }
  if (!draws.length) throw new Error(`The PA Lottery returned no valid ${config.displayName} drawings.`);
  return draws.slice(0, 50);
}

function decodeXml(value) {
  return String(value || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

export function parsePaJackpotFeed(xml, game = 'cash5', now = new Date()) {
  const config = getGameConfig(game);
  const items = String(xml || '').match(/<item>[\s\S]*?<\/item>/gi) || [];
  const item = items.find(value => {
    const title = decodeXml(value.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
    return title.startsWith(`${config.displayName} - `);
  });
  if (!item) throw new Error(`The official feed did not include ${config.displayName}.`);
  const description = decodeXml(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1]);
  const escapedName = config.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = description.match(new RegExp(`${escapedName} jackpot for (\\d{2}\\/\\d{2}\\/\\d{4}) is \\$([0-9][0-9,.]*)`, 'i'));
  if (!match) throw new Error(`The official feed did not include the next ${config.displayName} jackpot.`);
  const amount = Math.round(Number(match[2].replace(/,/g, '')));
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`The ${config.displayName} jackpot amount was unreadable.`);
  const [month, day, year] = match[1].split('/');
  return { amount, display: `$${amount.toLocaleString('en-US')}`, nextDrawDate: `${year}-${month}-${day}`,
    fetchedAt: now.toISOString(), source: PA_WINNING_NUMBERS_FEED };
}

export async function fetchGameJackpot(game = 'cash5', options = {}) {
  const fetchText = options.fetchText || (url => fetchOfficialText(url, options));
  return parsePaJackpotFeed(await fetchText(PA_WINNING_NUMBERS_FEED), game, options.now || new Date());
}

export async function fetchLiveGameUpdate(game = 'cash5', options = {}) {
  const fetchDraws = options.fetchDraws || (() => fetchGameDraws(game, options));
  const fetchJackpot = options.fetchJackpot || (() => fetchGameJackpot(game, options));
  const [drawResult, jackpotResult] = await Promise.allSettled([
    Promise.resolve().then(fetchDraws), Promise.resolve().then(fetchJackpot)
  ]);
  const drawsValid = drawResult.status === 'fulfilled' && Array.isArray(drawResult.value) && drawResult.value.length > 0;
  return {
    draws: drawsValid ? { ok: true, value: drawResult.value, error: null }
      : { ok: false, value: null, error: drawResult.status === 'rejected' ? drawResult.reason : new Error('No drawings were returned.') },
    jackpot: jackpotResult.status === 'fulfilled' ? { ok: true, value: jackpotResult.value, error: null }
      : { ok: false, value: null, error: jackpotResult.reason }
  };
}
