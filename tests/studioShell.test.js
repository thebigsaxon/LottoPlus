import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const htmlPath = new URL('../index.html', import.meta.url);
const appPath = new URL('../js/app.js', import.meta.url);
const gridPath = new URL('../js/gridMatrix.js', import.meta.url);
const webViewPath = new URL('../LottoPlusApp/WebView.swift', import.meta.url);

test('Cash 5 Studio shell exposes contextual pattern, annotation, and session surfaces', async () => {
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /<h1>Cash 5 Studio<\/h1>/);
  assert.match(html, /id="patternsPopover" hidden/);
  assert.match(html, /id="chkDiagonalMathematicalSequences"/);
  assert.match(html, /Left\/right sister shifts/);
  assert.match(html, /id="chkSisterOutputSequences"/);
  assert.match(html, /id="chkLPatterns"/);
  assert.match(html, /id="futureDigitGrid"/);
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
  assert.match(html, /id="composerCard"/);
  assert.match(html, /id="btnZoomOut"/);
  assert.match(html, /id="btnZoomReset"/);
  assert.match(html, /id="btnZoomIn"/);
  assert.match(html, /id="btnTheme"/);
  assert.match(html, /id="jackpotStatus"/);
  assert.match(html, /cash5studio_theme/);
  assert.match(html, /Build Your 5-Number Slip/);
  assert.match(html, /Optional research tool/);
  assert.match(html, /Map at least one digit on the Next Draw Board/);
  assert.match(html, /Honorable mention/);
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
  assert.match(appSource, /rankPatternRecommendationsByColumn\(this\.researchDraws, 3\)/);
  assert.match(appSource, /walk-forward hit rate/);
  assert.match(appSource, /pattern-support-list/);
  assert.match(appSource, /successor-rank-/);
  assert.match(gridSource, /setPositionHighlights/);
  assert.match(gridSource, /position-highlighted/);
  assert.match(gridSource, /position-highlight-double/);
  assert.match(webViewSource, /NSSharingServicePicker/);
  assert.match(webViewSource, /cash5StudioNativeShare/);
});

test('interface zoom is persistent and constrained to readable steps', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.match(source, /cash5studio_interface_zoom/);
  assert.match(source, /INTERFACE_ZOOM_STEPS = \[0\.9, 1, 1\.1, 1\.2, 1\.3, 1\.4, 1\.5\]/);
  assert.match(source, /document\.body\.style\.zoom/);
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

test('project persistence uses version 3 while retaining one-way legacy Cash 5 migration', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.match(source, /version: 3/);
  assert.match(source, /cash5studio_current_project/);
  assert.match(source, /lottoplus_current_project/);
  assert.match(source, /\.cash5studio/);
});
