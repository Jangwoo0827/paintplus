'use strict';
const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage, screen, Menu, ClipboardItem, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');

const OPEN_EXTS = ['.paintplus', '.pp3d', '.glb', '.gltf', '.obj', '.stl', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];
const APP_TITLE = '그림판+';
const HEADLESS = !!process.env.PP_HEADLESS; // 테스트 전용: 오프스크린(창 없음)

let win = null;
let allowClose = false;
let rendererReady = false;
let pendingOpen = null;

// ---------- 단일 인스턴스 ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) {
      if (!HEADLESS) {
        if (win.isMinimized()) win.restore();
        if (!win.isVisible()) win.show();
        win.focus();
      }
    }
    const f = fileFromArgs(argv);
    if (f) sendOpenFile(f);
  });
  app.whenReady().then(boot);
  app.on('window-all-closed', () => app.quit());
}

function fileFromArgs(argv) {
  const start = app.isPackaged ? 1 : 2;
  for (const a of argv.slice(start)) {
    if (a.startsWith('--')) continue;
    try {
      if (OPEN_EXTS.includes(path.extname(a).toLowerCase()) && fs.statSync(a).isFile()) return path.resolve(a);
    } catch (_) { /* 존재하지 않음 */ }
  }
  return null;
}

function sendOpenFile(p) {
  if (win && rendererReady) win.webContents.send('app:open-file', p);
  else pendingOpen = p;
}

// ---------- 창 크기/위치 기억 ----------
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  const def = { width: 1360, height: 860 };
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (!s || !(s.width > 300) || !(s.height > 300)) return def;
    if (typeof s.x === 'number' && typeof s.y === 'number') {
      const visible = screen.getAllDisplays().some((d) => {
        const a = d.workArea;
        return s.x + 80 < a.x + a.width && s.x + s.width - 80 > a.x && s.y >= a.y - 10 && s.y + 60 < a.y + a.height;
      });
      if (!visible) return { width: s.width, height: s.height, maximized: !!s.maximized };
    }
    return s;
  } catch (_) {
    return def;
  }
}

let saveTimer = null;
function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  const maximized = win.isMaximized();
  const b = maximized || win.isMinimized() ? (win._lastNormal || win.getNormalBounds()) : win.getBounds();
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized }));
  } catch (_) { /* 무시 */ }
}
function scheduleSaveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveWindowState, 400);
}

// ---------- 창 생성 ----------
function boot() {
  Menu.setApplicationMenu(null); // 메뉴바는 렌더러(HTML)에서 직접 그린다
  const st = loadWindowState();
  win = new BrowserWindow({
    x: st.x,
    y: st.y,
    width: st.width,
    height: st.height,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: APP_TITLE,
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      offscreen: HEADLESS, // 자동 테스트: 화면에 창을 띄우지 않고 렌더링
    },
  });
  if (st.maximized) win.maximize();
  if (!HEADLESS) win.once('ready-to-show', () => win.show());
  win.on('resize', scheduleSaveState);
  win.on('move', scheduleSaveState);
  win.on('maximize', saveWindowState);
  win.on('unmaximize', saveWindowState);
  win.on('close', (e) => {
    saveWindowState();
    if (!allowClose && rendererReady) {
      e.preventDefault();
      win.webContents.send('app:close-request');
    }
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12' && !app.isPackaged) {
      win.webContents.toggleDevTools();
    }
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  const f = fileFromArgs(process.argv);
  if (f) pendingOpen = f;
  setupUpdater();
}

// ---------- 업데이트 (GitHub Releases) ----------
// 설치형: electron-updater 로 내려받아 재시작 시 설치. portable/개발 실행: 새 버전을 알리고 릴리스 페이지를 연다.
const REPO = 'Jangwoo0827/paintplus';
const isPortable = !!process.env.PORTABLE_EXECUTABLE_FILE;
let autoUpdater = null;
let manualCheck = false;
const sendUpdate = (type, data) => { if (win && !win.isDestroyed()) win.webContents.send('app:update', { type, ...data }); };

function cmpVersion(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1; }
  return 0;
}

async function checkViaGithub() {
  const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PaintPlus' } });
  if (!res.ok) throw new Error('GitHub 응답 ' + res.status);
  const rel = await res.json();
  if (cmpVersion(rel.tag_name, app.getVersion()) > 0) sendUpdate('available', { version: rel.tag_name.replace(/^v/, ''), url: rel.html_url, manual: true });
  else sendUpdate('none', { version: app.getVersion() });
}

function setupUpdater() {
  if (app.isPackaged && !isPortable) {
    try {
      ({ autoUpdater } = require('electron-updater'));
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on('update-available', (i) => sendUpdate('available', { version: i.version }));
      autoUpdater.on('update-not-available', () => sendUpdate('none', { version: app.getVersion() }));
      autoUpdater.on('download-progress', (p) => sendUpdate('progress', { percent: Math.round(p.percent) }));
      autoUpdater.on('update-downloaded', (i) => sendUpdate('ready', { version: i.version }));
      autoUpdater.on('error', (e) => { if (manualCheck) sendUpdate('error', { message: String(e && e.message || e) }); });
    } catch (e) { autoUpdater = null; }
  }
  if (app.isPackaged) setTimeout(() => checkForUpdates(false), 8000); // 시작 8초 뒤 조용히 확인
}

async function checkForUpdates(manual) {
  manualCheck = manual;
  try {
    if (autoUpdater) await autoUpdater.checkForUpdates();
    else if (app.isPackaged || manual) await checkViaGithub();
  } catch (e) { if (manual) sendUpdate('error', { message: String(e && e.message || e) }); }
}

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.on('update:check', () => checkForUpdates(true));
ipcMain.on('update:download', () => { if (autoUpdater) autoUpdater.downloadUpdate().catch((e) => sendUpdate('error', { message: String(e.message || e) })); });
ipcMain.on('update:install', () => { allowClose = true; if (autoUpdater) autoUpdater.quitAndInstall(false, true); });
ipcMain.on('update:open', (_e, url) => { if (typeof url === 'string' && url.startsWith(`https://github.com/${REPO}/`)) shell.openExternal(url); });

// ---------- IPC ----------
const recoveryFile = () => path.join(app.getPath('userData'), 'recovery.paintplus');

ipcMain.handle('app:ready', () => {
  rendererReady = true;
  const p = pendingOpen;
  pendingOpen = null;
  return p;
});
ipcMain.on('app:set-title', (_e, t) => { if (win) win.setTitle(t); });
ipcMain.on('app:close-now', () => {
  allowClose = true;
  try { fs.unlinkSync(recoveryFile()); } catch (_) { /* 없음 */ }
  if (win) win.close();
});
ipcMain.on('app:fullscreen', (_e, on) => { if (win) win.setFullScreen(!!on); });

ipcMain.handle('dialog:open', async (_e, opts = {}) => {
  const r = await dialog.showOpenDialog(win, {
    title: opts.title || '열기',
    properties: opts.multi ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: opts.filters || [],
  });
  if (r.canceled) return [];
  return r.filePaths.map((p) => ({ path: p, name: path.basename(p), data: fs.readFileSync(p) }));
});
ipcMain.handle('dialog:save', async (_e, opts = {}) => {
  const r = await dialog.showSaveDialog(win, {
    title: opts.title || '저장',
    defaultPath: opts.defaultPath,
    filters: opts.filters || [],
  });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('dialog:dir', async () => {
  const r = await dialog.showOpenDialog(win, { title: '라이브러리 폴더 선택', properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('fs:listDir', (_e, dir) => {
  const exts = ['.paintplus', '.pp3d', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.glb', '.gltf', '.obj', '.stl'];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    try {
      const st = fs.statSync(p);
      if (st.isFile() && exts.includes(path.extname(f).toLowerCase())) out.push({ name: f, path: p, mtime: st.mtimeMs, size: st.size });
    } catch (_) { /* 접근 불가 */ }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
});
ipcMain.handle('file:write', (_e, p, data) => {
  fs.writeFileSync(p, Buffer.from(data));
  return true;
});
ipcMain.handle('file:read', (_e, p) => ({ path: p, name: path.basename(p), data: fs.readFileSync(p) }));

// Electron 44+ 의 clipboard 는 비동기 ClipboardItem API, 이전 버전은 readImage/writeImage
ipcMain.handle('clipboard:readImage', async () => {
  if (typeof clipboard.readImage === 'function') {
    const img = clipboard.readImage();
    return img.isEmpty() ? null : img.toDataURL();
  }
  const items = await clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t === 'image/png') || item.types.find((t) => t.startsWith('image/'));
    if (!type) continue;
    const blob = await item.getType(type);
    const buf = Buffer.from(await blob.arrayBuffer());
    return `data:${type};base64,${buf.toString('base64')}`;
  }
  return null;
});
ipcMain.handle('clipboard:writeImage', async (_e, dataUrl) => {
  if (typeof clipboard.writeImage === 'function') {
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
    return true;
  }
  const png = nativeImage.createFromDataURL(dataUrl).toPNG();
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
  return true;
});

ipcMain.handle('recovery:write', (_e, data) => {
  fs.writeFileSync(recoveryFile(), Buffer.from(data));
  return true;
});
ipcMain.handle('recovery:read', () => {
  try { return fs.readFileSync(recoveryFile()); } catch (_) { return null; }
});
ipcMain.handle('recovery:clear', () => {
  try { fs.unlinkSync(recoveryFile()); } catch (_) { /* 없음 */ }
  return true;
});

ipcMain.handle('app:message', async (_e, o) => {
  const r = await dialog.showMessageBox(win, {
    type: o.type || 'info',
    title: o.title || APP_TITLE,
    message: o.message,
    detail: o.detail,
    buttons: o.buttons || ['확인'],
    defaultId: 0,
    cancelId: (o.buttons || ['확인']).length - 1,
    noLink: true,
  });
  return r.response;
});
