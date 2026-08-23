# PA 5 Studio

PA 5 Studio is a Windows 11 workspace for studying recent Pennsylvania **Cash 5** and **Treasure Hunt** drawings. It includes the ten-draw ones-digit matrix, historical relationships, next-draw position board, fuzzy tens guidance, number evidence, five-number ticket rows, and timestamped outcome review from the original Cash 5 Studio workflow.

Use the game switch in the toolbar to move between Cash 5 (1–43) and Treasure Hunt (1–30). Each game keeps independent drawings, annotations, selections, ticket rows, jackpots, and saved sessions.

**Update Draws** retrieves up to 50 drawings and the next jackpot from Pennsylvania Lottery’s official feeds. Draw and jackpot updates succeed independently, and the last valid data remains available if a source is temporarily unreachable.

> PA 5 Studio is an independent historical study tool and is not affiliated with or endorsed by the Pennsylvania Lottery. It does not predict results. Lottery drawings are independent random events. Players must be 18 or older; please play responsibly.

## Development

Install the locked dependencies and run the test suite:

```bash
pnpm install
pnpm test
```

Launch the Electron development build:

```bash
pnpm start
```

Build the unsigned Windows 11 x64 portable executable on Windows:

```bash
pnpm build:win
```

The artifact is written to `dist/PA-5-Studio-1.0.0-portable-x64.exe`. The GitHub Actions workflow also builds and uploads this artifact from the `pa-c5-th` branch. Because the private v1 build is unsigned, Windows SmartScreen may ask for confirmation before first launch.

## Data and projects

PA 5 Studio saves version 4 `.pa5studio` project files containing both games. CSV imports apply only to the game currently selected in the toolbar. Legacy SC `.cash5studio` and `.lottoplus` projects are intentionally unsupported because their game identity and rules differ.

Quick Cash is not included; it is separate from the main PA Cash 5 drawing.

## License

MIT License. See [LICENSE](LICENSE).
