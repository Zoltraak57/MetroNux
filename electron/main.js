'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const { Store } = require('./store');
const { MediaServer } = require('./server');
const { findLyrics } = require('./lyrics');
const { getSystemAccent } = require('./utils');
const { searchYoutubeMusic, getYoutubeHome, getYoutubeStreamUrl } = require('./ytmusic');

const env = (name) => process.env[`METRONUX_${name}`] ?? process.env[`MENTRONUX_${name}`];

if (env('DATA_DIR')) {
  app.setPath('userData', path.resolve(env('DATA_DIR')));
}

app.setName('Metronux');

// Izinkan pemutaran otomatis setelah pengguna memilih lagu, tanpa gestur tambahan.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;
let store = null;
let mediaServer = null;
let userDataDir = null;
let artDir = null;
let systemAccent = '#6750A4';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const value = await fn(event, ...args);
      return { ok: true, value };
    } catch (err) {
      console.error(`[ipc:${channel}]`, err);
      return { ok: false, error: err?.message || String(err) };
    }
  });
}

function registerIpc() {
  handle('app:info', async () => ({
    name: 'Metronux',
    version: app.getVersion(),
    mediaBase: mediaServer.baseUrl,
    token: mediaServer.token,
    dataDir: userDataDir,
    platform: process.platform,
    systemAccent,
    systemDark: nativeTheme.shouldUseDarkColors,
  }));

  handle('app:openDataFolder', async () => {
    await shell.openPath(userDataDir);
    return true;
  });

  handle('app:showItemInFolder', async (_e, filePath) => {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) return false;
    shell.showItemInFolder(filePath);
    return true;
  });

  handle('app:openExternal', async (_e, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  handle('library:get', async () => ({
    playlists: store.playlists,
    favorites: store.favorites,
    history: store.history,
    settings: store.settings,
  }));

  handle('settings:get', async () => store.settings);

  handle('settings:set', async (_e, patch) => {
    const settings = store.setSettings(patch);
    return settings;
  });

  handle('playlists:create', async (_e, payload) => {
    const playlist = store.createPlaylist(payload || {});
    await store.save();
    return playlist;
  });

  handle('playlists:update', async (_e, { id, patch }) => {
    const playlist = store.updatePlaylist(id, patch || {});
    await store.save();
    return playlist;
  });

  handle('playlists:delete', async (_e, id) => {
    const removed = store.deletePlaylist(id);
    await store.save();
    return { removed, playlists: store.playlists };
  });

  handle('favorites:toggle', async (_e, track) => {
    const favorites = store.toggleFavorite(track);
    await store.save();
    const liked = favorites.some((item) => item.id === track?.id);
    return { favorites, liked };
  });

  handle('history:record', async (_e, track) => {
    const history = store.recordHistory(track);
    await store.save();
    return history;
  });

  handle('ytm:search', async (_e, { query, type } = {}) => {
    const items = await searchYoutubeMusic(query, type);
    return { items };
  });

  handle('ytm:home', async () => {
    const sections = await getYoutubeHome();
    return { sections };
  });

  handle('lyrics:find', async (_e, song) => {
    if (!store.settings.lyricsEnabled) return null;
    return findLyrics(song || {});
  });
}

function registerMediaKeys() {
  const bind = (accelerator, command) => {
    try {
      if (!globalShortcut.isRegistered(accelerator)) {
        globalShortcut.register(accelerator, () => send('media:command', command));
      }
    } catch {}
  };
  bind('MediaPlayPause', 'toggle');
  bind('MediaNextTrack', 'next');
  bind('MediaPreviousTrack', 'previous');
  bind('MediaStop', 'stop');
}

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#131218',
    title: 'Metronux',
    show: false,
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL();
    if (url !== current && !url.startsWith('http://localhost:5173')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  const route = env('ROUTE') || '';
  if (isDev) {
    mainWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}${route ? `#${route}` : ''}`);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      hash: route || undefined,
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (env('DEBUG') === '1') {
    mainWindow.webContents.on('console-message', (...args) => {
      const detail = args[1];
      if (detail && typeof detail === 'object') {
        console.log(`[renderer:${detail.level}]`, detail.message, detail.sourceId || '', detail.lineNumber || '');
      } else {
        console.log('[renderer]', args[2], args[4] || '', args[3] || '');
      }
    });
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('[renderer-gone]', details);
    });
    mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
      console.error('[did-fail-load]', code, description, url);
    });
  }

  if (env('SCREENSHOT')) {
    const delay = Number(env('SCREENSHOT_DELAY') || 2500);
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const image = await mainWindow.webContents.capturePage();
          await fsp.writeFile(env('SCREENSHOT'), image.toPNG());
          console.log('[screenshot]', env('SCREENSHOT'));
          if (env('EXIT_AFTER_SCREENSHOT') === '1') {
            setTimeout(() => app.quit(), 180);
          }
        } catch (err) {
          console.error('[screenshot]', err.message);
        }
      }, delay);
    });
  }

  if (env('DEVTOOLS') === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

async function migrateLegacyData(targetDir) {
  if (env('DATA_DIR')) return;
  const legacyDir = path.join(app.getPath('appData'), 'Mentronux');
  if (path.resolve(legacyDir) === path.resolve(targetDir)) return;
  const legacyStore = path.join(legacyDir, 'mentronux.json');
  const targetStore = path.join(targetDir, 'metronux.json');
  if (!fs.existsSync(legacyStore) || fs.existsSync(targetStore)) return;
  try {
    await fsp.mkdir(targetDir, { recursive: true });
    // Salin hanya data aplikasi, bukan cache Chromium dari folder lama.
    await fsp.copyFile(legacyStore, path.join(targetDir, 'mentronux.json'));
    console.log('[migrasi] Data lama disalin ke', targetDir);
  } catch (err) {
    console.error('[migrasi] Gagal menyalin data lama:', err.message);
  }
}

async function bootstrap() {
  userDataDir = app.getPath('userData');
  artDir = path.join(userDataDir, 'artcache');
  await migrateLegacyData(userDataDir);
  await fsp.mkdir(userDataDir, { recursive: true });
  await fsp.mkdir(artDir, { recursive: true });

  store = new Store(userDataDir);
  await store.init();

  mediaServer = new MediaServer({ artDir });
  await mediaServer.start();
  mediaServer.setStreamResolver(getYoutubeStreamUrl);

  try {
    systemAccent = await getSystemAccent();
  } catch {
    systemAccent = '#6750A4';
  }

  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();
  registerMediaKeys();

  nativeTheme.on('updated', () => {
    send('system:theme', { dark: nativeTheme.shouldUseDarkColors });
  });
}

if (gotLock) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(bootstrap).catch((err) => {
    console.error('[main] Bootstrap gagal:', err);
    dialog.showErrorBox('Metronux gagal dimulai', err?.stack || String(err));
    app.quit();
  });
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (store) store.saveSync();
  if (mediaServer) mediaServer.stop();
});

process.on('uncaughtException', (err) => {
  console.error('[uncaught]', err);
});
