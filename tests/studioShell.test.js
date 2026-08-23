import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = relative => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('PA 5 Studio shell exposes both games and the full analysis workflow', async () => {
  const html = await read('index.html');
  assert.match(html, /<h1>PA 5 Studio<\/h1>/);
  assert.match(html, /data-game-id="cash5"/);
  assert.match(html, /data-game-id="treasureHunt"/);
  assert.match(html, /id="patternsPopover" hidden/);
  assert.match(html, /id="annotationToolbar" hidden/);
  assert.match(html, />Save row</);
  assert.match(html, /id="finalizeSharePrompt" hidden/);
  assert.match(html, /Your five positions/);
  assert.match(html, /latest 50 loaded drawings/);
  assert.match(html, /id="sessionsPanel" hidden/);
  assert.match(html, /id="btnTheme"/);
  assert.match(html, /id="jackpotStatus"/);
  assert.match(html, /Ctrl\+I/);
  assert.match(html, /\.pa5studio/);
  assert.match(html, /Players must be 18 or older/);
});

test('renderer wires position research and independent game-aware updates', async () => {
  const [appSource, gridSource] = await Promise.all([read('js/app.js'), read('js/gridMatrix.js')]);
  assert.match(appSource, /switchGame\(gameId\)/);
  assert.match(appSource, /fetchLiveGameUpdate\(this\.gameConfig\)/);
  assert.match(appSource, /buildNumberEvidence\([\s\S]*this\.gameConfig\)/);
  assert.match(appSource, /futureCellEvidence\([\s\S]*this\.gameConfig\)/);
  assert.match(appSource, /pa5studio_current_project_v4/);
  assert.match(appSource, /version: 4/);
  assert.match(appSource, /Copy slips/);
  assert.doesNotMatch(appSource, /cash5StudioNativeShare|iMessage/);
  assert.match(gridSource, /setPositionHighlights/);
});

test('Electron shell isolates the renderer and restricts privileged APIs', async () => {
  const [main, preload] = await Promise.all([read('electron/main.cjs'), read('electron/preload.cjs')]);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /hostname !== 'www\.palottery\.pa\.gov'/);
  assert.match(main, /PastWinningNumbers\.ashx/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\('pa5Desktop'/);
  assert.match(preload, /fetchOfficial/);
  assert.match(preload, /copyText/);
  assert.doesNotMatch(preload, /exposeInMainWorld\('pa5Desktop',\s*ipcRenderer/);
});

test('portable Windows packaging and CI are configured for x64', async () => {
  const [pkg, workflow] = await Promise.all([read('package.json'), read('.github/workflows/windows-portable.yml')]);
  assert.match(pkg, /"productName": "PA 5 Studio"/);
  assert.match(pkg, /"target": "portable"/);
  assert.match(pkg, /"arch": \["x64"\]/);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /pnpm build:win/);
});
