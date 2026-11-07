'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SETTINGS = {
  themeStyle: 'material', // material | glass
  themeMode: 'dark', // dark | light | system
  seedMode: 'system', // system | custom | art
  seedColor: '#6750A4',
  lyricsEnabled: true,
  equalizer: {
    enabled: false,
    preset: 'flat',
    gains: [0, 0, 0, 0, 0],
  },
  volume: 0.85,
  reduceMotion: false,
  sidebarCompact: false,
  showLyricsOnNowPlaying: true,
};

const DEFAULT_DATA = {
  version: 2,
  settings: { ...DEFAULT_SETTINGS },
  playlists: [],
  favorites: [],
  history: [],
};

function uid(prefix = '') {
  return prefix + crypto.randomBytes(9).toString('hex');
}

function deepMerge(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) return patch === undefined ? base : patch;
  if (typeof base !== 'object' || base === null) return patch === undefined ? base : patch;
  if (typeof patch !== 'object' || patch === null) return base;
  const out = { ...base };
  for (const key of Object.keys(patch)) {
    out[key] = deepMerge(base[key], patch[key]);
  }
  return out;
}

function trackKey(track) {
  if (!track || typeof track !== 'object') return null;
  if (typeof track.id === 'string' && track.id.trim()) return track.id.trim();
  if (typeof track.videoId === 'string' && track.videoId.trim()) return `yt:${track.videoId.trim()}`;
  return null;
}

function sanitizeTrack(track) {
  const key = trackKey(track);
  if (!key) return null;
  return {
    ...track,
    id: key,
    stream: true,
    source: track.source || 'youtube',
  };
}

function uniqueTracks(tracks) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(tracks) ? tracks : []) {
    const track = sanitizeTrack(item);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    result.push(track);
  }
  return result;
}

function normalizePlaylists(playlists) {
  if (!Array.isArray(playlists)) return [];
  return playlists
    .map((playlist) => {
      if (!playlist || typeof playlist !== 'object' || !playlist.id) return null;
      return {
        ...playlist,
        tracks: uniqueTracks(playlist.tracks),
        source: playlist.source || 'youtube',
        coverUrl: playlist.coverUrl || null,
      };
    })
    .filter(Boolean);
}

function normalizeFavorites(favorites) {
  return uniqueTracks(favorites);
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of history) {
    const track = sanitizeTrack(entry?.track || entry);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    out.push({ track, at: Number(entry?.at) || Date.now() });
  }
  return out.slice(0, 60);
}

class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'metronux.json');
    this.legacyFile = path.join(dataDir, 'mentronux.json');
    this.data = null;
    this._saveChain = Promise.resolve();
    this._saveTimer = null;
  }

  async init() {
    await fsp.mkdir(this.dataDir, { recursive: true });
    let loaded = null;
    for (const file of [this.file, this.legacyFile]) {
      try {
        const raw = await fsp.readFile(file, 'utf8');
        loaded = JSON.parse(raw);
        break;
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error(`[store] Gagal membaca ${path.basename(file)}, memakai data baru:`, err.message);
          try {
            await fsp.copyFile(file, `${file}.corrupt-${Date.now()}`);
          } catch {}
        }
      }
    }

    const legacyShape = loaded && (loaded.version !== 2 || loaded.library);
    this.data = {
      ...DEFAULT_DATA,
      settings: deepMerge(DEFAULT_SETTINGS, loaded?.settings || {}),
      playlists: legacyShape ? [] : normalizePlaylists(loaded?.playlists),
      favorites: legacyShape ? [] : normalizeFavorites(loaded?.favorites),
      history: legacyShape ? [] : normalizeHistory(loaded?.history),
    };

    if (!loaded || legacyShape) await this.save();
    return this.data;
  }

  get settings() {
    return this.data.settings;
  }

  get playlists() {
    return this.data.playlists;
  }

  get favorites() {
    return this.data.favorites;
  }

  get history() {
    return this.data.history;
  }

  setSettings(patch) {
    this.data.settings = deepMerge(this.data.settings, patch || {});
    this.scheduleSave();
    return this.data.settings;
  }

  createPlaylist({ name, description = '', tracks = [], source = 'youtube', coverUrl = null }) {
    const now = new Date().toISOString();
    const playlist = {
      id: uid('pl_'),
      name: (name || 'Playlist Baru').trim() || 'Playlist Baru',
      description: description || '',
      tracks: uniqueTracks(tracks),
      source,
      coverUrl: coverUrl || null,
      createdAt: now,
      updatedAt: now,
    };
    this.data.playlists.unshift(playlist);
    this.scheduleSave();
    return playlist;
  }

  updatePlaylist(id, patch = {}) {
    const playlist = this.data.playlists.find((p) => p.id === id);
    if (!playlist) throw new Error('Playlist tidak ditemukan');
    const allowed = ['name', 'description', 'tracks', 'coverUrl'];
    for (const key of allowed) {
      if (!(key in patch)) continue;
      if (key === 'tracks') playlist.tracks = uniqueTracks(patch.tracks);
      else playlist[key] = patch[key];
    }
    playlist.updatedAt = new Date().toISOString();
    this.scheduleSave();
    return playlist;
  }

  deletePlaylist(id) {
    const before = this.data.playlists.length;
    this.data.playlists = this.data.playlists.filter((p) => p.id !== id);
    this.scheduleSave();
    return before !== this.data.playlists.length;
  }

  toggleFavorite(input) {
    const track = sanitizeTrack(input);
    if (!track) return this.data.favorites;
    const index = this.data.favorites.findIndex((item) => item.id === track.id);
    if (index >= 0) this.data.favorites.splice(index, 1);
    else this.data.favorites.unshift(track);
    this.scheduleSave();
    return this.data.favorites;
  }

  recordHistory(input) {
    const track = sanitizeTrack(input);
    if (!track) return this.data.history;
    this.data.history = [
      { track, at: Date.now() },
      ...this.data.history.filter((entry) => entry.track?.id !== track.id),
    ].slice(0, 60);
    this.scheduleSave();
    return this.data.history;
  }

  scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.save().catch((err) => console.error('[store] Gagal menyimpan:', err.message));
    }, 250);
  }

  async save() {
    const payload = JSON.stringify(this.data, null, 2);
    this._saveChain = this._saveChain.then(async () => {
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, payload, 'utf8');
      await fsp.rename(tmp, this.file);
    });
    return this._saveChain;
  }

  saveSync() {
    if (!this.data) return;
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    try {
      const tmp = `${this.file}.${process.pid}.sync.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] Gagal menyimpan sinkron:', err.message);
    }
  }
}

module.exports = {
  Store,
  DEFAULT_SETTINGS,
  DEFAULT_DATA,
  uid,
  deepMerge,
  sanitizeTrack,
  uniqueTracks,
};