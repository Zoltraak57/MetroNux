'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

const UPSTREAM_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// YouTube menolak Range terbuka; ubah menjadi rentang byte tertutup.
function boundedRange(rangeHeader, total) {
  const fallback = total > 0 ? `bytes=0-${total - 1}` : 'bytes=0-1048575';
  if (!rangeHeader) return fallback;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
  if (!match) return fallback;
  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);
  if (start === null) {
    if (!total || !end) return fallback;
    start = Math.max(0, total - end);
    end = total - 1;
  } else if (end === null) {
    end = total > 0 ? total - 1 : start + 1048575;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return fallback;
  if (total > 0) end = Math.min(end, total - 1);
  return `bytes=${start}-${end}`;
}

const MIME_BY_EXT = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.weba': 'audio/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

function contentTypeFor(filePath) {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

/**
 * Server HTTP kecil untuk streaming audio (mendukung HTTP Range agar seek mulus)
 * dan menyajikan cached album art.
 */
class MediaServer {
  constructor({ artDir }) {
    this.artDir = artDir;
    this.token = crypto.randomBytes(16).toString('hex');
    this.port = 0;
    this.server = null;
    this.songMap = new Map();
    this.streamResolver = null;
  }

  setLibrary(songs) {
    this.songMap = new Map(songs.map((song) => [song.id, song]));
  }

  setStreamResolver(resolver) {
    this.streamResolver = resolver;
  }

  start() {
    if (this.server) return Promise.resolve({ port: this.port, token: this.token });
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.server.on('clientError', (err, socket) => {
      try {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      } catch {}
    });
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port;
        resolve({ port: this.port, token: this.token });
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  get baseUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  authorized(url) {
    const token = url.searchParams.get('t');
    return token === this.token;
  }

  async handle(req, res) {
    try {
      const url = new URL(req.url, this.baseUrl);
      cors(res);

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (url.pathname === '/health') {
        sendJSON(res, 200, { ok: true, app: 'metronux' });
        return;
      }

      if (!this.authorized(url)) {
        sendJSON(res, 403, { error: 'Forbidden' });
        return;
      }

      if (url.pathname.startsWith('/stream/')) {
        const videoId = decodeURIComponent(url.pathname.slice('/stream/'.length));
        if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
          sendJSON(res, 400, { error: 'ID video tidak valid' });
          return;
        }
        await this.proxyStream(req, res, videoId, false);
        return;
      }

      if (url.pathname.startsWith('/audio/')) {
        const id = decodeURIComponent(url.pathname.slice('/audio/'.length));
        const song = this.songMap.get(id);
        if (!song) {
          sendJSON(res, 404, { error: 'Lagu tidak ditemukan' });
          return;
        }
        await this.serveFile(req, res, song.path, { immutable: false });
        return;
      }

      if (url.pathname.startsWith('/art/')) {
        const name = decodeURIComponent(url.pathname.slice('/art/'.length));
        if (!/^[a-zA-Z0-9._-]{4,90}$/.test(name) || name.includes('..')) {
          sendJSON(res, 400, { error: 'Nama art tidak valid' });
          return;
        }
        const file = path.join(this.artDir, name);
        await this.serveFile(req, res, file, { immutable: true });
        return;
      }

      sendJSON(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error('[server]', err);
      if (!res.headersSent) sendJSON(res, 500, { error: 'Internal error' });
      else res.end();
    }
  }

  async proxyStream(req, res, videoId, refreshed) {
    if (!this.streamResolver) {
      sendJSON(res, 503, { error: 'Streaming YouTube Music tidak tersedia' });
      return;
    }

    let remoteUrl;
    try {
      remoteUrl = await this.streamResolver(videoId, { force: refreshed });
    } catch (err) {
      console.error('[server] stream resolve gagal:', err?.message || err);
      sendJSON(res, 502, { error: err?.message || 'Gagal menyiapkan stream' });
      return;
    }

    let total = 0;
    try {
      total = Number(new URL(remoteUrl).searchParams.get('clen')) || 0;
    } catch {}

    const headers = {
      'user-agent': UPSTREAM_UA,
      accept: '*/*',
      'accept-language': 'id-ID,id;q=0.9,en;q=0.8',
      range: boundedRange(req.headers.range, total),
    };
    const clientRequestedRange = !!req.headers.range;

    let upstream;
    try {
      upstream = await fetch(remoteUrl, { headers, redirect: 'follow' });
    } catch (err) {
      if (!refreshed) {
        await this.proxyStream(req, res, videoId, true);
        return;
      }
      console.error('[server] stream fetch gagal:', err?.message || err);
      sendJSON(res, 502, { error: 'Gagal menghubungi server YouTube' });
      return;
    }

    if ((upstream.status === 403 || upstream.status === 410 || upstream.status === 401) && !refreshed) {
      try {
        await upstream.body?.cancel();
      } catch {}
      await this.proxyStream(req, res, videoId, true);
      return;
    }

    if (!upstream.ok && upstream.status !== 206) {
      try {
        await upstream.body?.cancel();
      } catch {}
      sendJSON(res, upstream.status || 502, { error: 'Stream YouTube menolak permintaan' });
      return;
    }

    const passthrough = ['content-type', 'content-length', 'content-range', 'last-modified', 'etag'];
    let status = upstream.status === 206 ? 206 : 200;
    let contentRange = upstream.headers.get('content-range');
    for (const name of passthrough) {
      if (name === 'content-range') continue;
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    if (!clientRequestedRange && status === 206) {
      // Klien meminta seluruh file; sajikan sebagai 200 agar pemutar tidak bingung.
      status = 200;
      contentRange = null;
    }
    if (contentRange) res.setHeader('Content-Range', contentRange);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');

    res.writeHead(status);

    if (req.method === 'HEAD' || !upstream.body) {
      try {
        await upstream.body?.cancel();
      } catch {}
      res.end();
      return;
    }

    let closed = false;
    res.on('close', () => {
      closed = true;
      Promise.resolve(upstream.body?.cancel?.()).catch(() => {});
    });

    try {
      const stream = Readable.fromWeb(upstream.body);
      stream.on('error', () => {
        if (!closed) res.destroy();
      });
      stream.pipe(res);
    } catch (err) {
      console.error('[server] stream pipe gagal:', err?.message || err);
      if (!res.headersSent) sendJSON(res, 502, { error: 'Gagal mengalirkan stream' });
      else res.destroy();
    }
  }

  async serveFile(req, res, filePath, { immutable }) {
    let stat;
    try {
      stat = await fsp.stat(filePath);
      if (!stat.isFile()) throw new Error('not a file');
    } catch {
      sendJSON(res, 404, { error: 'File tidak ditemukan' });
      return;
    }

    const type = contentTypeFor(filePath);
    res.setHeader('Content-Type', type);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader(
      'Cache-Control',
      immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
    );
    res.setHeader('Last-Modified', stat.mtime.toUTCString());

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
      if (!match) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      let start = match[1] === '' ? null : Number(match[1]);
      let end = match[2] === '' ? null : Number(match[2]);
      if (start === null && end === null) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      if (start === null) {
        start = Math.max(0, stat.size - end);
        end = stat.size - 1;
      } else if (end === null || end >= stat.size) {
        end = stat.size - 1;
      }
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': end - start + 1,
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(filePath, { start, end })
        .on('error', () => res.destroy())
        .pipe(res);
      return;
    }

    res.writeHead(200, { 'Content-Length': stat.size });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath)
      .on('error', () => res.destroy())
      .pipe(res);
  }
}

module.exports = { MediaServer };
