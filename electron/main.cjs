const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, net, protocol, session } = require('electron');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');

const APP_ORIGIN = 'pa5://app';
const MAX_OFFICIAL_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_PROJECT_BYTES = 10 * 1024 * 1024;
const LOCAL_MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
});

protocol.registerSchemesAsPrivileged([{ scheme: 'pa5', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setPath('userData', path.join(app.getPath('appData'), 'PA 5 Studio'));

function isTrustedSender(event) {
  return String(event.senderFrame?.url || '').startsWith(`${APP_ORIGIN}/`);
}

function validateOfficialUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.hostname !== 'www.palottery.pa.gov') throw new Error('That lottery host is not allowed.');
  if (url.pathname === '/feeds/games.aspx' && !url.search) return url;
  if (url.pathname === '/Custom/uploadedfiles/winning-numbers-history/PastWinningNumbers.ashx') {
    const game = url.searchParams.get('g');
    const year = url.searchParams.get('y');
    if ((game === '7' || game === '8') && /^\d{4}$/.test(year || '') && [...url.searchParams.keys()].every(key => key === 'g' || key === 'y')) return url;
  }
  throw new Error('That lottery feed path is not allowed.');
}

async function fetchOfficial(value) {
  const url = validateOfficialUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await net.fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'PA 5 Studio/1.0 (Windows 11)' }
    });
    if (!response.ok) throw new Error(`The PA Lottery server returned HTTP ${response.status}.`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_OFFICIAL_RESPONSE_BYTES) throw new Error('The PA Lottery response was unexpectedly large.');
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_OFFICIAL_RESPONSE_BYTES) throw new Error('The PA Lottery response was unexpectedly large.');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function sendMenuAction(action) {
  const focused = BrowserWindow.getFocusedWindow();
  focused?.webContents.send('menu-action', action);
}

function createMenu() {
  return Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'Import CSV…', accelerator: 'Ctrl+I', click: () => sendMenuAction('importCSV') },
      { label: 'Open Project…', accelerator: 'Ctrl+O', click: () => sendMenuAction('openProject') },
      { label: 'Save Project…', accelerator: 'Ctrl+S', click: () => sendMenuAction('saveProject') },
      { type: 'separator' }, { role: 'quit' }
    ] },
    { label: 'View', submenu: [
      { label: 'Zoom In', accelerator: 'Ctrl+Plus', click: () => sendMenuAction('zoomIn') },
      { label: 'Zoom Out', accelerator: 'Ctrl+-', click: () => sendMenuAction('zoomOut') },
      { label: 'Actual Size', accelerator: 'Ctrl+0', click: () => sendMenuAction('zoomReset') },
      { type: 'separator' }, { role: 'toggleDevTools', visible: !app.isPackaged }
    ] }
  ]);
}

function createWindow() {
  const window = new BrowserWindow({
    title: 'PA 5 Studio', width: 1280, height: 850, minWidth: 1100, minHeight: 720,
    backgroundColor: '#e4e1d9', icon: path.join(app.getAppPath(), 'assets', 'AppIcon1024.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false,
      contextIsolation: true, sandbox: true, webSecurity: true
    }
  });
  window.loadURL(`${APP_ORIGIN}/index.html`);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  if (process.argv.includes('--smoke-test')) {
    const timeout = setTimeout(() => {
      console.error('PA 5 Studio smoke test timed out.');
      app.exit(1);
    }, 15_000);
    window.webContents.on('console-message', (_event, details) => {
      if (details.level === 'error') console.error(`Renderer: ${details.message}`);
    });
    window.webContents.once('did-finish-load', async () => {
      try {
        const result = await window.webContents.executeJavaScript(`(() => {
          const cashHas43 = Boolean(document.querySelector('[data-slip-position] option[value="43"]'));
          document.querySelector('[data-game-id="treasureHunt"]')?.click();
          const treasureIsActive = document.querySelector('[data-game-id].active')?.dataset.gameId === 'treasureHunt';
          const treasureRejects43 = !document.querySelector('[data-slip-position] option[value="43"]');
          const treasureHas30 = Boolean(document.querySelector('[data-slip-position] option[value="30"]'));
          document.querySelector('[data-game-id="cash5"]')?.click();
          return {
            title: document.querySelector('h1')?.textContent,
            activeGame: document.querySelector('[data-game-id].active')?.dataset.gameId,
            hasWorkspace: Boolean(document.querySelector('#matrixTable')),
            cashHas43, treasureIsActive, treasureRejects43, treasureHas30
          };
        })()`);
        const passed = result.title === 'PA 5 Studio' && result.activeGame === 'cash5' && result.hasWorkspace
          && result.cashHas43 && result.treasureIsActive && result.treasureRejects43 && result.treasureHas30;
        console.log(JSON.stringify({ smokeTest: passed, ...result }));
        clearTimeout(timeout);
        app.exit(passed ? 0 : 1);
      } catch (error) {
        clearTimeout(timeout);
        console.error(error);
        app.exit(1);
      }
    });
  }
  return window;
}

app.whenReady().then(async () => {
  protocol.handle('pa5', async request => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const root = path.resolve(app.getAppPath());
    const target = path.resolve(root, relative);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) return new Response('Not found', { status: 404 });
    try {
      const contentType = LOCAL_MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
      return new Response(await readFile(target), { headers: { 'content-type': contentType } });
    }
    catch (_) { return new Response('Not found', { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ipcMain.handle('official-fetch', (event, value) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted request source.');
    return fetchOfficial(value);
  });
  ipcMain.handle('copy-text', (event, value) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted request source.');
    clipboard.writeText(String(value || '').slice(0, 100_000));
    return true;
  });
  ipcMain.handle('save-project', async (event, contents, suggestedName) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted request source.');
    const text = String(contents || '');
    if (!text || Buffer.byteLength(text, 'utf8') > MAX_PROJECT_BYTES) throw new Error('Project data is empty or too large.');
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Save PA 5 Studio Project', defaultPath: String(suggestedName || 'pa5-studio.pa5studio'),
      filters: [{ name: 'PA 5 Studio Project', extensions: ['pa5studio'] }]
    });
    if (result.canceled || !result.filePath) return false;
    const filePath = result.filePath.toLowerCase().endsWith('.pa5studio') ? result.filePath : `${result.filePath}.pa5studio`;
    await writeFile(filePath, text, 'utf8');
    return true;
  });
  Menu.setApplicationMenu(createMenu());
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
