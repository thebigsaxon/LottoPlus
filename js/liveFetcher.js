/** Live SC Palmetto Cash 5 draw retrieval. */

import { validateDraw } from './validation.js';

const LIVE_FETCH_TIMEOUT_MS = 20_000;

function hasDrawMarkup(html) {
  return typeof html === 'string' && html.includes('c-draw-card');
}

function nativeFetchAvailable() {
  return typeof window !== 'undefined'
    && typeof window.cash5StudioNativeFetch === 'function';
}

export async function fetchRemoteHtml(targetUrl, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const nativeFetch = options.nativeFetch !== undefined
    ? options.nativeFetch
    : (nativeFetchAvailable() ? window.cash5StudioNativeFetch.bind(window) : null);
  const acceptsHtml = options.acceptsHtml || (html => typeof html === 'string' && html.trim().length > 0);
  const expectedContent = options.expectedContent || 'expected content';
  const errors = [];

  if (nativeFetch) {
    try {
      const html = await nativeFetch(targetUrl);
      if (acceptsHtml(html)) return html;
      errors.push(`native response did not contain ${expectedContent}`);
    } catch (err) {
      errors.push(`native request failed: ${err?.message || err}`);
    }
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error(`No online fetch transport is available. ${errors.join('; ')}`.trim());
  }

  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
  ];

  for (const proxyUrl of proxies) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), LIVE_FETCH_TIMEOUT_MS)
      : null;

    try {
      const resp = await fetchImpl(proxyUrl, controller ? { signal: controller.signal } : undefined);
      if (!resp.ok) {
        errors.push(`proxy returned HTTP ${resp.status}`);
        continue;
      }

      const html = await resp.text();
      if (acceptsHtml(html)) return html;
      errors.push(`proxy response did not contain ${expectedContent}`);
    } catch (err) {
      errors.push(`proxy request failed: ${err?.message || err}`);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  throw new Error(`Could not retrieve current lottery information. ${errors.join('; ')}`);
}

export function fetchLottoHtml(targetUrl, options = {}) {
  return fetchRemoteHtml(targetUrl, {
    ...options,
    acceptsHtml: hasDrawMarkup,
    expectedContent: 'draw results'
  });
}

export async function fetchLiveLottoDraws() {
  const targetUrl = "https://www.lotteryusa.com/south-carolina/palmetto-cash-5/year";
  const html = await fetchLottoHtml(targetUrl);
  const draws = parseLottoHtml(html);
  if (draws.length === 0) {
    throw new Error('The lottery source returned data, but no valid draws could be parsed.');
  }
  return draws;
}

const CASH5_OFFICIAL_URL = 'https://www.sceducationlottery.com/Games/PalmettoCash5';

function htmlText(html) {
  if (typeof DOMParser === 'function') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body?.textContent || '';
  }
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&dollar;|&#36;/gi, '$')
    .replace(/&amp;/gi, '&');
}

export function parseJackpotAmount(value) {
  const match = String(value || '').replace(/,/g, '').trim().match(/^\$?\s*([0-9]+(?:\.[0-9]+)?)(?:\s*([km]|thousand|million))?$/i);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const suffix = String(match[2] || '').toLowerCase();
  const multiplier = suffix === 'k' || suffix === 'thousand'
    ? 1_000
    : suffix === 'm' || suffix === 'million'
      ? 1_000_000
      : 1;
  const amount = Math.round(base * multiplier);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function parseCurrentJackpot(html, now = new Date()) {
  const text = htmlText(html).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const labeledAmount = text.match(/(?:Est\.?\s+)?(?:Annuitized\s+)?Jackpot\s+Now\s*[:\-–]?\s*(\$\s*[0-9][0-9,]*(?:\.[0-9]+)?(?:\s*(?:K|M|Thousand|Million))?)/i);
  if (!labeledAmount) throw new Error('The official lottery page did not include a current Cash 5 jackpot.');

  const rawValue = labeledAmount[1].replace(/,/g, '').replace(/\s+/g, ' ').trim();
  const amount = parseJackpotAmount(rawValue);
  if (!amount) throw new Error('The official lottery page returned an unreadable Cash 5 jackpot.');

  return {
    amount,
    display: `$${amount.toLocaleString('en-US')}`,
    fetchedAt: now.toISOString(),
    source: CASH5_OFFICIAL_URL
  };
}

export async function fetchCurrentCash5Jackpot(options = {}) {
  const html = await fetchRemoteHtml(CASH5_OFFICIAL_URL, {
    ...options,
    acceptsHtml: value => /Jackpot\s+Now/i.test(htmlText(value)),
    expectedContent: 'the current Cash 5 jackpot'
  });
  return parseCurrentJackpot(html, options.now || new Date());
}

export async function fetchLiveCash5Update(options = {}) {
  const fetchDraws = options.fetchDraws || fetchLiveLottoDraws;
  const fetchJackpot = options.fetchJackpot || fetchCurrentCash5Jackpot;
  const [drawResult, jackpotResult] = await Promise.allSettled([
    Promise.resolve().then(() => fetchDraws()),
    Promise.resolve().then(() => fetchJackpot())
  ]);
  const drawsValid = drawResult.status === 'fulfilled'
    && Array.isArray(drawResult.value)
    && drawResult.value.length > 0;
  return {
    draws: drawsValid
      ? { ok: true, value: drawResult.value, error: null }
      : { ok: false, value: null, error: drawResult.status === 'rejected' ? drawResult.reason : new Error('No drawings were returned.') },
    jackpot: jackpotResult.status === 'fulfilled'
      ? { ok: true, value: jackpotResult.value, error: null }
      : { ok: false, value: null, error: jackpotResult.reason }
  };
}

function parseLottoHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const drawCards = doc.querySelectorAll(".c-draw-card");

  const draws = [];

  drawCards.forEach((card, idx) => {
    // Exclude double play entries
    const titleEl = card.querySelector(".c-draw-card__ball-title");
    if (titleEl && titleEl.textContent.toLowerCase().includes("double play")) return;

    const dateSubEl = card.querySelector(".c-draw-card__draw-date-sub") || card.querySelector("time");
    if (!dateSubEl) return;

    const rawDate = dateSubEl.textContent.trim();
    const parsedDate = parseDateString(rawDate);

    // Main ball numbers
    const mainBallEls = card.querySelectorAll(".c-ball:not(.c-ball--red):not(.c-ball--yellow)");
    const numbers = Array.from(mainBallEls)
      .map(el => parseInt(el.textContent.trim(), 10))
      .filter(n => !isNaN(n));

    if (numbers.length < 5) return;
    numbers.sort((a, b) => a - b);

    const rawDraw = {
      id: `live-cash5-${parsedDate}-${idx}`,
      date: parsedDate,
      numbers: numbers.slice(0, 5)
    };

    const valRes = validateDraw(rawDraw);
    if (valRes.valid) {
      draws.push(valRes.draw);
    }
  });

  // Sort newest draws first
  draws.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return draws;
}

function parseDateString(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return dateStr;
}
