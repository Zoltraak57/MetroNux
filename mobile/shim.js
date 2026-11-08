/* Jembatan API untuk versi Android. Dimuat sebelum bundle React. */
(function () {
  'use strict';

  var base = window.location.origin;
  var listeners = new Map();

  function emit(channel, payload) {
    var list = listeners.get(channel);
    if (!list) return;
    list.slice().forEach(function (callback) {
      try {
        callback(payload);
      } catch (err) {
        console.error('[mntx]', err);
      }
    });
  }

  window.__mntxEmit = emit;

  async function invoke(channel) {
    var args = Array.prototype.slice.call(arguments, 1);
    var response;
    try {
      response = await fetch(base + '/api/' + encodeURIComponent(channel), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
    } catch (err) {
      throw new Error('Tidak dapat menghubungi layanan Metronux');
    }
    var data = null;
    try {
      data = await response.json();
    } catch (err) {}
    if (!data || !data.ok) {
      throw new Error((data && data.error) || 'Terjadi kesalahan');
    }
    return data.value;
  }

  function subscribe(channel) {
    return function (callback) {
      if (typeof callback !== 'function') return function () {};
      var list = listeners.get(channel);
      if (!list) {
        list = [];
        listeners.set(channel, list);
      }
      list.push(callback);
      return function () {
        var index = list.indexOf(callback);
        if (index >= 0) list.splice(index, 1);
      };
    };
  }

  var native = window.MetronuxNative || null;

  window.mntx = {
    getInfo: function () {
      return invoke('app:info').then(function (info) {
        if (native) {
          try {
            if (typeof native.isSystemDark === 'function') {
              info.systemDark = !!native.isSystemDark();
            }
            if (typeof native.getSystemAccent === 'function') {
              var accent = native.getSystemAccent();
              if (/^#[0-9a-f]{6}$/i.test(accent)) info.systemAccent = accent;
            }
          } catch (err) {}
        }
        return info;
      });
    },
    openDataFolder: function () {
      return Promise.resolve(true);
    },
    openExternal: function (url) {
      if (native && typeof native.openExternal === 'function') {
        native.openExternal(String(url || ''));
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    },

    getLibrary: function () {
      return invoke('library:get');
    },

    getSettings: function () {
      return invoke('settings:get');
    },
    setSettings: function (patch) {
      return invoke('settings:set', patch);
    },

    createPlaylist: function (payload) {
      return invoke('playlists:create', payload);
    },
    updatePlaylist: function (id, patch) {
      return invoke('playlists:update', { id: id, patch: patch });
    },
    deletePlaylist: function (id) {
      return invoke('playlists:delete', id);
    },

    toggleFavorite: function (track) {
      return invoke('favorites:toggle', track);
    },
    recordHistory: function (track) {
      return invoke('history:record', track);
    },

    searchYoutube: function (query, type) {
      return invoke('ytm:search', { query: query, type: type });
    },
    getHome: function () {
      return invoke('ytm:home');
    },
    findLyrics: function (song) {
      return invoke('lyrics:find', song);
    },

    onMediaCommand: subscribe('media:command'),
    onSystemTheme: subscribe('system:theme'),
  };

  document.documentElement.classList.add('mobile');

  function syncNativeTheme() {
    if (!native || typeof native.setUiTheme !== 'function') return;
    var root = document.documentElement;
    var dark = root.classList.contains('dark');
    var surface = '';
    try {
      surface = getComputedStyle(root).getPropertyValue('--surface').trim();
    } catch (err) {}
    if (!/^#[0-9a-f]{6}$/i.test(surface)) surface = dark ? '#131218' : '#FDF7FF';
    try {
      native.setUiTheme(dark, surface);
    } catch (err) {}
  }

  function watchNativeTheme() {
    if (!native || typeof native.setUiTheme !== 'function') return;
    new MutationObserver(syncNativeTheme).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-style'],
    });
    syncNativeTheme();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchNativeTheme, { once: true });
  } else {
    watchNativeTheme();
  }

  // Cegah zoom ganda yang mengganggu saat memakai kontrol pemutar.
  document.addEventListener(
    'touchstart',
    function (event) {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false }
  );
})();
