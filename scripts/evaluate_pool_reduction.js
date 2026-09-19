/** Reproducible fixed-policy retrospective experiment. No tuning on replay outcomes. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cleanPivotHistory } from '../js/automaticPivot.js';
import { encodeDraw, PATTERN_LEXICON } from '../js/patternLanguage.js';
import { forecastReducedPool, selectNestedPools, coverageBaseline, POOL_REDUCTION_RULES } from '../js/poolReductionAgent.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const sum = xs => xs.reduce((a, b) => a + b, 0);
const mean = xs => xs.length ? sum(xs) / xs.length : 0;
const hash = value => createHash('sha256').update(value).digest('hex');
const numbersText = ns => ns.map(n => String(n).padStart(2, '0')).join(' ');

export function scorePool(pool, actual) {
  const matched = actual.filter(n => pool.includes(n)), missed = actual.filter(n => !pool.includes(n));
  return { hits: matched.length, matched, missed };
}
function pairedInterval(differences) {
  const average = mean(differences);
  const variance = differences.length > 1 ? sum(differences.map(x => (x - average) ** 2)) / (differences.length - 1) : 0;
  // t_(.975,19) for requested20; approximation for other counts explicitly labeled.
  const multiplier = differences.length === 20 ? 2.093024054 : 1.96;
  const margin = multiplier * Math.sqrt(variance / Math.max(1, differences.length));
  return { mean: average, lower: average - margin, upper: average + margin,
    method: 'Descriptive paired t interval; small dependent historical samples and multiple comparisons limit interpretation.' };
}
function nullTail(size, trials, observed) {
  let totals = [1];
  const p = coverageBaseline(size).distribution;
  for (let t = 0; t < trials; t++) {
    const next = Array(totals.length + 5).fill(0);
    totals.forEach((value, i) => p.forEach((chance, j) => { next[i + j] += value * chance; }));
    totals = next;
  }
  return sum(totals.slice(observed));
}
function finish(records, arm, size) {
  const outcomes = records.map(r => r.arms[arm][size]);
  const totalHits = sum(outcomes.map(r => r.hits));
  const baseline = coverageBaseline(size);
  return { draws: records.length, totalHits, meanHits: totalHits / records.length,
    distribution: Array.from({ length: 6 }, (_, h) => outcomes.filter(r => r.hits === h).length),
    threePlus: outcomes.filter(r => r.hits >= 3).length, fourPlus: outcomes.filter(r => r.hits >= 4).length,
    allFive: outcomes.filter(r => r.hits === 5).length, baseline,
    liftPerDraw: totalHits / records.length - baseline.expectedHits,
    uniformNullUpperTail: nullTail(size, records.length, totalHits),
    versusControl: pairedInterval(records.map(r => r.arms[arm][size].hits - r.arms.control[size].hits)) };
}

export function evaluatePoolReduction(draws, count = 20) {
  if (!Number.isInteger(count) || count < 1) throw new Error('Replay count must be a positive integer');
  const history = cleanPivotHistory(draws);
  const pairs = history.map((draw, index) => ({ draw, index })).filter(({ draw, index }) => index > 0
    && Date.parse(draw.date) - Date.parse(history[index - 1].date) === 86400000).slice(-count);
  if (pairs.length !== count) throw new Error(`Need ${count} completed consecutive-day pairs`);
  const records = pairs.map(({ draw: target, index }) => {
    const forecast = forecastReducedPool(history.slice(0, index));
    const vector = key => forecast.numbers.map(n => 42 * n[key]);
    const alternatives = {
      combined: forecast,
      control: selectNestedPools(Array(42).fill(1), forecast.sourceDate),
      history: selectNestedPools(vector('history'), forecast.sourceDate),
      pivot: selectNestedPools(vector('pivot'), forecast.sourceDate),
      language: selectNestedPools(vector('language'), forecast.sourceDate),
      withoutLanguage: selectNestedPools(forecast.numbers.map(n => 21 * (n.pivot + n.history)), forecast.sourceDate),
      withoutPivot: selectNestedPools(forecast.numbers.map(n => 21 * (n.language + n.history)), forecast.sourceDate)
    };
    const arms = Object.fromEntries(Object.entries(alternatives).map(([key, selection]) => [key,
      Object.fromEntries(POOL_REDUCTION_RULES.sizes.map(size => [size, { pool: selection.pools[size], ...scorePool(selection.pools[size], target.numbers) }]))]));
    const primarySupported = target.numbers.filter(n => forecast.pivot.primaryDigits.includes(n % 10));
    const primarySupportedMisses = primarySupported.filter(n => !forecast.pools[20].includes(n));
    const raw = scorePool(forecast.rawTop20, target.numbers);
    return { date: target.date, actual: target.numbers, actualCode: encodeDraw(target, history[index - 1]).code,
      forecast, arms, diagnostics: { primarySupported, primarySupportedMisses,
        outsidePivotHits: arms.combined[20].matched.filter(n => !primarySupported.includes(n)),
        rawTop20Hits: raw.hits, balanceHitChange: arms.combined[20].hits - raw.hits,
        removedWinners18: arms.combined[20].matched.filter(n => !forecast.pools[18].includes(n)),
        removedWinners16: arms.combined[18].matched.filter(n => !forecast.pools[16].includes(n)),
        missedDetails: arms.combined[20].missed.map(n => forecast.numbers[n - 1]),
        sequenceSupport: forecast.language.components.find(c => c.family === 'sequence').support,
        exactSupport: forecast.language.components.find(c => c.family === 'exact').support } };
  });
  const summary = Object.fromEntries(Object.keys(records[0].arms).map(arm => [arm,
    Object.fromEntries(POOL_REDUCTION_RULES.sizes.map(size => [size, finish(records, arm, size)]))]));
  return { records, summary,
    diagnosticTotals: {
      primarySupported: sum(records.map(r => r.diagnostics.primarySupported.length)),
      primarySupportedMisses: sum(records.map(r => r.diagnostics.primarySupportedMisses.length)),
      outsidePivotHits: sum(records.map(r => r.diagnostics.outsidePivotHits.length)),
      rawTop20Hits: sum(records.map(r => r.diagnostics.rawTop20Hits)),
      balanceHitChange: sum(records.map(r => r.diagnostics.balanceHitChange)),
      sequenceUnseen: records.filter(r => !r.diagnostics.sequenceSupport).length,
      sequenceSparse: records.filter(r => r.diagnostics.sequenceSupport < 24).length,
      exactUnseen: records.filter(r => !r.diagnostics.exactSupport).length,
      retained20LostAt18: sum(records.map(r => r.diagnostics.removedWinners18.length)),
      retained18LostAt16: sum(records.map(r => r.diagnostics.removedWinners16.length))
    } };
}

function markdown(report) {
  const { records, summary: s, diagnosticTotals: d } = report;
  const main = s.combined[20];
  const old = records.filter(r => r.date <= report.dataProvenance.archiveThrough);
  const fresh = records.filter(r => r.date > report.dataProvenance.archiveThrough);
  const lines = [
    '# Draw language and pool reduction — fixed-policy experiment', '',
    `**${records.length} completed draws: ${records[0].date} through ${records.at(-1).date}.** ${report.historyDraws} draws in the combined history.`, '',
    'This is a retrospective diagnostic of a newly specified rule. The archive has been examined in earlier studies; this is not an untouched holdout. Grammar, weights, constraints and tie-breaking were fixed before this replay. Observations update after each completed draw, with no later target used in its own forecast. No settings were tuned from these 20 outcomes.', '',
    `Primary result: **${main.totalHits}/100 winning numbers retained** in the 20-number pool (${main.meanHits.toFixed(2)}/draw), versus ${(main.baseline.expectedHits * 20).toFixed(2)}/100 expected under independent uniform draws. The same-constraint deterministic control retained ${s.control[20].totalHits}/100; frequency alone retained ${s.history[20].totalHits}/100.`, '',
    '## Pool-size tradeoff', '',
    '| Pool | Retained /100 | Average /draw | Uniform expectation /draw | 0/5 draws | 4+/5 draws | 5/5 draws |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...POOL_REDUCTION_RULES.sizes.map(k => { const x = s.combined[k]; return `| ${k} | ${x.totalHits} | ${x.meanHits.toFixed(2)} | ${x.baseline.expectedHits.toFixed(2)} | ${x.distribution[0]} | ${x.fourPlus} | ${x.allFive} |`; }), '',
    'These are full-number pool coverage figures, not winning-ticket probabilities. A 20-number pool contains 15,504 possible five-number lines.', '',
    '## What contributed, and what failed', '',
    '| Fixed experimental arm | 20-pool retained /100 | Difference from control /draw | Descriptive paired 95% interval |',
    '|---|---:|---:|---|',
    ...Object.entries(s).map(([arm, sizes]) => { const x = sizes[20]; return `| ${arm} | ${x.totalHits} | ${x.versusControl.mean.toFixed(2)} | ${x.versusControl.lower.toFixed(2)} to ${x.versusControl.upper.toFixed(2)} |`; }), '',
    'All arms use the same size, constraint penalties, seed construction and tie-breaking. Ablations are exploratory comparisons, not a competition from which a new policy is selected. The control is one reproducible selection path; the exact uniform expectation is the main mathematical baseline.', '',
    `- Primary pivot endings covered ${d.primarySupported}/100 drawn numbers, but ${d.primarySupportedMisses} of those full numbers were absent from the selected 20. Ending evidence cannot reliably distinguish every number sharing an ending.`,
    `- ${d.outsidePivotHits} retained winning number(s) lay outside the primary pivot pool; soft support allowed them to survive.`,
    `- Unconstrained top 20 retained ${d.rawTop20Hits}; applying balance/diversity changed coverage by ${d.balanceHitChange >= 0 ? '+' : ''}${d.balanceHitChange}. Constraints trade score for coverage shape; they are not guaranteed to help on each draw.`,
    `- Reducing 20 to 18 lost ${d.retained20LostAt18} already retained winning numbers; reducing 18 to 16 lost another ${d.retained18LostAt16}.`,
    `- Exact detailed state unseen in ${d.exactUnseen}/20 forecasts. Two-word sequence unseen in ${d.sequenceUnseen}/20 and supported by fewer than 24 examples in ${d.sequenceSparse}/20. Fine-grained language gets sparse quickly.`, '',
    `The combined 20 minus control paired interval is ${main.versusControl.lower.toFixed(2)} to ${main.versusControl.upper.toFixed(2)} hits/draw. These 20 results do not establish a predictive edge. Uniform-null upper-tail probability for its total coverage is ${main.uniformNullUpperTail.toFixed(4)}; this is unadjusted, conditional on uniform independent draws, and not a probability that the model works.`, '',
    `The ${old.length} replay draws already present in the previously studied archive retained ${sum(old.map(r => r.arms.combined[20].hits))}/${old.length * 5}; the ${fresh.length} newly added results retained ${sum(fresh.map(r => r.arms.combined[20].hits))}/${fresh.length * 5}. This split is descriptive: performance was uneven and much of the apparent gain came from the older portion.`, '',
    '### Concrete successes and failures', '',
    `- All five numbers survived on ${records.filter(r => r.arms.combined[20].hits === 5).map(r => r.date).join(', ')}. Those successes describe a 20-number pool, not a selected five-number ticket.`,
    ...records.filter(r => r.arms.combined[20].hits === 0).map(r => `- ${r.date}: missed all five (${numbersText(r.actual)}). Primary pivot endings supported ${r.diagnostics.primarySupported.length} of them, and the final selector excluded those supported full numbers too; the other ${5 - r.diagnostics.primarySupported.length} lacked primary-pivot support. Diversity changed this draw by ${r.diagnostics.balanceHitChange} hits versus unconstrained ranking.`),
    `- Latest result ${records.at(-1).date}: retained ${numbersText(records.at(-1).arms.combined[20].matched)}, missed ${numbersText(records.at(-1).arms.combined[20].missed)}. The companion activated by that all-even result belongs to the following forecast; it was not applied backward to this result.`,
    '- Adding language to pivot+history changed total coverage by only two hits (58 versus 56); frequency alone retained 59. Equal nominal weights do not imply equal influence: the binary pivot bonus can dominate small historical differences. A reduced pivot bonus is a future hypothesis to test, not an adjustment made to this replay.', '',
    '## The language', '',
    ...Object.entries(PATTERN_LEXICON).map(([key, value]) => `- **${key}**: ${value}`), '',
    'A detailed draw is a sentence of feature tokens. O/L/U is a coarse word; two consecutive words form a sequence. Learned branches describe several possible successors, never a single promised result. This represents uncertainty as a distribution; it is a classical statistical analogy to the user’s superposition idea, not a quantum model.', '',
    'The model looks up exact states, coarse words, two-word sequences and individual O/L/U/C/S features. Sparse matches receive 24 prior observations toward historical baseline. Pattern scores use conditional lift relative to that baseline to reduce double counting with frequency. The component letters remain correlated and are averaged within one evidence family.', '',
    'Successor-code percentages cover previously observed codes; unseen codes are unmodeled. Full-number forecasts retain support for all 42. Fine-grained successor branches are descriptive and must not be read as exhaustive future possibilities.', '',
    '## Fixed selection rules', '',
    '- Equal weights for pivot support, language lift, and full-number frequency. These are provisional design choices, not fitted probabilities.',
    '- Full-number frequency is shrunk toward uniform with 84 prior draws. Pivot support is capped binary membership; duplicate equations do not add votes.',
    '- Add synthetic 1 after all-even source draws and synthetic 0 after all-odd source draws. If a mixed source still yields a single-parity pool, use an available pivot of opposite parity. Companions give half the primary support.',
    '- Choose 20 from all 42, with at least 8 of each parity and each half (1–21 /22–42). Soft penalties favor balance, ending variety and range representation proportional to available numbers.',
    '- Seed with five per odd/even × low/high quadrant; accept improving one-number swaps. This is a deterministic local search, not a proof of the global optimum.',
    '- Produce nested 18 and 16 by least-loss feasible deletion. Bounds are 7–11 for 18 and 6–10 for 16. Date/number hashing resolves ties; no random sampling.', '',
    '## Every replayed draw', '',
    '| Date | Actual | Source word | Selected 20 hits | Matched | Missed | 18 hits | 16 hits | Control 20 |',
    '|---|---|---|---:|---|---|---:|---:|---:|',
    ...records.map(r => `| ${r.date} | ${numbersText(r.actual)} | ${r.forecast.language.source.word} | ${r.arms.combined[20].hits} | ${numbersText(r.arms.combined[20].matched) || '—'} | ${numbersText(r.arms.combined[20].missed) || '—'} | ${r.arms.combined[18].hits} | ${r.arms.combined[16].hits} | ${r.arms.control[20].hits} |`), '',
    '## Prospective next-state map', '',
    `Frozen source: **${report.nextForecast.sourceDate}** — ${report.nextForecast.language.source.code}. This forecast has no target result in the report.`, '',
    ...POOL_REDUCTION_RULES.sizes.map(k => `- Pool ${k}: ${numbersText(report.nextForecast.pools[k])}`), '',
    `Primary pivots: ${report.nextForecast.pivot.selection.pivots.join(', ')}. Companion: ${report.nextForecast.pivot.companion ?? 'none'}.`, '',
    '## Capturing intuition before results', '',
    'Copy the journal template beside this report. Record the source date, the exact feature or sequence that caught your attention, what you think follows, alternatives that would also fit, and what would count against it. Freeze that entry before the next result. Afterward, record both matches and misses without rewriting the original observation.', '',
    'Potential future grammar changes (not used to rescore these 20): gap-shape tokens, alternating/repeating token sequences, and user-named motifs. Compare coarse vs detailed definitions on new outcomes before expanding the vocabulary.', '',
    '## Provenance and reproduction', '',
    '- Historical base: [cash5-history.json](../tests/fixtures/cash5-history.json), 910 stored draws through 2026-08-29.',
    '- Recent supplement: [pattern-language-recent-draws.json](../tests/fixtures/pattern-language-recent-draws.json). [LotteryUSA results](https://www.lotteryusa.com/south-carolina/palmetto-cash-5/year) supply Aug 30–Sep 10. Sep 11 is the user-provided screenshot, not independently verified.',
    '- Full selected pools, 42 number scores, missed-number reasons, up to 12 recent historical examples per component, alternative arms and successor support are in [the JSON report](pool-reduction-report.json). Omitted example counts are explicit; the module can reproduce all match dates from the input history.',
    '- Re-run: `npm run evaluate:pool`. The input data and rule-source checksums are stored in JSON.', '',
    `Input checksum: \`${report.inputChecksum}\`.`, ''
  ];
  return lines.join('\n');
}

async function main() {
  const archive = JSON.parse(await readFile(path.join(ROOT, 'tests/fixtures/cash5-history.json'), 'utf8'));
  const recent = JSON.parse(await readFile(path.join(ROOT, 'tests/fixtures/pattern-language-recent-draws.json'), 'utf8'));
  const history = cleanPivotHistory([...archive.draws, ...recent.draws]);
  const ruleSources = ['js/poolReductionAgent.js', 'js/patternLanguage.js', 'js/automaticPivot.js', 'js/pivotPools.js', 'scripts/evaluate_pool_reduction.js'];
  const sourceChecksums = Object.fromEntries(await Promise.all(ruleSources.map(async file => [file, hash(await readFile(path.join(ROOT, file)))])));
  const result = evaluatePoolReduction(history);
  const report = { schemaVersion: 1, study: 'Fixed-policy retrospective diagnostic; not an untouched holdout',
    dataProvenance: { archiveThrough: archive.endDate, publicSource: recent.publicSource, publicThrough: recent.publicThrough,
      userSuppliedDate: recent.userSuppliedDate },
    inputChecksum: hash(JSON.stringify(history)), sourceChecksums, historyDraws: history.length,
    rules: POOL_REDUCTION_RULES, ...result, nextForecast: forecastReducedPool(history) };
  for (const forecast of [...report.records.map(r => r.forecast), report.nextForecast]) {
    for (const component of forecast.language.components) {
      component.omittedMatchCount = Math.max(0, component.matches.length - 12);
      component.matches = component.matches.slice(-12);
    }
  }
  await mkdir(path.join(ROOT, 'reports'), { recursive: true });
  await writeFile(path.join(ROOT, 'reports/pool-reduction-report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(ROOT, 'reports/pool-reduction-report.md'), markdown(report));
  console.log(JSON.stringify({ dates: [result.records[0].date, result.records.at(-1).date],
    summary: Object.fromEntries(Object.entries(result.summary).map(([key, value]) => [key, Object.fromEntries(Object.entries(value).map(([size, x]) => [size, { total: x.totalHits, mean: x.meanHits, interval: x.versusControl }]))])),
    diagnostics: result.diagnosticTotals }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
