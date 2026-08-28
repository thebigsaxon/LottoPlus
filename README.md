# Cash 5 Studio

Cash 5 Studio is a focused macOS workspace for exploring recent **SC Palmetto Cash 5** drawings. It combines a ten-draw ones-digit matrix, explainable historical relationships, a next-draw position board, fuzzy tens-range guidance, visually ranked number evidence, ticket-row composition, and timestamped outcome review.

The toolbar includes persistent low-glare Light and Dark themes. **Update Draws** refreshes both the latest 50 historical drawings and the current estimated jackpot from the official South Carolina Education Lottery; either result can update independently if one source is temporarily unavailable.

> Cash 5 Studio describes historical data; it does not predict lottery results. Drawings are independent random events, and visual patterns carry no predictive guarantee.

## Workflow

1. Review the latest ten drawings and optional relationship overlays in **Draw History**.
2. Review the **Next Draw Board**, where each row is a complete increasing five-number recommendation. Model version 5 ranks endings from 70% Ball-position frequency, 20% calibrated positive pattern lift, and 10% H/N/C/D/E transition evidence across up to 50 draws. Full numbers blend 80% position frequency, 10% recency, and 10% four-draw proximity; previously drawn numbers remain eligible. The three recommendations form a 15-number coverage portfolio with no full number reused between lines and three different endings in every Ball column. Whole-line assembly also allows no more than two numbers sharing an ending, preventing rare three-number mathematical lines from appearing as ordinary recommendations. Open **Show all digits** for the historical-successor view, then toggle one digit per position for your own selection. Each mapped digit highlights all of its occurrences in Draw History; mapping the same digit twice adds concentric Ball-color rings.
3. Use **Study Similar Sequences** or **Inspect Number Evidence** across the latest 50 loaded drawings for context, then place useful full numbers directly into their corresponding slip positions.
4. Build and save one or more five-number rows from the position-aware menus. Available tens bands are filled automatically and refresh with official history or mapped-ending changes, while every manual tens choice remains locked.
5. Save the rows for the next drawing. Saved Sessions keeps them beside up to three valid increasing system lines and immutable ending-evidence and number-history snapshots. Previously drawn numbers remain eligible and are evaluated by position frequency, recency, and four-draw proximity. Scored older-model sessions remain unchanged, while pending and future system selections use model version 5.
6. After an official result arrives, review exact-number, ending-digit, tens-band, and per-Ball right/wrong diagnostics. The shorthand pattern scorecard reports every signal hit and miss by family and arithmetic operation.

Pattern overlays support adjacent matches, same-column runs, one-column sister shifts, and mathematical sequences running vertically, diagonally, into an uncluttered three-draw sister-output path, or in an L shape. Manual line and arrow annotations are available from the contextual **Annotate** toolbar.

Enable **Winning Patterns** to add a selector beside each history row. Checking a row displays every established pattern whose exact output lands in that draw and Ball position; multiple rows can be selected together.

Each per-Ball recommendation includes position-frequency, calibrated-pattern, H/N/C/D/E state, and full-number-history evidence plus leakage-free ending and exact-number walk-forward results in the inspector. These are measurements of historical agreement, not probabilities for a random future drawing.

## Development

The interface is a static ES-module application embedded in a SwiftUI `WKWebView`. JavaScript modules live in `js/`, the design system is in `css/styles.css`, and Node's built-in test runner covers parsing, validation, relationships, state migration, evidence, and session scoring.

Run tests with an available Node.js runtime:

```bash
npm test
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
