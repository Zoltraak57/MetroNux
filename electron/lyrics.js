'use strict';

const UA = 'Metronux/1.0 (Linux music player; streaming)';

const cache = new Map();
const MAX_CACHE = 120;

function parseLrc(lrc) {
  if (!lrc) return [];
  const lines = [];
  for (const raw of String(lrc).split(/\r?\n/)) {
    const matches = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!matches.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (!text) continue;
    for (const m of matches) {
      const centis = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) / 1000 : 0;
      const time = Number(m[1]) * 60 + Number(m[2]) + centis;
      lines.push({ time: Math.round(time * 1000) / 1000, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

async function requestJson(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB HTTP ${res.status}`);
  return res.json();
}

async function findLyrics({ title, artist, album, duration }) {
  if (!title) return null;
  const key = [title, artist, album, Math.round(duration || 0)].join('|').toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const result = (async () => {
    const params = new URLSearchParams({ track_name: title });
    if (artist) params.set('artist_name', artist);
    if (album) params.set('album_name', album);
    if (duration) params.set('duration', String(Math.round(duration)));

    try {
      const data = await requestJson(`https://lrclib.net/api/get?${params.toString()}`);
      if (data && (data.syncedLyrics || data.plainLyrics)) {
        return {
          synced: parseLrc(data.syncedLyrics),
          plain: data.plainLyrics || '',
          instrumental: !!data.instrumental,
          source: 'LRCLIB',
        };
      }
    } catch {}

    try {
      const searchParams = new URLSearchParams();
      if (artist) searchParams.set('artist_name', artist);
      searchParams.set('track_name', title);
      const results = await requestJson(`https://lrclib.net/api/search?${searchParams.toString()}`);
      const list = Array.isArray(results?.data)
        ? results.data
        : Array.isArray(results)
        ? results
        : results
        ? [results]
        : [];
      const best =
        list.find((r) => r.syncedLyrics) ||
        list.find((r) => r.plainLyrics) ||
        list[0];
      if (best && (best.syncedLyrics || best.plainLyrics)) {
        return {
          synced: parseLrc(best.syncedLyrics),
          plain: best.plainLyrics || '',
          instrumental: !!best.instrumental,
          source: 'LRCLIB',
        };
      }
    } catch {}

    return null;
  })();

  cache.set(key, result);
  if (cache.size > MAX_CACHE) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
  return result;
}

module.exports = { findLyrics, parseLrc };
