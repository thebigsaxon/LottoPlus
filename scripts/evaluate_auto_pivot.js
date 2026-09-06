import { readFile, writeFile } from 'node:fs/promises';
import { analyzeAutomaticPivot, buildAutomaticPool } from '../js/automaticPivot.js';
import { createHash } from 'node:crypto';
const archive = JSON.parse(await readFile(new URL('../tests/fixtures/cash5-history.json', import.meta.url), 'utf8'));
const estimate = analyzeAutomaticPivot(archive.draws);
const report = { methodVersion: 1, archiveChecksum: createHash('sha256').update(JSON.stringify(archive.draws)).digest('hex'),
  objective: 'Probability of matching the best source pivot by next-draw ending coverage; ties count.',
  evaluation: 'Sequential forecasts use only completed earlier pairs. Fixed pattern blend; promotion requires positive lower 95% paired intervals for both Brier improvement and size-adjusted coverage. Last 240 validation pairs.',
  caveat: 'Estimates describe a pivot-pool ranking event, not the chance of winning a ticket. Approximate paired intervals do not establish lottery predictability.',
  estimate, pool: buildAutomaticPool(archive.draws.at(-1).numbers, estimate.pivots).digits };
await writeFile(new URL('../tests/fixtures/automatic-pivot-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ historyDraws: estimate.historyDraws, pivots: estimate.pivots, method: estimate.method, validation: estimate.validation }, null, 2));
