'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.m4a',
  '.m4b',
  '.aac',
  '.ogg',
  '.oga',
  '.opus',
  '.wav',
  '.weba',
]);

const COVER_NAMES = [
  'cover.jpg',
  'cover.jpeg',
  'cover.png',
  'cover.webp',
  'folder.jpg',
  'folder.jpeg',
  'folder.png',
  'front.jpg',
  'front.jpeg',
  'front.png',
  'album.jpg',
  'album.jpeg',
  'album.png',
  'artwork.jpg',
  'artwork.png',
];

const SKIP_DIRS = new Set([
  '.git',
  '.svn',
  'node_modules',
  '@eadir',
  '.trash',
  '.trash-1000',
  'lost+found',
]);

let mmPromise = null;
function loadMusicMetadata() {
  if (!mmPromise) mmPromise = import('music-metadata');
  return mmPromise;
}

function sha1(value, length = 24) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, length);
}

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
}

function prettifyFilename(filename) {
  let base = filename.replace(/\.[^.]+$/, '');
  base = base.replace(/^\s*\d{1,3}\s*[-._)\]]\s*/, '');
  base = base.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^[a-z0-9]+$/i.test(base) && base.length > 24) return base;
  return base || 'Tanpa Judul';
}

function guessFromFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const cleanedBase = base.replace(/^\s*\d{1,3}\s*[-._)\]]\s*/, '');
  const parts = cleanedBase.split(/\s+-\s+/);
  if (parts.length >= 2 && parts[0].length <= 45 && parts[1].length > 0) {
    return {
      artist: parts[0].replace(/_/g, ' ').trim(),
      title: parts.slice(1).join(' - ').replace(/_/g, ' ').trim(),
    };
  }
  return { artist: '', title: prettifyFilename(filename) };
}

function mimeExtension(mime) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
  };
  return map[(mime || '').toLowerCase()] || 'jpg';
}

class LibraryScanner {
  constructor({ dataDir, artDir, cacheFile }) {
    this.dataDir = dataDir;
    this.artDir = artDir;
    this.cacheFile = cacheFile;
    this.cache = { version: 2, entries: {} };
    this.cacheLoaded = false;
    this.running = false;
    this.folderCoverCache = new Map();
  }

  async loadCache() {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;
    try {
      const raw = await fsp.readFile(this.cacheFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 2 && parsed.entries) this.cache = parsed;
    } catch {}
  }

  async saveCache() {
    try {
      await fsp.mkdir(path.dirname(this.cacheFile), { recursive: true });
      const tmp = `${this.cacheFile}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(this.cache));
      await fsp.rename(tmp, this.cacheFile);
    } catch (err) {
      console.error('[scanner] Gagal menyimpan cache metadata:', err.message);
    }
  }

  async walk(dir, files, visited, onProgress) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name.toLowerCase())) continue;
        if (visited.has(full)) continue;
        visited.add(full);
        await this.walk(full, files, visited, onProgress);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext)) {
          files.push(full);
          if (files.length % 40 === 0) onProgress?.({ phase: 'walking', found: files.length });
        }
      }
    }
  }

  async findFolderCover(dir) {
    if (this.folderCoverCache.has(dir)) return this.folderCoverCache.get(dir);
    const promise = (async () => {
      try {
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        const byLower = new Map();
        for (const entry of entries) {
          if (entry.isFile()) byLower.set(entry.name.toLowerCase(), entry.name);
        }
        for (const name of COVER_NAMES) {
          const actual = byLower.get(name);
          if (!actual) continue;
          const full = path.join(dir, actual);
          const ext = path.extname(actual).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
          const stat = await fsp.stat(full);
          const hash = sha1(`${full}:${stat.size}:${stat.mtimeMs}`);
          const filename = `${hash}.${mimeExtension(mime)}`;
          const dest = path.join(this.artDir, filename);
          try {
            await fsp.access(dest);
          } catch {
            await fsp.mkdir(this.artDir, { recursive: true });
            await fsp.copyFile(full, dest);
          }
          return filename;
        }
      } catch {}
      return null;
    })();
    this.folderCoverCache.set(dir, promise);
    return promise;
  }

  async saveEmbeddedArt(picture) {
    if (!picture || !picture.data) return null;
    try {
      const buffer = Buffer.isBuffer(picture.data) ? picture.data : Buffer.from(picture.data);
      if (!buffer.length) return null;
      const ext = mimeExtension(picture.format);
      const filename = `${sha1(buffer)}.${ext}`;
      const dest = path.join(this.artDir, filename);
      try {
        await fsp.access(dest);
      } catch {
        await fsp.mkdir(this.artDir, { recursive: true });
        await fsp.writeFile(dest, buffer);
      }
      return filename;
    } catch {
      return null;
    }
  }

  async scanFile(file, previous, onFile) {
    const ext = path.extname(file).toLowerCase();
    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      onFile?.();
      return null;
    }

    const cached = this.cache.entries[file];
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size && cached.song) {
      const song = {
        ...cached.song,
        addedAt: previous?.addedAt || cached.song.addedAt || new Date().toISOString(),
      };
      onFile?.(song);
      return song;
    }

    const fallback = guessFromFilename(path.basename(file));
    const parsed = {
      title: fallback.title,
      artist: fallback.artist || 'Artis tidak dikenal',
      artists: fallback.artist ? [fallback.artist] : [],
      album: path.basename(path.dirname(file)) || 'Album tidak dikenal',
      albumArtist: fallback.artist || 'Artis tidak dikenal',
      year: null,
      trackNo: null,
      discNo: null,
      genre: [],
      duration: 0,
      bitrate: null,
      sampleRate: null,
      codec: ext.replace('.', '').toUpperCase(),
      container: ext.replace('.', ''),
      art: null,
      hasEmbeddedArt: false,
    };

    let embeddedArt = null;
    try {
      const { parseFile } = await loadMusicMetadata();
      const meta = await parseFile(file, { duration: true, skipCovers: false });
      const common = meta.common || {};
      const format = meta.format || {};
      const artists = Array.isArray(common.artists) && common.artists.length
        ? common.artists.map(cleanText).filter(Boolean)
        : [];
      const artistName = cleanText(common.artist) || artists.join(', ');
      const albumArtist = cleanText(common.albumartist) || artistName;
      parsed.title = cleanText(common.title) || fallback.title;
      parsed.artist = artistName || fallback.artist || 'Artis tidak dikenal';
      parsed.artists = artists.length ? artists : parsed.artist ? [parsed.artist] : [];
      parsed.album = cleanText(common.album) || parsed.album;
      parsed.albumArtist = albumArtist || parsed.artist;
      parsed.year = common.year || null;
      parsed.trackNo = common.track?.no || null;
      parsed.discNo = common.disk?.no || null;
      parsed.genre = Array.isArray(common.genre) ? common.genre.filter(Boolean) : [];
      parsed.duration = Number(format.duration) || 0;
      parsed.bitrate = format.bitrate || null;
      parsed.sampleRate = format.sampleRate || null;
      parsed.codec = format.codec || parsed.codec;
      parsed.container = format.container || parsed.container;
      if (Array.isArray(common.picture) && common.picture.length) {
        embeddedArt = await this.saveEmbeddedArt(common.picture[0]);
      }
    } catch (err) {
      // File tetap dimasukkan dengan metadata dari nama file agar bisa diputar.
      console.warn('[scanner] Metadata gagal dibaca:', file, err.message);
    }

    if (embeddedArt) {
      parsed.art = embeddedArt;
      parsed.hasEmbeddedArt = true;
    } else {
      parsed.art = await this.findFolderCover(path.dirname(file));
    }

    const song = {
      id: sha1(file, 20),
      path: file,
      ...parsed,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      addedAt: previous?.addedAt || new Date().toISOString(),
    };

    this.cache.entries[file] = { mtimeMs: stat.mtimeMs, size: stat.size, song };
    onFile?.(song);
    return song;
  }

  async scan({ folders, previousSongs = [], onProgress }) {
    if (this.running) throw new Error('Pemindaian sedang berjalan');
    this.running = true;
    try {
      await this.loadCache();
      const files = [];
      const visited = new Set();
      for (const folder of folders) {
        try {
          const stat = await fsp.stat(folder);
          if (!stat.isDirectory()) continue;
        } catch {
          continue;
        }
        visited.add(folder);
        await this.walk(folder, files, visited, onProgress);
      }

      const uniqueFiles = [...new Set(files)];
      onProgress?.({ phase: 'scanning', current: 0, total: uniqueFiles.length });

      const previousById = new Map(previousSongs.map((s) => [s.id, s]));
      const songs = new Array(uniqueFiles.length);
      let done = 0;
      let cursor = 0;
      const concurrency = 4;

      const worker = async () => {
        while (true) {
          const index = cursor++;
          if (index >= uniqueFiles.length) break;
          const file = uniqueFiles[index];
          const id = sha1(file, 20);
          const song = await this.scanFile(file, previousById.get(id), () => {
            done += 1;
          });
          songs[index] = song;
          onProgress?.({
            phase: 'scanning',
            current: done,
            total: uniqueFiles.length,
            file: path.basename(file),
            title: song?.title,
          });
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, uniqueFiles.length)) }, worker));

      const validPaths = new Set(uniqueFiles);
      for (const key of Object.keys(this.cache.entries)) {
        if (!validPaths.has(key)) delete this.cache.entries[key];
      }
      await this.saveCache();

      const result = songs.filter(Boolean).sort((a, b) => a.path.localeCompare(b.path));
      onProgress?.({ phase: 'done', current: result.length, total: uniqueFiles.length });
      return result;
    } finally {
      this.running = false;
    }
  }
}

module.exports = { LibraryScanner, AUDIO_EXTENSIONS, sha1, cleanText, prettifyFilename };
