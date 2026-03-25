const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Steam scaffold: init Steam when SDK is available; in production app must not run without Steam
let steamRunning = false;
let steamId = null;
function initSteam() {
  try {
    // When steamworks.js (or native Steamworks) is added, init here and set steamRunning/steamId
    // const steam = require('steamworks.js'); ...
    steamRunning = false;
    steamId = null;
  } catch (e) {
    steamRunning = false;
    steamId = null;
  }
}
initSteam();

function getAppPath() {
  return app.getPath('userData');
}

function readSave(filename) {
  try {
    const filePath = path.join(getAppPath(), filename);
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function writeSave(filename, data) {
  const dir = getAppPath();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

const SETTINGS_FILE = 'settings.json';
const DEFAULT_WINDOW_WIDTH = 1920;
const DEFAULT_WINDOW_HEIGHT = 1080;
const MIN_WINDOW_WIDTH = 1280;
const MIN_WINDOW_HEIGHT = 720;

function getSettings() {
  const data = readSave(SETTINGS_FILE);
  const windowWidth = typeof data?.windowWidth === 'number' ? Math.max(MIN_WINDOW_WIDTH, data.windowWidth | 0) : DEFAULT_WINDOW_WIDTH;
  const windowHeight = typeof data?.windowHeight === 'number' ? Math.max(MIN_WINDOW_HEIGHT, data.windowHeight | 0) : DEFAULT_WINDOW_HEIGHT;
  return {
    fullscreen: data?.fullscreen !== false,
    windowWidth,
    windowHeight,
    ...data,
  };
}

function createWindow() {
  const settings = getSettings();
  const win = new BrowserWindow({
    width: settings.windowWidth,
    height: settings.windowHeight,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    fullscreen: settings.fullscreen,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:4200');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/game-ui/browser/index.html'));
  }

  ipcMain.handle('getAppPath', () => getAppPath());
  ipcMain.handle('readSave', (_, filePath) => readSave(filePath));
  ipcMain.handle('writeSave', (_, filePath, data) => {
    writeSave(filePath, data);
    return undefined;
  });
  ipcMain.handle('isSteamRunning', () => steamRunning);
  ipcMain.handle('getSteamId', () => steamId);
  ipcMain.handle('setWindowSize', (_event, width, height) => {
    if (typeof width === 'number' && typeof height === 'number') {
      const w = Math.max(MIN_WINDOW_WIDTH, width | 0);
      const h = Math.max(MIN_WINDOW_HEIGHT, height | 0);
      win.setSize(w, h);
      const current = readSave(SETTINGS_FILE) || {};
      writeSave(SETTINGS_FILE, { ...current, windowWidth: w, windowHeight: h });
    }
  });
  ipcMain.handle('getSettings', () => getSettings());
  ipcMain.handle('setFullScreen', (_event, fullscreen) => {
    win.setFullScreen(Boolean(fullscreen));
    const current = readSave(SETTINGS_FILE) || {};
    writeSave(SETTINGS_FILE, { ...current, fullscreen: Boolean(fullscreen) });
  });
  ipcMain.handle('quit', () => app.quit());

  if (!steamRunning && !isDev) {
    dialog.showErrorBox('Steam required', 'This game must be run from Steam.');
    app.quit();
    return;
  }
  if (!steamRunning && isDev) {
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('steam-warning', 'Steam is not running (dev mode – app continues).');
    });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
