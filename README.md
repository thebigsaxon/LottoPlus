# Cash 5 Studio

Cash 5 Studio is a focused macOS workspace for exploring recent **SC Palmetto Cash 5** drawings. It combines a ten-draw ending matrix with an optional complete-number mode, explainable historical relationships, a next-draw position board, fuzzy tens-range guidance, visually ranked number evidence, ticket-row composition, and timestamped outcome review.

The toolbar includes persistent low-glare Light and Dark themes. **Update Draws** refreshes the latest historical drawings from LotteryUSA and the current estimated jackpot from the official South Carolina Education Lottery; either result can update independently if one source is temporarily unavailable.

> Cash 5 Studio describes historical data; it does not predict lottery results. Drawings are independent random events, and visual patterns carry no predictive guarantee.

## Arrange your workspace

Each of the six workspace cards has a drag handle in its top bar and a resize corner at the bottom right. Drag the handle onto another card to move it to that position. Drag the corner to change width and height; widths snap to the workspace columns. Your layout is saved locally and restored when the app opens.

Cards reflow and scale to their available space while keeping text at least 9px at the supported interface zoom levels. Content-sized cards grow with expanded sections. Manually sized cards scroll only when readable content no longer fits. **Fit content** restores automatic height for one card; **Reset layout** restores all default positions and sizes. Narrow windows stack the cards while retaining their saved widths for larger windows.

Keyboard users can focus a move handle and press an arrow key to reorder cards. On a resize corner, Left/Right changes width, Up/Down changes height, and Home restores automatic height.

## Workflow

1. Review the latest ten drawings and optional relationship overlays in **Draw History**.
2. Let **Automatic** choose a pivot and build the number pool on the **Next Draw Board**, then optionally review analyzer version 12’s Core, Spread, and Guard lines. Core favors distinct endings, limits concentration, then favors equation support. Spread maximizes remaining tens-range coverage. Guard balances ending appearances across the three lines. Each uses range spacing to break ties, stays within the pool, and shares no full numbers with other lines. Previous-draw numbers remain eligible. These are construction rules, not probability ranks. The default view shows only the sorted full-number pool and its pivot. **Options** contains pivot controls, **System lines**, and **Show all digits** for historical-successor research.
3. Use **Study Similar Sequences** or **Inspect Number Evidence** across the latest 50 loaded drawings for context, then place useful full numbers directly into their corresponding slip positions.
4. Optionally build an extra user line in **Your pick**, directly under the Next Draw Board. Those numbers appear as a **Next drawing** row under Latest in Draw History, so pattern overlays and Winning Patterns can land on the pick. The three system lines are already saved with the session; this picker is only for additional rows. Available tens bands fill automatically and refresh with official history or mapped-ending changes, while every manual tens choice remains locked.
5. Save the rows for the next drawing. Saved Sessions keeps them beside the three system lines and immutable track, pivot, policy, archive, and evaluation snapshots. After a result, the ledger scores the primary unordered match tier plus exact-position, ending, tens, pattern, pivot, and HNCDE diagnostics. Scored older-model sessions remain unchanged, while pending and future system selections use analyzer version 12. Migration preserves the saved pivot recipe and extra user rows.
6. After an official result arrives, review unordered number hits, exact-position hits, ending-digit hits, tens-band hits, and per-Ball diagnostics separately. The shorthand pattern scorecard reports every signal hit and miss by family and arithmetic operation.

Pattern overlays support adjacent matches, same-column runs, one-column sister shifts, knight shifts (skip one Ball), skip-row column runs, twin endings, consecutive n/n+1 pairs, and mathematical sequences running vertically, diagonally, into an uncluttered three-draw sister-output path, in an L, or in an inverted L. Enable **Show complete number** to compare whole values instead of independent digits; mathematical overlays then use literal in-range addition and absolute subtraction. Manual line and arrow annotations are available from the contextual **Annotate** toolbar.

Enable **Winning Patterns** to add a selector beside each history row. Checking a row displays every established pattern whose exact output lands in that draw and Ball position; multiple rows can be selected together.

The older v9 study tracks remain available in evidence inspectors and evaluation scripts. Their held-out report evaluates that earlier policy, not the current Core/Spread/Guard composer.

## Automatic pivot selection

Automatic is the default. It reviews the checked-in 910-draw 5-from-42 archive plus loaded official results, deduplicated by date, with loaded results taking precedence. Both archive and loaded history are clipped to the source date before forecasting. Preview rows, invalid dates/numbers, and duplicate-number draws are excluded; gaps do not create next-day training pairs. The archive retains its provenance in `tests/fixtures/cash5-history.json`.

The target event is being among the source pivots whose ending pools cover the most balls in the next draw, including ties. This matches Winning Pivot's addition and borrowed-subtraction rules, including repeated source endings. It is not a ticket-winning probability. All source pivots receive smoothed estimates conditioned on pool size, relative pool width, and number of candidates. A fixed pattern model additionally studies pivot identity, high/low role and repeats, previous winners, two-draw transitions, two-step loops, and return gaps. No target result enters its own forecast.

After 90 training pairs, sequential forecasts provide a rolling validation sample of up to 240 completed pairs. Patterns require at least 120 forecasts and positive lower approximate 95% paired intervals for both Brier-score improvement and pool-size-adjusted coverage. A near-tied second pivot also requires 120 eligible validations with positive size-adjusted coverage improvement; union pools are capped at 30 numbers. These are conservative development gates, not proof of predictability. Current archive evaluation does **not** promote the pattern model or pairs, so automatic selection uses the historical baseline. Estimates and the reason are visible in Options; the default surface remains the number pool.

Run `npm run evaluate:pivot` to reproduce `tests/fixtures/automatic-pivot-report.json`. The automatic decision, source numbers/date, chosen pivots, estimates, training count, and validation state are saved with each pending drawing and pool snapshot. Result checking uses that stored decision without retraining it. Existing scored sessions and saved pool selections remain frozen. Existing live chooser preferences migrate to Automatic once; subsequent explicit overrides are retained.

## Next Draw construction and evidence

The composer compares every valid five-number subset of the remaining pool, applying each line’s objectives in priority order. Core maximizes distinct endings, minimizes repeated-ending concentration, then maximizes equation count and tens-range coverage. Spread maximizes tens-range coverage, prefers ranges not used by Core, then favors distinct endings and balanced coverage. Guard minimizes the sum of squared ending counts across all three lines, then favors distinct endings and tens coverage. Even spacing across 1–42 breaks remaining ties; fixed numeric ordering resolves exact ties reproducibly. Equation counts are construction inputs, not independent evidence of winning probability.

At least three endings are required. Each available line has five sorted numbers, and no full number appears twice across the lines. If fewer than five unused numbers remain, the next line stays empty and explains the remaining capacity.

Historical evaluation remains available in the data module, comparing observed ending hits with the average chance baseline for the **same historical pools and draw pairs**. These statistics are no longer displayed in the pool interface. A hit counts any drawn number whose ending is in the pool, regardless of sorted position. The historical baseline accounts for the different numbers of legal 1–42 values per ending. The returned evaluation metadata identifies the Tightest substitute for manual mode and the exclusion of equation edits. This describes pool history, not held-out evidence for the tickets.

Click numbers in the pool to toggle your selection, then choose **Save selections**. With no individual numbers selected, **Save pool** records the whole pool. Each save stores an immutable snapshot of the full pool, selected subset, pivot settings, and timestamp in the pending drawing’s Saved Sessions entry. Identical saves are deduplicated; different selections become separate records. Saved Sessions highlights exact-number hits for the chosen subset and reports how many of the five winning numbers the full pool covered. Pool selections are separate from five-number ticket statistics. Draft picks survive reopening, are restricted to the active pool, and reset when the source drawing advances.

**Clear selections & pick** clears mapped highlights and the unsaved extra pick. Generated system lines, drafted extra rows, and saved sessions remain. Changing a pivot updates the full-number grid and keeps Options and Reference open. The pool expansion rejects invalid endings, removes duplicates, excludes zero as a full number, and sorts the eligible 1–42 values numerically.

## Development

The interface is a static ES-module application embedded in a SwiftUI `WKWebView`. JavaScript modules live in `js/`, the design system is in `css/styles.css`, and Node's built-in test runner covers parsing, validation, relationships, state migration, evidence, and session scoring.

Run tests with an available Node.js runtime:

```bash
npm test
```

Rebuild and audit the checked-in policies with:

```bash
npm run build:archive
npm run evaluate:v6
npm run evaluate:v7
npm run evaluate:v9
npm run evaluate:pivot
```

Build the native application with Xcode command-line tools:

```bash
bash scripts/build_mac_app.sh
```

The packaged application is written to `dist/Cash 5 Studio.app`.

## Project files

Cash 5 Studio saves version 4 `.cash5studio` documents. Earlier Cash 5 Studio projects and version 2 `.lottoplus` documents remain importable when they contain Cash 5 data. Powerball and Mega Millions documents are intentionally unsupported.

## License

MIT License. See [LICENSE](LICENSE).
