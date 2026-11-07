'use strict';

const path = require('path');

function parseM3U(content, filename = 'Playlist.m3u') {
  const lines = String(content).replace(/^\uFEFF/, '').split(/\r?\n/);
  const baseDir = path.dirname(filename);
  const tracks = [];
  let pending = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const comma = line.indexOf(',');
      const info = comma >= 0 ? line.slice(comma + 1).trim() : '';
      const durationPart = comma >= 0 ? line.slice(8, comma) : '';
      const durationSec = Number(durationPart);
      let artist = '';
      let title = info;
      const split = info.split(/\s+-\s+/);
      if (split.length >= 2) {
        artist = split[0].trim();
        title = split.slice(1).join(' - ').trim();
      }
      pending = {
        title: title || 'Tanpa Judul',
        artists: artist ? [artist] : [],
        album: '',
        durationMs: Number.isFinite(durationSec) && durationSec > 0 ? Math.round(durationSec * 1000) : 0,
      };
      continue;
    }
    if (line.startsWith('#')) continue;
    if (/^https?:\/\//i.test(line)) {
      pending = null;
      continue;
    }
    let filePath = line;
    if (filePath.startsWith('file://')) {
      try {
        filePath = decodeURIComponent(new URL(filePath).pathname);
      } catch {}
    }
    if (!path.isAbsolute(filePath)) filePath = path.resolve(baseDir, filePath);
    const base = path.basename(filePath).replace(/\.[^.]+$/, '');
    tracks.push({
      title: pending?.title || base,
      artists: pending?.artists || [],
      album: pending?.album || '',
      durationMs: pending?.durationMs || 0,
      path: filePath,
      sourceId: '',
      sourceUrl: '',
      index: tracks.length,
    });
    pending = null;
  }

  return {
    name: path.basename(filename).replace(/\.m3u8?$/i, ''),
    description: `Diimpor dari file M3U (${tracks.length} lagu)`,
    coverUrl: null,
    source: 'm3u',
    sourceId: '',
    sourceUrl: '',
    tracks,
    warning: null,
  };
}

function toM3U(playlist, songs) {
  const lines = ['#EXTM3U', `#PLAYLIST:${playlist.name || 'Playlist'}`];
  for (const song of songs) {
    const duration = Math.round(song.duration || 0);
    const label = [song.artist, song.title].filter(Boolean).join(' - ');
    lines.push(`#EXTINF:${duration},${label}`);
    lines.push(song.path);
  }
  return lines.join('\n') + '\n';
}

module.exports = { parseM3U, toM3U };
