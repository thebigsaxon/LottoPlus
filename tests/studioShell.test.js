import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const htmlPath = new URL('../index.html', import.meta.url);
const appPath = new URL('../js/app.js', import.meta.url);
const gridPath = new URL('../js/gridMatrix.js', import.meta.url);
const stylesPath = new URL('../css/styles.css', import.meta.url);
const webViewPath = new URL('../LottoPlusApp/WebView.swift', import.meta.url);
const recommendationPath = new URL('../js/patternRecommendations.js', import.meta.url);
const sessionStorePath = new URL('../js/sessionStore.js', import.meta.url);
const patternEnginePath = new URL('../js/patternEngine.js', import.meta.url);
const connectionEnginePath = new URL('../js/connectionEngine.js', import.meta.url);

test('Cash 5 Studio shell exposes contextual pattern, annotation, and session surfaces', async () => {
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /<h1>Cash 5 Studio<\/h1>/);
  assert.match(html, /id="patternsPopover" hidden/);
  assert.match(html, /id="chkDiagonalMathematicalSequences"/);
  assert.match(html, /Left\/right sister shifts/);
  assert.match(html, /id="chkSisterOutputSequences"/);
  assert.match(html, /id="chkLPatterns"/);
  assert.match(html, /id="chkInvertedLPatterns"/);
  assert.match(html, /id="chkKnightShifts"/);
  assert.match(html, /id="chkSkipRowVerticals"/);
  assert.match(html, /id="chkTwinEndings"/);
  assert.match(html, /id="chkConsecutivePairs"/);
  assert.match(html, /id="chkPivotPools"/);
  assert.match(html, />Pivot Pools</);
  assert.match(html, /id="chkWinningPivotPoints"/);
  assert.match(html, />Winning Pivot Point</);
  assert.doesNotMatch(html, /Difference Echoes|differenceEchoScope|Adjacent pairs|All pairs/);
  assert.match(html, /id="chkWinningPatterns"/);
  assert.match(html, />Winning Patterns</);
  assert.match(html, /class="complete-number-toggle"/);
  assert.match(html, />Show complete number</);
  assert.ok(html.indexOf('id="chkCompleteNumbers"') < html.indexOf('id="btnPatterns"'));
  assert.match(html, /id="futureDigitGrid"/);
  assert.match(html, /id="composerCard"/);
  assert.match(html, />Your pick</);
  assert.match(html, /Core, Spread, and Guard/);
  assert.match(html, /id="nextDrawTracks"/);
  assert.match(html, /id="pivotWorkbench"/);
  assert.match(html, /Ending pool workbench/);
  assert.match(html, /id="nextDrawGuide"/);
  assert.match(html, />How to use this board</);
  assert.match(html, /you shrink 0–9 from the latest official row/);
  assert.match(html, /Start with High/);
  assert.match(html, /id="futureAllDigitGrid"/);
  assert.match(html, /id="allDigitsDisclosure"/);
  assert.match(html, />Show all digits</);
  assert.match(html, /id="annotationToolbar" hidden/);
  assert.match(html, />Save row</);
  assert.match(html, /id="finalizeSharePrompt" hidden/);
  assert.doesNotMatch(html, /Numbers saved from optional evidence/);
  assert.doesNotMatch(html, /Historical signal/);
  assert.match(html, /Your five positions/);
  assert.match(html, /latest 50 loaded drawings/);
  assert.match(html, /id="sessionsPanel" hidden/);
  assert.match(html, /Picks compared with results/);
  assert.match(html, /id="historicalPerformanceCard"/);
  assert.match(html, />Historical Performance</);
  assert.match(html, />Save for next draw</);
  assert.match(html, /id="btnZoomOut"/);
  assert.match(html, /id="btnZoomReset"/);
  assert.match(html, /id="btnZoomIn"/);
  assert.match(html, /id="btnTheme"/);
  assert.match(html, /id="jackpotStatus"/);
  assert.match(html, /cash5studio_theme/);
  assert.match(html, /Your extra line/);
  assert.match(html, /Optional research tool/);
  assert.match(html, /Map at least one digit on the Next Draw Board/);
  assert.match(html, /Your pick appears as the Next drawing row/);
  assert.match(html, /Honorable mention/);
  assert.match(html, /id="pivotPoolReference"[^>]*hidden/);
  assert.match(html, /id="winningPivotReference"[^>]*hidden/);
  assert.match(html, /id="historyThemeAlert"/);
  assert.doesNotMatch(html, /id="nextDrawThemeAlert"/);
  assert.ok(html.indexOf('id="digitRepeatSummary"') < html.indexOf('id="pivotPoolReference"'));
  assert.ok(html.indexOf('id="pivotPoolReference"') < html.indexOf('id="winningPivotReference"'));
  assert.ok(html.indexOf('id="winningPivotReference"') < html.indexOf('class="matrix-scroll"'));
  assert.doesNotMatch(html, /Select at least one digit in each row/);
  assert.doesNotMatch(html, /Powerball|Mega Millions|game-tabs/);
});

test('position highlighting, click-off Patterns, and native sharing are wired', async () => {
  const [appSource, gridSource, webViewSource] = await Promise.all([
    readFile(appPath, 'utf8'),
    readFile(gridPath, 'utf8'),
    readFile(webViewPath, 'utf8')
  ]);
  assert.match(appSource, /document\.addEventListener\("pointerdown"/);
  assert.match(appSource, /patternsPopover\.contains\(event\.target\)/);
  assert.match(appSource, /findBoardSimilarSequences\(this\.researchDraws/);
  assert.match(appSource, /buildNumberEvidence\(focusedMapping\.digit, this\.researchDraws/);
  assert.match(appSource, /rankHistoricalSuccessors\(this\.researchDraws\)/);
  assert.match(appSource, /showDiagonalMathematicalSequences = e\.target\.checked/);
  assert.match(appSource, /showSisterOutputSequences = e\.target\.checked/);
  assert.match(appSource, /showLPatterns = e\.target\.checked/);
  assert.match(appSource, /showInvertedLPatterns = e\.target\.checked/);
  assert.match(appSource, /showKnightShifts = e\.target\.checked/);
  assert.match(appSource, /showSkipRowVerticals = e\.target\.checked/);
  assert.match(appSource, /showTwinEndings = e\.target\.checked/);
  assert.match(appSource, /showConsecutivePairs = e\.target\.checked/);
  assert.match(appSource, /showPivotPools = e\.target\.checked/);
  assert.match(appSource, /resolveActivePivotReference\(this\.filteredDraws/);
  assert.match(appSource, /buildPivotPool\(sourceDraw\?\.numbers, this\.activePivotReference\?\.mode\)/);
  assert.match(appSource, /study reference · does not affect system lines/);
  assert.match(appSource, /onPivotReferenceChangeCallback/);
  assert.match(appSource, /showWinningPivotPoints = e\.target\.checked/);
  assert.match(appSource, /resolveActiveWinningPivotDrawId\(/);
  assert.match(appSource, /buildWinningPivotTimeline\(this\.filteredDraws\)/);
  assert.match(appSource, /onWinningPivotRowChangeCallback/);
  assert.match(appSource, /retrospective study reference/);
  assert.match(appSource, /showWinningPatterns = e\.target\.checked/);
  assert.match(appSource, /onWinningRowToggleCallback/);
  assert.match(appSource, /analyzeNextDrawBoard\(this\.researchDraws, \{ limit: 3 \}\)/);
  assert.match(appSource, /buildPivotWorkbench\(this\.draws, this\.pivotWorkbenchSettings\)/);
  assert.match(appSource, /feeds Core, Spread, and Guard/);
  assert.match(appSource, /pivot-workbench-reference/);
  assert.doesNotMatch(appSource, /Recency ∩/);
  assert.match(appSource, /data-workbench-chooser/);
  assert.match(appSource, /data-workbench-operator/);
  assert.match(appSource, /composePoolLines\(workbench\)/);
  assert.match(appSource, /detectNumberTheme\(this\.filteredDraws\)/);
  assert.match(appSource, /Whole-number theme live/);
  assert.match(appSource, /data-use-theme-line/);
  assert.match(appSource, /system-reason/);
  assert.match(appSource, /Mathematical prior/);
  assert.match(appSource, /HNCDE transition/);
  assert.match(appSource, /pattern-support-list/);
  assert.match(appSource, /pattern-recommendation-number/);
  assert.match(appSource, /data-future-number="\$\{position\.number\}"/);
  assert.match(appSource, /applySystemDrawingPick\(this\.workspace, \{ column, number \}\)/);
  assert.match(appSource, /applyUserDigitPick\(this\.workspace, \{ column, digit \}\)/);
  assert.match(appSource, /systemDigitMap = \[\]/);
  assert.match(appSource, /system-selected/);
  assert.match(appSource, /historyHighlights/);
  assert.match(appSource, /const selections = this\.workspace\.futureDigitMap \|\| \[\]/);
  assert.match(appSource, /slipNumbers = \[null, null, null, null, null\]/);
  assert.match(appSource, /getAttribute\('data-future-number'\)/);
  assert.match(appSource, /stream-evidence-grid/);
  assert.match(appSource, /Analyzer v/);
  assert.match(appSource, /systemLineLabel\(row, analyzerVersion\)/);
  assert.match(appSource, /trackForecasts/);
  assert.match(appSource, /pivotEvidence/);
  assert.match(appSource, /initializePredictionLedger/);
  assert.match(appSource, /reconcileOfficialDraws/);
  assert.match(appSource, /const currentModel = summary\.models\.find\(model => model\.version === currentVersion\)/);
  assert.match(appSource, /Current analyzer only/);
  assert.doesNotMatch(appSource, /summary\.models\.map/);
  assert.match(appSource, /Picks compared with results|selected numbers drawn/);
  assert.match(appSource, /Study-track ending calls/);
  assert.match(appSource, /successor-rank-/);
  assert.match(gridSource, /setPositionHighlights/);
  assert.match(gridSource, /position-highlighted/);
  assert.match(gridSource, /position-highlight-double/);
  assert.match(webViewSource, /NSSharingServicePicker/);
  assert.match(webViewSource, /cash5StudioNativeShare/);
});

test('prospective Pivot Pools feed v9 structure evidence while winning-pivot hindsight stays isolated', async () => {
  const [recommendationSource, sessionSource, patternSource, connectionSource] = await Promise.all([
    readFile(recommendationPath, 'utf8'),
    readFile(sessionStorePath, 'utf8'),
    readFile(patternEnginePath, 'utf8'),
    readFile(connectionEnginePath, 'utf8')
  ]);
  [recommendationSource, sessionSource, patternSource, connectionSource].forEach(source => {
    assert.doesNotMatch(source, /differenceEcho|difference-echo/i);
  });
  assert.match(recommendationSource, /expandPivotPoolNumbers/);
  assert.match(sessionSource, /pivotNumberEvidence/);
  assert.doesNotMatch(patternSource, /pivotPool/i);
  assert.doesNotMatch(connectionSource, /pivotPool/i);
  assert.doesNotMatch(recommendationSource, /winningPivot/i);
  assert.doesNotMatch(sessionSource, /winningPivot/i);
  assert.doesNotMatch(patternSource, /winningPivot/i);
  assert.doesNotMatch(connectionSource, /winningPivot/i);
});

test('Saved Sessions use one target drawing date and do not repeat scored result dates', async () => {
  const appSource = await readFile(appPath, 'utf8');
  assert.match(appSource, /sessionTargetDrawingDate\(session\)/);
  assert.match(appSource, /session-target-date">For Drawing \$\{escapeHTML\(targetDrawingDate\)\}/);
  assert.doesNotMatch(appSource, /<small>Saved after<\/small>/);
  assert.doesNotMatch(appSource, /<small>Official result<\/small><strong>\$\{escapeHTML\(session\.result\.date\)\}<\/strong>/);
});

test('interface zoom is persistent and constrained to readable steps', async () => {
  const [source, styles] = await Promise.all([
    readFile(appPath, 'utf8'),
    readFile(stylesPath, 'utf8')
  ]);
  assert.match(source, /cash5studio_interface_zoom/);
  assert.match(source, /INTERFACE_ZOOM_STEPS = \[0\.9, 1, 1\.1, 1\.2, 1\.3, 1\.4, 1\.5, 1\.6, 1\.75\]/);
  assert.match(source, /document\.querySelectorAll\('\.app-toolbar, \.app-main'\)/);
  assert.doesNotMatch(source, /document\.body\.style\.zoom/);
  assert.doesNotMatch(source, /this\.sessionsPanel\.style\.zoom/);
  assert.doesNotMatch(styles, /body\.zoom-enlarged \.primary-workspace/);
  assert.doesNotMatch(styles, /body\.zoom-extra \.primary-workspace/);
  assert.match(styles, /container: app-main \/ inline-size/);
  assert.match(styles, /@container app-main \(max-width: 980px\)[\s\S]*?\.primary-workspace, \.motif-layout, \.evidence-layout \{ grid-template-columns: 1fr; \}/);
});

test('HNCDE rows contain each digit group and enlarge only the hovered card', async () => {
  const [gridSource, styles] = await Promise.all([
    readFile(gridPath, 'utf8'),
    readFile(stylesPath, 'utf8')
  ]);
  assert.match(gridSource, /class="row-hcn-values"/);
  assert.match(styles, /\.row-hcn-digits \{ display: flex;/);
  assert.match(styles, /\.grid-table th\.hcn-column-heading \{ width: 226px;/);
  assert.match(styles, /\.row-hcn-digits \.row-hcn-group \{ flex: 0 1 auto; \}/);
  assert.match(styles, /\.row-hcn-values \{ min-width: 0; overflow: hidden; display: flex;/);
  assert.match(styles, /\.row-hcn-box \{[^}]*overflow: hidden;[^}]*cursor: zoom-in;/s);
  assert.match(styles, /\.row-hcn-box:hover \{[^}]*transform: scale\(1\.55\);/s);
  assert.match(styles, /\.row-hcn-group > b sup \{[^}]*font-size: 8px;/s);
  assert.doesNotMatch(styles, /\.matrix-scroll:has\(\.row-hcn-box:hover\)/);
});

test('digit summary uses readable H C N D E labels without definitions', async () => {
  const [appSource, styles] = await Promise.all([
    readFile(appPath, 'utf8'),
    readFile(stylesPath, 'utf8')
  ]);
  assert.match(appSource, /\["hot", "H", "Hot", summary\.hot\]/);
  assert.match(appSource, /\["cold", "C", "Cold", summary\.cold\]/);
  assert.match(appSource, /\["neutral", "N", "Neutral", summary\.neutral\]/);
  assert.doesNotMatch(appSource, /2\+ sequential|Recent, not sequential|Was hot; absent in N|Was cold; drawn in N/);
  assert.match(styles, /\.summary-group > strong \{[^}]*font: 750 16px var\(--mono\);/s);
  assert.doesNotMatch(styles, /\.summary-label/);
});

test('manual themes and independent live jackpot updates are wired', async () => {
  const [html, appSource, webViewSource] = await Promise.all([
    readFile(htmlPath, 'utf8'),
    readFile(appPath, 'utf8'),
    readFile(webViewPath, 'utf8')
  ]);
  assert.match(html, /data-theme/);
  assert.match(appSource, /cash5studio_theme/);
  assert.match(appSource, /cash5studio_last_jackpot/);
  assert.match(appSource, /fetchLiveCash5Update/);
  assert.match(appSource, /Last known jackpot/);
  assert.match(webViewSource, /www\.sceducationlottery\.com/);
});

test('project persistence uses version 4 while retaining one-way legacy Cash 5 migration', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.match(source, /version: 4/);
  assert.match(source, /cash5studio_current_project/);
  assert.match(source, /lottoplus_current_project/);
  assert.match(source, /\.cash5studio/);
});

test('mapped Next Draw digits use a high-contrast circular selection ring', async () => {
  const styles = await readFile(stylesPath, 'utf8');
  assert.match(styles, /--selection-ring:/);
  assert.match(styles, /\.future-map-cell\.mapped b, \.pattern-recommendation-cell\.mapped \.number-ones/);
  assert.match(styles, /border: 3px solid var\(--selection-ring\)/);
  assert.match(styles, /border-radius: 50%/);
});

test('Saved Sessions visibly marks picked numbers found in the actual draw', async () => {
  const [source, styles] = await Promise.all([
    readFile(appPath, 'utf8'),
    readFile(stylesPath, 'utf8')
  ]);
  assert.match(source, /drawn-number-match/);
  assert.match(source, /This picked number appeared in the actual draw/);
  assert.match(styles, /\.session-card \.ticket-numbers span\.drawn-number-match/);
  assert.match(styles, /content: "✓"/);
});
