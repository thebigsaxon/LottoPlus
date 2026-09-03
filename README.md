# Cash 5 Studio

Cash 5 Studio is a focused macOS workspace for exploring recent **SC Palmetto Cash 5** drawings. It combines a ten-draw ending matrix with an optional complete-number mode, explainable historical relationships, a next-draw position board, fuzzy tens-range guidance, visually ranked number evidence, ticket-row composition, and timestamped outcome review.

The toolbar includes persistent low-glare Light and Dark themes. **Update Draws** refreshes the latest historical drawings from LotteryUSA and the current estimated jackpot from the official South Carolina Education Lottery; either result can update independently if one source is temporarily unavailable.

> Cash 5 Studio describes historical data; it does not predict lottery results. Drawings are independent random events, and visual patterns carry no predictive guarantee.

## Workflow

1. Review the latest ten drawings and optional relationship overlays in **Draw History**.
2. Review the **Next Draw Board**, where analyzer version 9 shows three neutral system lines (A–C) selected by the Blue uniform control. Red temporal evidence, Green structure evidence (including prospective pivot-derived full numbers), and Yellow H/N/C/D/E sequence evidence remain audited study tracks until a checked-in held-out report clears every promotion gate. The 15 control numbers are unique and partitioned into three valid, sorted lines; ending-multiplicity and Ball-column ending-diversity restrictions are not imposed. Open **Show all digits** for the historical-successor view, then toggle one digit per position for highlighting.
3. Use **Study Similar Sequences** or **Inspect Number Evidence** across the latest 50 loaded drawings for context, then place useful full numbers directly into their corresponding slip positions.
4. Optionally build an extra user line in **Your pick**, directly under the Next Draw Board. Those numbers appear as a **Next drawing** row under Latest in Draw History, so pattern overlays and Winning Patterns can land on the pick. The three system lines are already saved with the session; this picker is only for additional rows. Available tens bands fill automatically and refresh with official history or mapped-ending changes, while every manual tens choice remains locked.
5. Save the rows for the next drawing. Saved Sessions keeps them beside the three system lines and immutable track, pivot, policy, archive, and evaluation snapshots. After a result, the ledger scores the primary unordered match tier plus exact-position, ending, tens, pattern, pivot, and HNCDE diagnostics. Scored older-model sessions remain unchanged, while pending and future system selections use analyzer version 9.
6. After an official result arrives, review unordered number hits, exact-position hits, ending-digit hits, tens-band hits, and per-Ball diagnostics separately. The shorthand pattern scorecard reports every signal hit and miss by family and arithmetic operation.

Pattern overlays support adjacent matches, same-column runs, one-column sister shifts, knight shifts (skip one Ball), skip-row column runs, twin endings, consecutive n/n+1 pairs, and mathematical sequences running vertically, diagonally, into an uncluttered three-draw sister-output path, in an L, or in an inverted L. Enable **Show complete number** to compare whole values instead of independent digits; mathematical overlays then use literal in-range addition and absolute subtraction. Manual line and arrow annotations are available from the contextual **Annotate** toolbar.

Enable **Winning Patterns** to add a selector beside each history row. Checking a row displays every established pattern whose exact output lands in that draw and Ball position; multiple rows can be selected together.

Each track shows its top endings and audit status. The Green inspector expands low-, high-, or combined-pivot endings derived solely from the preceding draw into legal full-number candidates for each Ball position, then reports supporting temporal, pattern, and HNCDE evidence. Retrospective Winning Pivot Point analysis remains display-only and never enters prospective picks. The checked v9 held-out report currently authorizes only the Blue control. These diagnostics do not change the jackpot probability of any valid five-number line.

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
