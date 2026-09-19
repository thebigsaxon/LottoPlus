# Draw language and pool reduction — fixed-policy experiment

**20 completed draws: 2026-08-23 through 2026-09-11.** 923 draws in the combined history.

This is a retrospective diagnostic of a newly specified rule. The archive has been examined in earlier studies; this is not an untouched holdout. Grammar, weights, constraints and tie-breaking were fixed before this replay. Observations update after each completed draw, with no later target used in its own forecast. No settings were tuned from these 20 outcomes.

Primary result: **58/100 winning numbers retained** in the 20-number pool (2.90/draw), versus 47.62/100 expected under independent uniform draws. The same-constraint deterministic control retained 48/100; frequency alone retained 59/100.

## Pool-size tradeoff

| Pool | Retained /100 | Average /draw | Uniform expectation /draw | 0/5 draws | 4+/5 draws | 5/5 draws |
|---|---:|---:|---:|---:|---:|---:|
| 20 | 58 | 2.90 | 2.38 | 2 | 7 | 3 |
| 18 | 50 | 2.50 | 2.14 | 2 | 6 | 2 |
| 16 | 44 | 2.20 | 1.90 | 3 | 4 | 1 |

These are full-number pool coverage figures, not winning-ticket probabilities. A 20-number pool contains 15,504 possible five-number lines.

## What contributed, and what failed

| Fixed experimental arm | 20-pool retained /100 | Difference from control /draw | Descriptive paired 95% interval |
|---|---:|---:|---|
| combined | 58 | 0.50 | -0.40 to 1.40 |
| control | 48 | 0.00 | 0.00 to 0.00 |
| history | 59 | 0.55 | -0.07 to 1.17 |
| pivot | 46 | -0.10 | -0.74 to 0.54 |
| language | 51 | 0.15 | -0.73 to 1.03 |
| withoutLanguage | 56 | 0.40 | -0.41 to 1.21 |
| withoutPivot | 58 | 0.50 | -0.15 to 1.15 |

All arms use the same size, constraint penalties, seed construction and tie-breaking. Ablations are exploratory comparisons, not a competition from which a new policy is selected. The control is one reproducible selection path; the exact uniform expectation is the main mathematical baseline.

- Primary pivot endings covered 65/100 drawn numbers, but 8 of those full numbers were absent from the selected 20. Ending evidence cannot reliably distinguish every number sharing an ending.
- 1 retained winning number(s) lay outside the primary pivot pool; soft support allowed them to survive.
- Unconstrained top 20 retained 55; applying balance/diversity changed coverage by +3. Constraints trade score for coverage shape; they are not guaranteed to help on each draw.
- Reducing 20 to 18 lost 8 already retained winning numbers; reducing 18 to 16 lost another 6.
- Exact detailed state unseen in 17/20 forecasts. Two-word sequence unseen in 10/20 and supported by fewer than 24 examples in 20/20. Fine-grained language gets sparse quickly.

The combined 20 minus control paired interval is -0.40 to 1.40 hits/draw. These 20 results do not establish a predictive edge. Uniform-null upper-tail probability for its total coverage is 0.0186; this is unadjusted, conditional on uniform independent draws, and not a probability that the model works.

The 7 replay draws already present in the previously studied archive retained 26/35; the 13 newly added results retained 32/65. This split is descriptive: performance was uneven and much of the apparent gain came from the older portion.

### Concrete successes and failures

- All five numbers survived on 2026-08-23, 2026-08-26, 2026-08-29. Those successes describe a 20-number pool, not a selected five-number ticket.
- 2026-08-30: missed all five (07 11 18 36 37). Primary pivot endings supported 1 of them, and the final selector excluded those supported full numbers too; the other 4 lacked primary-pivot support. Diversity changed this draw by 0 hits versus unconstrained ranking.
- 2026-09-01: missed all five (02 05 19 20 30). Primary pivot endings supported 2 of them, and the final selector excluded those supported full numbers too; the other 3 lacked primary-pivot support. Diversity changed this draw by -2 hits versus unconstrained ranking.
- Latest result 2026-09-11: retained 08 40, missed 06 34 36. The companion activated by that all-even result belongs to the following forecast; it was not applied backward to this result.
- Adding language to pivot+history changed total coverage by only two hits (58 versus 56); frequency alone retained 59. Equal nominal weights do not imply equal influence: the binary pivot bonus can dominate small historical differences. A reduced pivot bonus is a future hypothesis to test, not an adjustment made to this replay.

## The language

- **O**: Count of odd numbers (0–5).
- **L**: Count of numbers from 1 through 21 (0–5).
- **U**: Count of distinct decimal endings (1–5).
- **C**: Count of adjacent sorted pairs differing by 1; a run of three contributes two pairs.
- **R**: Count repeated from the immediately preceding calendar day; ? means unavailable or a gap.
- **S**: Spread: c = span at most 14, m = span 15–28, w = span 29–41.
- **B**: Five occupancy counts for 1–9 / 10–19 / 20–29 / 30–39 / 40–42.
- **word**: The coarse O/L/U state. A two-word sequence requires two consecutive calendar days.
- **transition**: An observed source state followed by a completed result exactly one calendar day later.

A detailed draw is a sentence of feature tokens. O/L/U is a coarse word; two consecutive words form a sequence. Learned branches describe several possible successors, never a single promised result. This represents uncertainty as a distribution; it is a classical statistical analogy to the user’s superposition idea, not a quantum model.

The model looks up exact states, coarse words, two-word sequences and individual O/L/U/C/S features. Sparse matches receive 24 prior observations toward historical baseline. Pattern scores use conditional lift relative to that baseline to reduce double counting with frequency. The component letters remain correlated and are averaged within one evidence family.

Successor-code percentages cover previously observed codes; unseen codes are unmodeled. Full-number forecasts retain support for all 42. Fine-grained successor branches are descriptive and must not be read as exhaustive future possibilities.

## Fixed selection rules

- Equal weights for pivot support, language lift, and full-number frequency. These are provisional design choices, not fitted probabilities.
- Full-number frequency is shrunk toward uniform with 84 prior draws. Pivot support is capped binary membership; duplicate equations do not add votes.
- Add synthetic 1 after all-even source draws and synthetic 0 after all-odd source draws. If a mixed source still yields a single-parity pool, use an available pivot of opposite parity. Companions give half the primary support.
- Choose 20 from all 42, with at least 8 of each parity and each half (1–21 /22–42). Soft penalties favor balance, ending variety and range representation proportional to available numbers.
- Seed with five per odd/even × low/high quadrant; accept improving one-number swaps. This is a deterministic local search, not a proof of the global optimum.
- Produce nested 18 and 16 by least-loss feasible deletion. Bounds are 7–11 for 18 and 6–10 for 16. Date/number hashing resolves ties; no random sampling.

## Every replayed draw

| Date | Actual | Source word | Selected 20 hits | Matched | Missed | 18 hits | 16 hits | Control 20 |
|---|---|---|---:|---|---|---:|---:|---:|
| 2026-08-23 | 01 13 17 40 41 | O2 L3 U5 | 5 | 01 13 17 40 41 | — | 5 | 3 | 2 |
| 2026-08-24 | 16 17 28 33 40 | O4 L3 U4 | 2 | 28 40 | 16 17 33 | 1 | 1 | 0 |
| 2026-08-25 | 02 04 13 20 39 | O2 L2 U5 | 3 | 13 20 39 | 02 04 | 2 | 1 | 2 |
| 2026-08-26 | 14 16 19 31 41 | O2 L4 U5 | 5 | 14 16 19 31 41 | — | 4 | 4 | 1 |
| 2026-08-27 | 05 26 33 36 41 | O3 L3 U4 | 2 | 05 33 | 26 36 41 | 1 | 0 | 3 |
| 2026-08-28 | 15 25 28 30 38 | O3 L1 U4 | 4 | 15 25 28 30 | 38 | 4 | 3 | 3 |
| 2026-08-29 | 10 17 32 37 38 | O2 L1 U3 | 5 | 10 17 32 37 38 | — | 5 | 5 | 2 |
| 2026-08-30 | 07 11 18 36 37 | O2 L2 U4 | 0 | — | 07 11 18 36 37 | 0 | 0 | 3 |
| 2026-08-31 | 07 09 16 38 39 | O3 L3 U4 | 4 | 07 09 38 39 | 16 | 4 | 4 | 4 |
| 2026-09-01 | 02 05 19 20 30 | O3 L3 U4 | 0 | — | 02 05 19 20 30 | 0 | 0 | 2 |
| 2026-09-02 | 01 18 23 34 38 | O2 L4 U4 | 3 | 01 18 38 | 23 34 | 2 | 2 | 4 |
| 2026-09-03 | 02 13 26 33 36 | O2 L2 U4 | 3 | 02 13 36 | 26 33 | 3 | 3 | 2 |
| 2026-09-04 | 05 08 22 28 36 | O2 L2 U3 | 4 | 08 22 28 36 | 05 | 4 | 4 | 2 |
| 2026-09-05 | 03 07 08 12 32 | O1 L2 U4 | 3 | 03 07 08 | 12 32 | 3 | 3 | 2 |
| 2026-09-06 | 04 09 11 15 37 | O2 L4 U4 | 3 | 09 11 15 | 04 37 | 2 | 2 | 4 |
| 2026-09-07 | 03 12 20 25 27 | O4 L4 U5 | 3 | 20 25 27 | 03 12 | 2 | 1 | 3 |
| 2026-09-08 | 07 13 20 28 37 | O3 L3 U5 | 4 | 07 20 28 37 | 13 | 3 | 3 | 4 |
| 2026-09-09 | 01 03 11 24 41 | O3 L3 U4 | 2 | 03 24 | 01 11 41 | 2 | 2 | 1 |
| 2026-09-10 | 06 09 23 24 41 | O4 L3 U3 | 1 | 24 | 06 09 23 41 | 1 | 1 | 4 |
| 2026-09-11 | 06 08 34 36 40 | O3 L2 U5 | 2 | 08 40 | 06 34 36 | 2 | 2 | 0 |

## Prospective next-state map

Frozen source: **2026-09-11** — O0 L2 U4 C0 R1 Sw B20021. This forecast has no target result in the report.

- Pool 20: 02 03 08 09 10 13 14 15 17 20 23 24 25 28 32 34 36 37 38 41
- Pool 18: 02 03 08 09 10 14 15 17 20 23 25 28 32 34 36 37 38 41
- Pool 16: 02 03 08 10 14 15 17 20 23 25 28 32 34 37 38 41

Primary pivots: 4. Companion: 1.

## Capturing intuition before results

Copy the journal template beside this report. Record the source date, the exact feature or sequence that caught your attention, what you think follows, alternatives that would also fit, and what would count against it. Freeze that entry before the next result. Afterward, record both matches and misses without rewriting the original observation.

Potential future grammar changes (not used to rescore these 20): gap-shape tokens, alternating/repeating token sequences, and user-named motifs. Compare coarse vs detailed definitions on new outcomes before expanding the vocabulary.

## Provenance and reproduction

- Historical base: [cash5-history.json](../tests/fixtures/cash5-history.json), 910 stored draws through 2026-08-29.
- Recent supplement: [pattern-language-recent-draws.json](../tests/fixtures/pattern-language-recent-draws.json). [LotteryUSA results](https://www.lotteryusa.com/south-carolina/palmetto-cash-5/year) supply Aug 30–Sep 10. Sep 11 is the user-provided screenshot, not independently verified.
- Full selected pools, 42 number scores, missed-number reasons, up to 12 recent historical examples per component, alternative arms and successor support are in [the JSON report](pool-reduction-report.json). Omitted example counts are explicit; the module can reproduce all match dates from the input history.
- Re-run: `npm run evaluate:pool`. The input data and rule-source checksums are stored in JSON.

Input checksum: `f005de3de38c1a127437a0a794aa986a87129a5e27e2b18921e252446708df66`.
