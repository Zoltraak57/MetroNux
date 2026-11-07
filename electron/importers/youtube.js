'use strict';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const YT_ORIGIN = 'https://music.youtube.com';

let configCache = null;
let configCachedAt = 0;

function parsePlaylistId(input) {
  if (!input) return null;
  const value = String(input).trim();
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    const list = url.searchParams.get('list');
    if (list) return list;
    if (/^[A-Za-z0-9_-]{10,}$/.test(url.pathname.replace(/^\//, ''))) {
      return url.pathname.replace(/^\//, '');
    }
  } catch {}
  if (/^(VL)?[A-Za-z0-9_-]{10,}$/.test(value)) return value.replace(/^VL/, '');
  return null;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': UA,
      'accept-language': 'en-US,en;q=0.9,id;q=0.8',
      accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`YouTube Music membalas HTTP ${res.status}`);
  return res.text();
}

async function getConfig() {
  if (configCache && Date.now() - configCachedAt < 30 * 60 * 1000) return configCache;
  const html = await fetchText(`${YT_ORIGIN}/?hl=en&gl=US`);
  const key = /"INNERTUBE_API_KEY":"([^"]+)"/.exec(html)?.[1];
  const clientVersion = /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(html)?.[1];
  const visitorData = /"VISITOR_DATA":"([^"]+)"/.exec(html)?.[1];
  if (!key) throw new Error('Tidak dapat terhubung ke YouTube Music.');
  configCache = { key, clientVersion: clientVersion || '1.20250101.00.00', visitorData };
  configCachedAt = Date.now();
  return configCache;
}

function buildContext(config) {
  return {
    client: {
      clientName: 'WEB_REMIX',
      clientVersion: config.clientVersion,
      hl: 'en',
      gl: 'US',
      ...(config.visitorData ? { visitorData: config.visitorData } : {}),
    },
    user: { lockedSafetyMode: false },
    request: { useSsl: true },
  };
}

async function innerTube(endpoint, body, config) {
  const res = await fetch(`${YT_ORIGIN}/youtubei/v1/${endpoint}?key=${config.key}&prettyPrint=false`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': UA,
      'accept-language': 'en-US,en;q=0.9',
      origin: YT_ORIGIN,
      referer: `${YT_ORIGIN}/`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`YouTube Music API membalas HTTP ${res.status}`);
  return res.json();
}

function findAll(object, key) {
  const out = [];
  const stack = [object];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (const value of node) stack.push(value);
      continue;
    }
    for (const [k, value] of Object.entries(node)) {
      if (k === key) out.push(value);
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return out;
}

function firstFound(object, keys) {
  for (const key of keys) {
    const found = findAll(object, key)[0];
    if (found) return found;
  }
  return null;
}

function textOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value.simpleText) return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((r) => r.text || '').join('');
  return '';
}

function parseDuration(text) {
  if (!text) return 0;
  const parts = String(text).trim().split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 0;
}

function splitArtists(text) {
  if (!text) return [];
  return String(text)
    .split(/\s*,\s*|\s+&\s+|\s+feat\.\s+|\s+ft\.\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function itemToTrack(item, index, playlistId) {
  const flex = (item.flexColumns || []).map((col) =>
    textOf(col?.musicResponsiveListItemFlexColumnRenderer?.text)
  );
  const fixed = (item.fixedColumns || [])
    .map((col) => textOf(col?.musicResponsiveListItemFixedColumnRenderer?.text))
    .join(' ');
  const title = (flex[0] || '').replace(/\.\.\.$/, '').trim();
  if (!title) return null;
  const durationText = fixed || (flex.find((t) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) || '');
  let videoId = '';
  const overlays = item.overlay?.musicItemThumbnailOverlayRenderer;
  videoId =
    overlays?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId || '';
  if (!videoId) {
    const runs = item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
    videoId = runs.find((r) => r.navigationEndpoint?.watchEndpoint?.videoId)?.navigationEndpoint
      ?.watchEndpoint?.videoId || '';
  }
  return {
    title,
    artists: splitArtists(flex[1]),
    album: flex[2] || '',
    durationMs: parseDuration(durationText),
    sourceId: videoId,
    sourceUrl: videoId
      ? `${YT_ORIGIN}/watch?v=${videoId}${playlistId ? `&list=${playlistId}` : ''}`
      : '',
    index,
  };
}

function extractHeader(json) {
  const header = firstFound(json, [
    'musicResponsiveHeaderRenderer',
    'musicEditablePlaylistDetailHeaderRenderer',
    'musicDetailHeaderRenderer',
    'musicImmersiveHeaderRenderer',
  ]);
  const title = header ? textOf(header.title) : '';
  const subtitle = header ? textOf(header.subtitle) : '';
  const description =
    textOf(firstFound(json, ['musicDescriptionShelfRenderer'])?.description) ||
    (header ? textOf(header.description) : '');
  let coverUrl = null;
  if (header) {
    const thumbs = [
      ...findAll(header, 'thumbnails').flat(),
    ];
    if (thumbs.length) {
      const sorted = thumbs
        .filter((t) => t && t.url)
        .sort((a, b) => (b.width || 0) - (a.width || 0));
      coverUrl = sorted[0]?.url || null;
    }
  }
  return { title, subtitle, description, coverUrl };
}

function extractContinuation(json) {
  const items = findAll(json, 'continuationItemRenderer');
  for (const item of items) {
    const token =
      item?.continuationEndpoint?.continuationCommand?.token ||
      item?.button?.buttonRenderer?.command?.continuationCommand?.token;
    if (token) return token;
  }
  return null;
}

async function importYoutubeMusic(input) {
  const playlistId = parsePlaylistId(input);
  if (!playlistId) {
    throw new Error(
      'Link playlist YouTube Music tidak valid. Contoh: https://music.youtube.com/playlist?list=…'
    );
  }
  const config = await getConfig();
  const context = buildContext(config);
  let json = await innerTube(
    'browse',
    { context, browseId: `VL${playlistId}` },
    config
  );

  let header = extractHeader(json);
  const rawItems = findAll(json, 'musicResponsiveListItemRenderer');
  let tracks = rawItems
    .map((item, i) => itemToTrack(item, i, playlistId))
    .filter(Boolean);

  let continuation = extractContinuation(json);
  let pages = 0;
  while (continuation && pages < 30) {
    const nextJson = await innerTube('browse', { context, continuation }, config);
    const nextItems = findAll(nextJson, 'musicResponsiveListItemRenderer');
    const nextTracks = nextItems
      .map((item, i) => itemToTrack(item, tracks.length + i, playlistId))
      .filter(Boolean);
    // Hindari duplikat jika API mengulang item di halaman terakhir.
    const seen = new Set(tracks.map((t) => `${t.title}|${t.sourceId}`));
    for (const track of nextTracks) {
      const key = `${track.title}|${track.sourceId}`;
      if (!seen.has(key)) {
        tracks.push({ ...track, index: tracks.length });
        seen.add(key);
      }
    }
    if (!header.title) header = extractHeader(nextJson);
    continuation = extractContinuation(nextJson);
    pages += 1;
  }

  // Buang item header/saran yang tidak punya judul atau durasi (mis. "Lagu berikutnya").
  tracks = tracks.filter((t) => t.title && t.sourceId);

  if (!header.title && !tracks.length) {
    throw new Error('Playlist tidak dapat diakses. Pastikan playlist bersifat publik.');
  }

  return {
    name: header.title || 'Playlist YouTube Music',
    description: header.description || header.subtitle || '',
    coverUrl: header.coverUrl,
    source: 'youtube',
    sourceId: playlistId,
    sourceUrl: `${YT_ORIGIN}/playlist?list=${playlistId}`,
    tracks,
    warning: !tracks.length ? 'Tidak ada lagu yang bisa dibaca dari playlist ini.' : null,
  };
}

module.exports = { importYoutubeMusic, parsePlaylistId };
