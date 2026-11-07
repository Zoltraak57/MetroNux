import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './ToastContext';

const LibraryContext = createContext(null);

function uniqueTracks(tracks) {
  const seen = new Set();
  const result = [];
  for (const track of Array.isArray(tracks) ? tracks : []) {
    if (!track || typeof track !== 'object') continue;
    const id = track.id || (track.videoId ? `yt:${track.videoId}` : null);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ ...track, id });
  }
  return result;
}

export function LibraryProvider({ children }) {
  const { toast } = useToast();
  const [playlists, setPlaylists] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getLibrary();
        if (cancelled) return;
        setPlaylists(Array.isArray(data?.playlists) ? data.playlists : []);
        setFavorites(uniqueTracks(data?.favorites));
        setHistory(Array.isArray(data?.history) ? data.history : []);
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(err.message || String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createPlaylist = useCallback(async (payload) => {
    const playlist = await api.createPlaylist(payload);
    setPlaylists((prev) => [playlist, ...prev]);
    return playlist;
  }, []);

  const updatePlaylist = useCallback(async (id, patch) => {
    const playlist = await api.updatePlaylist(id, patch);
    setPlaylists((prev) => prev.map((p) => (p.id === id ? playlist : p)));
    return playlist;
  }, []);

  const deletePlaylist = useCallback(async (id) => {
    const result = await api.deletePlaylist(id);
    setPlaylists(result.playlists || []);
    return result;
  }, []);

  const addSongsToPlaylist = useCallback(
    async (playlistId, tracks) => {
      const playlist = playlists.find((p) => p.id === playlistId);
      if (!playlist) return null;
      const existing = new Set((playlist.tracks || []).map((track) => track.id));
      const additions = uniqueTracks(tracks).filter((track) => !existing.has(track.id));
      return updatePlaylist(playlistId, {
        tracks: [...(playlist.tracks || []), ...additions],
      });
    },
    [playlists, updatePlaylist]
  );

  const toggleFavorite = useCallback(
    async (track) => {
      if (!track?.id) return false;
      const liked = favorites.some((item) => item.id === track.id);
      setFavorites((prev) =>
        liked ? prev.filter((item) => item.id !== track.id) : [track, ...prev]
      );
      try {
        const result = await api.toggleFavorite(track);
        setFavorites(uniqueTracks(result.favorites));
        return result.liked;
      } catch (err) {
        setFavorites((prev) =>
          liked
            ? [track, ...prev.filter((item) => item.id !== track.id)]
            : prev.filter((item) => item.id !== track.id)
        );
        toast(`Gagal memperbarui lagu disukai: ${err.message}`, 'error');
        return liked;
      }
    },
    [favorites, toast]
  );

  const recordPlay = useCallback((track) => {
    if (!track?.id) return;
    setHistory((prev) => [
      { track, at: Date.now() },
      ...prev.filter((entry) => entry.track?.id !== track.id),
    ].slice(0, 60));
    api.recordHistory(track).then((next) => setHistory(next)).catch(() => {});
  }, []);

  const favoriteIds = useMemo(
    () => new Set(favorites.map((track) => track.id)),
    [favorites]
  );
  const playlistsById = useMemo(
    () => new Map(playlists.map((playlist) => [playlist.id, playlist])),
    [playlists]
  );
  const historySongs = useMemo(() => {
    const seen = new Set();
    return history
      .map((entry) => entry?.track)
      .filter((track) => {
        if (!track?.id || seen.has(track.id)) return false;
        seen.add(track.id);
        return true;
      })
      .slice(0, 12);
  }, [history]);

  const value = useMemo(
    () => ({
      ready,
      error,
      playlists,
      playlistsById,
      favorites,
      favoriteIds,
      history,
      historySongs,
      createPlaylist,
      updatePlaylist,
      deletePlaylist,
      addSongsToPlaylist,
      toggleFavorite,
      recordPlay,
    }),
    [
      ready,
      error,
      playlists,
      playlistsById,
      favorites,
      favoriteIds,
      history,
      historySongs,
      createPlaylist,
      updatePlaylist,
      deletePlaylist,
      addSongsToPlaylist,
      toggleFavorite,
      recordPlay,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary harus dipakai di dalam LibraryProvider');
  return ctx;
}
