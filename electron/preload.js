'use strict';

const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res || typeof res !== 'object') throw new Error('Tidak ada respons dari aplikasi');
  if (!res.ok) throw new Error(res.error || 'Terjadi kesalahan');
  return res.value;
}

function subscribe(channel) {
  return (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('mntx', {
  getInfo: () => invoke('app:info'),
  openDataFolder: () => invoke('app:openDataFolder'),
  openExternal: (url) => invoke('app:openExternal', url),

  getLibrary: () => invoke('library:get'),

  getSettings: () => invoke('settings:get'),
  setSettings: (patch) => invoke('settings:set', patch),

  createPlaylist: (payload) => invoke('playlists:create', payload),
  updatePlaylist: (id, patch) => invoke('playlists:update', { id, patch }),
  deletePlaylist: (id) => invoke('playlists:delete', id),

  toggleFavorite: (track) => invoke('favorites:toggle', track),
  recordHistory: (track) => invoke('history:record', track),

  searchYoutube: (query, type) => invoke('ytm:search', { query, type }),
  getHome: () => invoke('ytm:home'),
  findLyrics: (song) => invoke('lyrics:find', song),

  onMediaCommand: subscribe('media:command'),
  onSystemTheme: subscribe('system:theme'),
});
