'use strict';

/**
 * Jembatan ke YouTube Music memakai InnerTube (youtubei.js).
 * Hanya metadata pencarian dan URL stream audio yang diambil; tidak ada unduhan.
 */

const SEARCH_TTL_MS = 5 * 60 * 1000;
const STREAM_TTL_MS = 20 * 60 * 1000;
const HOME_TTL_MS = 10 * 60 * 1000;

let ytModulePromise = null;
let clientPromise = null;

const searchCache = new Map();
const streamCache = new Map();
const homeCache = new Map();

function pruneCache(cache, max = 80) {
  while (cache.size > max) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

async function getYtModule() {
  if (!ytModulePromise) {
    ytModulePromise = import('youtubei.js').then((mod) => {
      // youtubei.js membutuhkan interpreter untuk men-decipher URL stream.
      mod.Platform.shim.eval = async (data) => new Function(data.output)();
      return mod;
    });
  }
  return ytModulePromise;
}

function deviceTimezone() {
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    }
  } catch {
    // Runtime tanpa ICU (nodejs-mobile di Android) tidak punya Intl.
  }
  return 'UTC';
}

function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { Innertube } = await getYtModule();
      return Innertube.create({
        lang: 'id',
        location: 'ID',
        timezone: deviceTimezone(),
        retrieve_player: true,
      });
    })().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

function textOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toString === 'function') {
    const result = value.toString();
    if (result && result !== '[object Object]') return result;
  }
  return value.text || '';
}

function parseClock(value) {
  const text = String(value || '').trim();
  const hms = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(text);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  const ms = /^(\d{1,3})[.:](\d{2})$/.exec(text);
  if (ms) return Number(ms[1]) * 60 + Number(ms[2]);
  return 0;
}

function parseDuration(item) {
  const direct = item?.duration;
  if (typeof direct === 'number' && direct > 0) return direct;
  if (direct?.seconds) return Number(direct.seconds);
  if (direct?.text) {
    const parsed = parseClock(textOf(direct));
    if (parsed) return parsed;
  }
  for (const column of item?.flex_columns || []) {
    const text = textOf(column?.title);
    for (const part of text.split('•')) {
      const parsed = parseClock(part.trim());
      if (parsed) return parsed;
    }
  }
  return 0;
}

function parseArtist(item) {
  const names = [
    ...(item?.artists || []).map((artist) => artist?.name),
    ...(item?.authors || []).map((author) => author?.name),
    item?.author?.name,
  ].filter(Boolean);
  if (names.length) return names.join(', ');
  const subtitle = textOf(item?.flex_columns?.[1]?.title);
  const first = subtitle.split('•')[0];
  return first ? first.trim() : '';
}

function parseAlbum(item) {
  if (item?.album?.name) return item.album.name;
  return '';
}

function parseArt(item) {
  const source = item?.thumbnails ?? item?.thumbnail;
  const thumbs = Array.isArray(source)
    ? source
    : Array.isArray(source?.contents)
    ? source.contents
    : Array.isArray(source?.thumbnails)
    ? source.thumbnails
    : [];
  if (!thumbs.length) return '';
  const best = thumbs.reduce((acc, thumb) => {
    const size = (thumb?.width || 0) * (thumb?.height || 0);
    return size > (acc?.width || 0) * (acc?.height || 0) ? thumb : acc;
  }, null);
  return best?.url || thumbs[0]?.url || '';
}

function normalizeItem(item, fallbackType) {
  if (!item?.id) return null;
  const videoId = item.id;
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null;
  const title = textOf(item.title).trim();
  if (!title) return null;
  const type = item.item_type || fallbackType;
  if (type !== 'song' && type !== 'video') return null;
  return {
    id: `yt:${videoId}`,
    videoId,
    title,
    artist: parseArtist(item),
    album: parseAlbum(item),
    duration: parseDuration(item),
    art: parseArt(item),
    stream: true,
    source: 'youtube',
    sourceLabel: 'YouTube Music',
    type,
    url: `https://music.youtube.com/watch?v=${videoId}`,
  };
}

async function searchYoutubeMusic(query, type = 'song') {
  const q = String(query || '').trim();
  if (!q) return [];
  const searchType = type === 'video' ? 'video' : 'song';
  const cacheKey = `${searchType}:${q.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_TTL_MS) return cached.items;

  const yt = await getClient();
  const result = await yt.music.search(q, { type: searchType });
  const shelf =
    (result.contents || []).find((node) => node?.type === 'MusicShelf') ||
    result.songs ||
    result.videos ||
    (result.contents || []).find((node) => Array.isArray(node?.contents));
  const items = (shelf?.contents || [])
    .map((item) => normalizeItem(item, searchType))
    .filter(Boolean);

  searchCache.set(cacheKey, { at: Date.now(), items });
  pruneCache(searchCache);
  return items;
}

async function getYoutubeStreamUrl(videoId, { force = false } = {}) {
  const id = String(videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) throw new Error('ID video tidak valid');

  const cached = streamCache.get(id);
  if (!force && cached && cached.expiresAt - Date.now() > 60 * 1000) {
    return cached.url;
  }

  const yt = await getClient();

  // Klien VISIONOS mengembalikan URL yang menerima Range penuh dan mid-file.
  // Klien WEB_REMIX (music.getInfo) kini dibatasi ~1 MiB sehingga seek gagal.
  let info = null;
  let lastError = null;
  for (const client of ['VISIONOS', 'MWEB', 'TV_SIMPLY']) {
    try {
      info = await yt.getInfo(id, { client });
      break;
    } catch (err) {
      lastError = err;
      info = null;
    }
  }
  if (!info) {
    try {
      info = await yt.music.getInfo(id);
    } catch (err) {
      throw lastError || err;
    }
  }

  const status = info?.playability_status?.status;
  if (status && status !== 'OK') {
    const reason = info?.playability_status?.reason || status;
    throw new Error(`Lagu tidak dapat diputar: ${reason}`);
  }

  const format = info.chooseFormat({ type: 'audio', quality: 'best' });
  if (!format) throw new Error('Format audio tidak tersedia untuk lagu ini');

  let url = format.url;
  if (!url) url = await format.decipher(yt.session.player);
  if (!url) throw new Error('Gagal mendapatkan URL stream');

  let expiresAt = Date.now() + STREAM_TTL_MS;
  try {
    const parsed = new URL(url);
    const expire = Number(parsed.searchParams.get('expire'));
    if (Number.isFinite(expire) && expire > 0) expiresAt = expire * 1000;
  } catch {}

  streamCache.set(id, { url, expiresAt, size: Number(format.content_length) || 0 });
  pruneCache(streamCache);
  return url;
}

const FALLBACK_SHELVES = [
  { title: 'Pilihan untukmu', query: 'lagu populer indonesia' },
  { title: 'Santai dan fokus', query: 'lofi indonesia' },
  { title: 'Nostalgia', query: 'lagu indonesia 2000an' },
  { title: 'Energi baru', query: 'lagu pop terbaru' },
];

async function buildFallbackHome() {
  const results = await Promise.all(
    FALLBACK_SHELVES.map(async (shelf) => {
      try {
        const items = await searchYoutubeMusic(shelf.query, 'song');
        return { title: shelf.title, items: items.slice(0, 12) };
      } catch {
        return null;
      }
    })
  );
  return results.filter((shelf) => shelf && shelf.items.length >= 2);
}

async function getYoutubeHome() {
  const cached = homeCache.get('home');
  if (cached && Date.now() - cached.at < HOME_TTL_MS) return cached.sections;

  let sections = [];
  try {
    const yt = await getClient();
    const home = await yt.music.getHomeFeed();
    for (const shelf of home.sections || []) {
      if (shelf?.type !== 'MusicCarouselShelf') continue;
      const title = textOf(shelf.header?.title).trim();
      const items = (shelf.contents || [])
        .filter((item) => item?.type === 'MusicResponsiveListItem')
        .map((item) => normalizeItem(item, item.item_type))
        .filter(Boolean)
        .slice(0, 16);
      if (title && items.length >= 2) sections.push({ title, items });
      if (sections.length >= 8) break;
    }
  } catch (err) {
    console.error('[ytmusic] home feed gagal:', err?.message || err);
    sections = [];
  }

  if (!sections.length) sections = await buildFallbackHome();

  homeCache.set('home', { at: Date.now(), sections });
  return sections;
}

module.exports = {
  searchYoutubeMusic,
  getYoutubeHome,
  getYoutubeStreamUrl,
};
