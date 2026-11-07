'use strict';

/**
 * Uji backend Metronux tanpa Electron.
 * Jalankan: npm run test:backend
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { Store, sanitizeTrack, uniqueTracks } = require('../electron/store');
const { parseLrc } = require('../electron/lyrics');
const { MediaServer } = require('../electron/server');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'metronux-test-'));

function report(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

async function reportAsync(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const track = (videoId, extra = {}) => ({
  id: `yt:${videoId}`,
  videoId,
  title: `Lagu ${videoId}`,
  artist: 'Artis Uji',
  duration: 210,
  art: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
  stream: true,
  source: 'youtube',
  ...extra,
});

(async () => {
  report('sanitizeTrack menormalkan id dan menolak entri tanpa id', () => {
    const fromVideoId = sanitizeTrack({ videoId: 'abc123', title: 'Uji' });
    assert.strictEqual(fromVideoId.id, 'yt:abc123');
    assert.strictEqual(fromVideoId.stream, true);
    assert.strictEqual(sanitizeTrack({ title: 'Tanpa id' }), null);
    assert.strictEqual(sanitizeTrack(null), null);
  });

  report('uniqueTracks membuang duplikat', () => {
    const result = uniqueTracks([track('a'), track('a'), track('b')]);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(
      result.map((item) => item.id),
      ['yt:a', 'yt:b']
    );
  });

  await reportAsync('Store memigrasikan data lama dan hanya menyimpan pengaturan', async () => {
    const dir = path.join(tmp, 'legacy');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'mentronux.json'),
      JSON.stringify({
        version: 1,
        settings: { themeMode: 'light', seedColor: '#123456' },
        library: { folders: ['/music'], songs: [{ id: 'local-1' }] },
        playlists: [{ id: 'pl_old', name: 'Lama', songIds: ['local-1'] }],
        favorites: ['local-1'],
        history: [{ id: 'local-1', at: 1 }],
      })
    );

    const store = new Store(dir);
    await store.init();
    assert.strictEqual(store.settings.themeMode, 'light');
    assert.strictEqual(store.settings.seedColor, '#123456');
    assert.deepStrictEqual(store.playlists, []);
    assert.deepStrictEqual(store.favorites, []);
    assert.deepStrictEqual(store.history, []);
    assert.ok(fs.existsSync(path.join(dir, 'metronux.json')));
  });

  await reportAsync('Store menyimpan playlist, favorit, dan riwayat berbasis track', async () => {
    const dir = path.join(tmp, 'fresh');
    const store = new Store(dir);
    await store.init();

    const playlist = store.createPlaylist({
      name: 'Malam',
      description: 'Uji',
      tracks: [track('a'), track('b'), track('a')],
    });
    assert.strictEqual(playlist.tracks.length, 2);
    assert.strictEqual(playlist.source, 'youtube');

    const updated = store.updatePlaylist(playlist.id, { tracks: [track('c')] });
    assert.deepStrictEqual(
      updated.tracks.map((item) => item.id),
      ['yt:c']
    );

    store.toggleFavorite(track('a'));
    assert.strictEqual(store.favorites.length, 1);
    store.toggleFavorite(track('a'));
    assert.strictEqual(store.favorites.length, 0);

    store.recordHistory(track('a'));
    store.recordHistory(track('b'));
    store.recordHistory(track('a'));
    assert.strictEqual(store.history.length, 2);
    assert.strictEqual(store.history[0].track.id, 'yt:a');

    await store.save();

    const reopened = new Store(dir);
    await reopened.init();
    assert.strictEqual(reopened.playlists.length, 1);
    assert.deepStrictEqual(
      reopened.playlists[0].tracks.map((item) => item.id),
      ['yt:c']
    );
    assert.strictEqual(reopened.history.length, 2);
  });

  report('parseLrc mengurutkan lirik tersinkron', () => {
    const lines = parseLrc('[00:12.50]Baris kedua\n[00:04.00]Baris pertama\n[00:20.00]');
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(lines[0].time, 4);
    assert.strictEqual(lines[1].text, 'Baris kedua');
  });

  await reportAsync('MediaServer menyajikan sampul dengan token', async () => {
    fs.writeFileSync(path.join(tmp, 'cover.jpg'), Buffer.from('art-bytes'));
    const server = new MediaServer({ artDir: tmp });
    const { port, token } = await server.start();
    try {
      const unauthorized = await fetch(`http://127.0.0.1:${port}/art/cover.jpg`);
      assert.strictEqual(unauthorized.status, 403);

      const ok = await fetch(`http://127.0.0.1:${port}/art/cover.jpg?t=${token}`);
      assert.strictEqual(ok.status, 200);
      assert.strictEqual(await ok.text(), 'art-bytes');

      const traversal = await fetch(`http://127.0.0.1:${port}/art/..%2Fsecret?t=${token}`);
      assert.ok(traversal.status >= 400);
    } finally {
      server.stop();
    }
  });

  await reportAsync('MediaServer mem-proxy stream YouTube dengan Range tertutup', async () => {
    const payload = Buffer.alloc(65536);
    for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;

    const upstream = http.createServer((req, res) => {
      const range = req.headers.range;
      // YouTube menolak permintaan tanpa Range tertutup.
      if (!range) {
        res.writeHead(403);
        res.end();
        return;
      }
      const match = /^bytes=(\d+)-(\d+)$/.exec(range);
      if (!match) {
        res.writeHead(403);
        res.end();
        return;
      }
      const start = Number(match[1]);
      const end = Math.min(Number(match[2]), payload.length - 1);
      res.writeHead(206, {
        'Content-Type': 'audio/mp4',
        'Content-Range': `bytes ${start}-${end}/${payload.length}`,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
      });
      res.end(payload.subarray(start, end + 1));
    });

    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const upstreamPort = upstream.address().port;
    const remoteUrl = `http://127.0.0.1:${upstreamPort}/videoplayback?clen=${payload.length}`;

    const server = new MediaServer({ artDir: tmp });
    const { port, token } = await server.start();
    server.setStreamResolver(async () => remoteUrl);

    try {
      const full = await fetch(`http://127.0.0.1:${port}/stream/video-1?t=${token}`);
      assert.strictEqual(full.status, 200);
      assert.strictEqual(full.headers.get('content-type'), 'audio/mp4');
      assert.strictEqual(full.headers.get('accept-ranges'), 'bytes');
      const fullBody = Buffer.from(await full.arrayBuffer());
      assert.strictEqual(fullBody.length, payload.length);
      assert.deepStrictEqual(fullBody, payload);

      const partial = await fetch(`http://127.0.0.1:${port}/stream/video-1?t=${token}`, {
        headers: { Range: 'bytes=100-199' },
      });
      assert.strictEqual(partial.status, 206);
      assert.strictEqual(partial.headers.get('content-range'), `bytes 100-199/${payload.length}`);
      assert.strictEqual((await partial.arrayBuffer()).byteLength, 100);

      const openEnded = await fetch(`http://127.0.0.1:${port}/stream/video-1?t=${token}`, {
        headers: { Range: 'bytes=65000-' },
      });
      assert.strictEqual(openEnded.status, 206);
      assert.strictEqual(
        openEnded.headers.get('content-range'),
        `bytes 65000-${payload.length - 1}/${payload.length}`
      );

      const unauthorized = await fetch(`http://127.0.0.1:${port}/stream/video-1`);
      assert.strictEqual(unauthorized.status, 403);
    } finally {
      server.stop();
      upstream.close();
    }
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nSemua uji backend lulus.');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
