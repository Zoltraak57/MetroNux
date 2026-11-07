'use strict';

const path = require('path');

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function parseSpotifyPlaylistId(input) {
  if (!input) return null;
  const value = String(input).trim();
  const uri = /^spotify:playlist:([A-Za-z0-9]+)$/.exec(value);
  if (uri) return uri[1];
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('playlist');
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1].split('?')[0];
  } catch {}
  if (/^[A-Za-z0-9]{16,32}$/.test(value)) return value;
  return null;
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      'user-agent': UA,
      'accept-language': 'en-US,en;q=0.9,id;q=0.8',
      accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      ...headers,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const err = new Error(`Spotify membalas HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.text();
}

function extractNextData(html) {
  const match = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function normalizeTrack(track, index) {
  return {
    title: track.title || track.name || 'Tanpa Judul',
    artists: track.artists && track.artists.length
      ? track.artists
      : track.subtitle
      ? String(track.subtitle).split(/\s*,\s*|\s+&\s+/).filter(Boolean)
      : [],
    album: track.album || '',
    durationMs: track.durationMs || track.duration_ms || track.duration || 0,
    sourceId: track.sourceId || track.id || '',
    sourceUrl: track.sourceUrl || '',
    index,
  };
}

async function fetchViaEmbed(id) {
  const html = await fetchText(`https://open.spotify.com/embed/playlist/${encodeURIComponent(id)}`);
  const json = extractNextData(html);
  const entity = json?.props?.pageProps?.state?.data?.entity;
  if (!entity || !Array.isArray(entity.trackList)) {
    throw new Error('Playlist Spotify tidak dapat dibaca. Pastikan playlist bersifat publik.');
  }
  const cover = entity.coverArt?.sources?.[0]?.url || entity.images?.[0]?.url || null;
  const tracks = entity.trackList
    .filter((t) => t && (t.title || t.name))
    .map((t, i) =>
      normalizeTrack(
        {
          title: t.title,
          subtitle: t.subtitle,
          duration: t.duration,
          id: (t.uri || '').split(':').pop(),
          sourceUrl: t.uri?.startsWith('spotify:track:')
            ? `https://open.spotify.com/track/${t.uri.split(':').pop()}`
            : '',
        },
        i
      )
    );
  return {
    name: entity.name || entity.title || 'Playlist Spotify',
    description: entity.description || '',
    coverUrl: cover,
    source: 'spotify',
    sourceId: id,
    sourceUrl: `https://open.spotify.com/playlist/${id}`,
    tracks,
    warning:
      tracks.length >= 100
        ? 'Spotify hanya menampilkan 100 lagu pertama lewat mode publik. Isi Client ID & Secret di Pengaturan untuk impor penuh.'
        : null,
  };
}

let cachedToken = null;
let tokenExpiresAt = 0;

async function getSpotifyToken(clientId, clientSecret) {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error('Kredensial Spotify ditolak. Periksa Client ID dan Client Secret.');
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

async function spotifyApi(url, token) {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(25000),
  });
  if (res.status === 429) throw new Error('Spotify sedang membatasi permintaan. Coba lagi nanti.');
  if (!res.ok) throw new Error(`Spotify API membalas HTTP ${res.status}`);
  return res.json();
}

async function fetchViaApi(id, clientId, clientSecret) {
  const token = await getSpotifyToken(clientId, clientSecret);
  const playlist = await spotifyApi(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}?market=from_token`,
    token
  );
  const rawItems = [...(playlist.tracks?.items || [])];
  let next = playlist.tracks?.next;
  let guard = 0;
  while (next && guard < 100) {
    const page = await spotifyApi(next, token);
    rawItems.push(...(page.items || []));
    next = page.next;
    guard += 1;
  }
  const tracks = rawItems
    .map((item) => item?.track || item?.episode)
    .filter((t) => t && t.name)
    .map((t, i) =>
      normalizeTrack(
        {
          title: t.name,
          artists: (t.artists || []).map((a) => a.name),
          album: t.album?.name || '',
          durationMs: t.duration_ms || 0,
          sourceId: t.id || '',
          sourceUrl: t.external_urls?.spotify || '',
        },
        i
      )
    );
  return {
    name: playlist.name || 'Playlist Spotify',
    description: playlist.description || '',
    coverUrl: playlist.images?.[0]?.url || null,
    source: 'spotify',
    sourceId: id,
    sourceUrl: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${id}`,
    tracks,
    warning: null,
  };
}

async function importSpotify(input, { clientId, clientSecret } = {}) {
  const id = parseSpotifyPlaylistId(input);
  if (!id) {
    throw new Error('Link playlist Spotify tidak valid. Contoh: https://open.spotify.com/playlist/…');
  }
  if (clientId && clientSecret) {
    try {
      return await fetchViaApi(id, clientId, clientSecret);
    } catch (err) {
      console.warn('[spotify] API gagal, mencoba mode publik:', err.message);
      const fallback = await fetchViaEmbed(id);
      fallback.warning =
        (fallback.warning ? fallback.warning + ' ' : '') +
        `Mode API gagal: ${err.message}`;
      return fallback;
    }
  }
  return fetchViaEmbed(id);
}

/** Parser CSV sederhana yang mendukung tanda kutip dan newline di dalam sel. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

function parseSpotifyCsv(content, filename = 'Playlist Spotify') {
  const rows = parseCsv(content);
  if (rows.length < 2) throw new Error('File CSV kosong atau tidak dikenali.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const find = (...names) => header.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const titleIdx = find('track name', 'title', 'name');
  const artistIdx = find('artist name(s)', 'artist names', 'artists', 'artist');
  const albumIdx = find('album name', 'album');
  const durationIdx = find('duration (ms)', 'duration ms', 'duration');
  const uriIdx = find('track uri', 'spotify uri');
  if (titleIdx < 0) {
    throw new Error('Kolom "Track Name" tidak ditemukan. Gunakan CSV hasil Exportify.');
  }
  const tracks = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    const title = (r[titleIdx] || '').trim();
    if (!title) continue;
    const artistText = artistIdx >= 0 ? (r[artistIdx] || '').trim() : '';
    const durRaw = durationIdx >= 0 ? Number((r[durationIdx] || '').trim()) : 0;
    const durationMs = Number.isFinite(durRaw)
      ? durRaw > 100000
        ? durRaw
        : durRaw * 1000
      : 0;
    tracks.push({
      title,
      artists: artistText ? artistText.split(/\s*,\s*|\s+&\s+/).filter(Boolean) : [],
      album: albumIdx >= 0 ? (r[albumIdx] || '').trim() : '',
      durationMs: Math.round(durationMs),
      sourceId: uriIdx >= 0 ? (r[uriIdx] || '').trim() : '',
      sourceUrl: '',
      index: tracks.length,
    });
  }
  const cleanName = path.basename(filename).replace(/\.csv$/i, '').replace(/[-_]+/g, ' ').trim();
  return {
    name: cleanName || 'Playlist Spotify',
    description: `Diimpor dari CSV Exportify (${tracks.length} lagu)`,
    coverUrl: null,
    source: 'spotify',
    sourceId: '',
    sourceUrl: '',
    tracks,
    warning: null,
  };
}

module.exports = { importSpotify, parseSpotifyPlaylistId, parseSpotifyCsv };
