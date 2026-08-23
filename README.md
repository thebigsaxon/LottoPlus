# Cash 5 Studio

Cash 5 Studio is a focused macOS workspace for exploring recent **SC Palmetto Cash 5** drawings. It combines a ten-draw ones-digit matrix, explainable historical relationships, a next-draw position board, fuzzy tens-range guidance, visually ranked number evidence, ticket-row composition, and timestamped outcome review.

The toolbar includes persistent low-glare Light and Dark themes. **Update Draws** refreshes both the latest 50 historical drawings and the current estimated jackpot from the official South Carolina Education Lottery; either result can update independently if one source is temporarily unavailable.

> Cash 5 Studio describes historical data; it does not predict lottery results. Drawings are independent random events, and visual patterns carry no predictive guarantee.

## Workflow

1. Review the latest ten drawings and optional relationship overlays in **Draw History**.
2. Map one ones digit per position on the **Next Draw Board**; matching history cells retain a distinct color for each Ball column.
3. Use **Study Similar Sequences** or **Inspect Number Evidence** across the latest 50 loaded drawings for context, then place useful full numbers directly into their corresponding slip positions.
4. Build and save one or more five-number rows from the position-aware menus; mapped digits automatically filter each Ball.
5. Finalize the saved rows for the next drawing, then copy them in an iMessage-ready format or open the native macOS share sheet. Locked sessions remain visible and can return to Ticket Builder for editing.

Pattern overlays support adjacent matches, same-column runs, one-column sister shifts, and three-draw mathematical sequences. Manual line and arrow annotations are available from the contextual **Annotate** toolbar.

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

Cash 5 Studio saves version 3 `.cash5studio` documents. Version 2 `.lottoplus` documents remain importable when they contain Cash 5 data. Powerball and Mega Millions documents are intentionally unsupported.

## License

MIT License. See [LICENSE](LICENSE).
