/** Build the audited current-matrix evaluation fixture from public yearly result pages. */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'tests', 'fixtures', 'cash5-history.json');
const YEARS = [2024, 2025, 2026];
const CURRENT_MATRIX_START = '2024-03-03';
const SOURCE = year => `https://www.beatlottery.com/lotteries/draws/country/us/state/sc/lottery/palmettocash5/year/${year}`;

function normalizeDate(value) {
  const [month, day, year] = value.split('/').map(Number);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseYearHtml(html) {
  const draws = [];
  const rowPattern = /<tr>\s*<td>\s*<span class="hidden-xs">[^<]+<\/span>\s*<span class="hidden-sm hidden-md hidden-lg">(\d{2}\/\d{2}\/\d{4})<\/span>[\s\S]*?<div class="results-ball-box"[^>]*>([\s\S]*?)<\/div>/g;
  for (const match of html.matchAll(rowPattern)) {
    const numbers = [...match[2].matchAll(/results_ball_new[^>]*>\s*(\d{1,2})\s*<\/span>/g)]
      .map(item => Number(item[1])).sort((a, b) => a - b);
    if (numbers.length !== 5 || new Set(numbers).size !== 5 || numbers.some(number => number < 1 || number > 42)) continue;
    const date = normalizeDate(match[1]);
    draws.push({ id: `archive-cash5-${date}`, date, numbers });
  }
  return draws;
}

function checksum(draws) {
  return createHash('sha256').update(JSON.stringify(draws)).digest('hex');
}

async function main() {
  const pages = await Promise.all(YEARS.map(async year => {
    const response = await fetch(SOURCE(year), { headers: { 'User-Agent': 'Cash5StudioArchiveBuilder/1.0' } });
    if (!response.ok) throw new Error(`Archive source ${year} returned HTTP ${response.status}`);
    return { year, html: await response.text() };
  }));
  const byDate = new Map(pages.flatMap(page => parseYearHtml(page.html)).map(draw => [draw.date, draw]));
  const draws = [...byDate.values()]
    .filter(draw => draw.date >= CURRENT_MATRIX_START)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (draws.length < 850) throw new Error(`Expected at least 850 valid current-matrix draws; received ${draws.length}`);
  const artifact = {
    schemaVersion: 1,
    retrievedAt: new Date().toISOString(),
    game: { name: 'SC Palmetto Cash 5', poolSize: 42, drawSize: 5 },
    sources: YEARS.map(year => SOURCE(year)),
    verificationSources: [
      'https://www.lotteryusa.com/south-carolina/palmetto-cash-5/year',
      'https://www.sceducationlottery.com/Games/PalmettoCash5'
    ],
    note: `Current 5-from-42 matrix beginning ${CURRENT_MATRIX_START}. LotteryUSA exposes a rolling 365-draw page; this fixture uses yearly BeatLottery pages and is cross-checked against the existing LotteryUSA-derived project fixture and current SCEL results.`,
    drawCount: draws.length,
    startDate: draws[0].date,
    endDate: draws.at(-1).date,
    checksum: checksum(draws),
    draws
  };
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Wrote ${draws.length} draws (${artifact.startDate} through ${artifact.endDate}) to ${OUTPUT}`);
  console.log(`SHA-256 ${artifact.checksum}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
