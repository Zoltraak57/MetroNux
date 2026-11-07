let appInfo = null;

export function initApi(info) {
  appInfo = info;
  return info;
}

export function getAppInfo() {
  return appInfo;
}

export function isDesktop() {
  return typeof window !== 'undefined' && !!window.mntx;
}

function bridge() {
  if (!window.mntx) {
    throw new Error(
      'Metronux harus dijalankan lewat Electron. Gunakan "npm run dev" atau "npm run app".'
    );
  }
  return window.mntx;
}

export const api = {
  getInfo: () => bridge().getInfo(),
  openDataFolder: () => bridge().openDataFolder(),
  openExternal: (url) => bridge().openExternal(url),

  getLibrary: () => bridge().getLibrary(),

  getSettings: () => bridge().getSettings(),
  setSettings: (patch) => bridge().setSettings(patch),

  createPlaylist: (payload) => bridge().createPlaylist(payload),
  updatePlaylist: (id, patch) => bridge().updatePlaylist(id, patch),
  deletePlaylist: (id) => bridge().deletePlaylist(id),

  toggleFavorite: (track) => bridge().toggleFavorite(track),
  recordHistory: (track) => bridge().recordHistory(track),

  searchYoutube: (query, type) => bridge().searchYoutube(query, type),
  getHome: () => bridge().getHome(),
  findLyrics: (song) => bridge().findLyrics(song),

  onMediaCommand: (callback) => bridge().onMediaCommand(callback),
  onSystemTheme: (callback) => bridge().onSystemTheme(callback),
};

export function artUrl(art) {
  if (!art) return null;
  if (/^https?:\/\//i.test(art)) return art;
  if (!appInfo) return null;
  return `${appInfo.mediaBase}/art/${encodeURIComponent(art)}?t=${appInfo.token}`;
}

export function streamUrl(videoId) {
  if (!appInfo || !videoId) return null;
  return `${appInfo.mediaBase}/stream/${encodeURIComponent(videoId)}?t=${appInfo.token}`;
}
