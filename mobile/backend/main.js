'use strict';

/**
 * Backend Metronux untuk Android.
 *
 * Menjalankan penyimpanan, pencarian YouTube Music, lirik, dan proxy stream
 * di dalam nodejs-mobile, lalu menyajikan UI React dan API lokal lewat HTTP.
 * Semua server hanya mendengarkan di 127.0.0.1.
 */

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const { Store } = require('./electron/store');
const { MediaServer } = require('./electron/server');
const { findLyrics } = require('./electron/lyrics');
const { searchYoutubeMusic, getYoutubeHome, getYoutubeStreamUrl } = require('./electron/ytmusic');

const ROOT = __dirname;
const webDir = path.join(ROOT, 'web');
const dataDir = path.resolve(process.env.METRONUX_DATA_DIR || path.join(ROOT, 'data'));
const artDir = path.join(dataDir, 'artcache');
const portFile = path.join(dataDir, 'ports.json');

const BASE_PORT = 47800;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

let store = null;
let mediaServer = null;

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function buildHandlers() {
  return {
    'app:info': async () => ({
      name: 'Metronux',
      version: '1.0.0',
      mediaBase: mediaServer.baseUrl,
      token: mediaServer.token,
      dataDir,
      platform: 'android',
      systemAccent: '#6750A4',
      systemDark: true,
    }),

    'app:openDataFolder': async () => true,

    'app:openExternal': async (url) => typeof url === 'string' && /^https?:\/\//i.test(url),

    'library:get': async () => ({
      playlists: store.playlists,
      favorites: store.favorites,
      history: store.history,
      settings: store.settings,
    }),

    'settings:get': async () => store.settings,

    'settings:set': async (patch) => store.setSettings(patch),

    'playlists:create': async (payload) => {
      const playlist = store.createPlaylist(payload || {});
      await store.save();
      return playlist;
    },

    'playlists:update': async ({ id, patch } = {}) => {
      const playlist = store.updatePlaylist(id, patch || {});
      await store.save();
      return playlist;
    },

    'playlists:delete': async (id) => {
      const removed = store.deletePlaylist(id);
      await store.save();
      return { removed, playlists: store.playlists };
    },

    'favorites:toggle': async (track) => {
      const favorites = store.toggleFavorite(track);
      await store.save();
      const liked = favorites.some((item) => item.id === track?.id);
      return { favorites, liked };
    },

    'history:record': async (track) => {
      const history = store.recordHistory(track);
      await store.save();
      return history;
    },

    'ytm:search': async ({ query, type } = {}) => ({ items: await searchYoutubeMusic(query, type) }),

    'ytm:home': async () => ({ sections: await getYoutubeHome() }),

    'lyrics:find': async (song) => {
      if (!store.settings.lyricsEnabled) return null;
      return findLyrics(song || {});
    },
  };
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error('Permintaan terlalu besar');
    chunks.push(chunk);
  }
  if (!chunks.length) return [];
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return Array.isArray(parsed) ? parsed : [parsed];
}

function safeJoin(base, target) {
  const resolved = path.resolve(base, '.' + path.posix.normalize('/' + target));
  return resolved.startsWith(path.resolve(base) + path.sep) ? resolved : null;
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  if (pathname === '/mobile-shim.js') {
    const shim = path.join(webDir, 'mobile-shim.js');
    return serveFile(req, res, shim, false);
  }

  const file = safeJoin(webDir, pathname);
  if (!file) return sendJSON(res, 403, { error: 'Forbidden' });

  try {
    const stat = await fsp.stat(file);
    if (stat.isFile()) return serveFile(req, res, file, pathname.startsWith('/assets/'));
  } catch {}

  // Fallback SPA untuk rute hash.
  return serveFile(req, res, path.join(webDir, 'index.html'), false);
}

async function serveFile(req, res, file, immutable) {
  let stat;
  try {
    stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    return sendJSON(res, 404, { error: 'File tidak ditemukan' });
  }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

function createAppServer(handlers) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      if (url.pathname === '/health') {
        return sendJSON(res, 200, { ok: true, app: 'metronux' });
      }

      if (url.pathname === '/native/openExternal') {
        const target = url.searchParams.get('url') || '';
        return sendJSON(res, 200, { ok: /^https?:\/\//i.test(target) });
      }

      if (url.pathname.startsWith('/api/')) {
        if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method not allowed' });
        const channel = decodeURIComponent(url.pathname.slice('/api/'.length));
        const handler = handlers[channel];
        if (!handler) return sendJSON(res, 404, { error: `API tidak dikenal: ${channel}` });
        let args;
        try {
          args = await readBody(req);
        } catch (err) {
          return sendJSON(res, 400, { ok: false, error: err.message || 'Body tidak valid' });
        }
        try {
          const value = await handler(...args);
          return sendJSON(res, 200, { ok: true, value });
        } catch (err) {
          console.error(`[api:${channel}]`, err?.message || err);
          return sendJSON(res, 200, { ok: false, error: err?.message || String(err) });
        }
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return sendJSON(res, 405, { error: 'Method not allowed' });
      }

      return serveStatic(req, res, url);
    } catch (err) {
      console.error('[app]', err?.message || err);
      if (!res.headersSent) sendJSON(res, 500, { error: 'Internal error' });
      else res.destroy();
    }
  });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server.address().port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function pickPort() {
  for (let offset = 0; offset < 20; offset += 1) {
    const server = createAppServer(buildHandlers());
    try {
      const port = await listen(server, BASE_PORT + offset);
      return { server, port };
    } catch (err) {
      server.close();
      if (err.code !== 'EADDRINUSE') throw err;
    }
  }
  throw new Error('Tidak ada port lokal yang tersedia');
}

async function main() {
  process.env.TMPDIR = process.env.TMPDIR || path.join(dataDir, 'tmp');
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.mkdir(artDir, { recursive: true });
  await fsp.mkdir(process.env.TMPDIR, { recursive: true });

  store = new Store(dataDir);
  await store.init();

  mediaServer = new MediaServer({ artDir });
  await mediaServer.setStreamResolver(getYoutubeStreamUrl);
  await mediaServer.start();

  const { server, port } = await pickPort();
  const info = { app: port, media: mediaServer.port, token: mediaServer.token };
  await fsp.writeFile(portFile, JSON.stringify(info), 'utf8');

  console.log(`[metronux] siap di http://127.0.0.1:${port} (media ${mediaServer.port})`);

  const shutdown = () => {
    try {
      store?.saveSync();
    } catch {}
    try {
      mediaServer?.stop();
    } catch {}
    try {
      server.close();
    } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[metronux] gagal mulai:', err?.stack || err);
  process.exit(1);
});
