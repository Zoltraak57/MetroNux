import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [addToPlaylistTracks, setAddToPlaylistTracks] = useState(null);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [createPlaylistTracks, setCreatePlaylistTracks] = useState([]);
  const [editPlaylist, setEditPlaylist] = useState(null);

  const openAddToPlaylist = useCallback(
    (tracks) => setAddToPlaylistTracks(Array.isArray(tracks) ? tracks : []),
    []
  );
  const closeAddToPlaylist = useCallback(() => setAddToPlaylistTracks(null), []);
  const openCreatePlaylist = useCallback((tracks = []) => {
    setCreatePlaylistTracks(Array.isArray(tracks) ? tracks : []);
    setCreatePlaylistOpen(true);
  }, []);
  const closeCreatePlaylist = useCallback(() => {
    setCreatePlaylistOpen(false);
    setCreatePlaylistTracks([]);
  }, []);
  const openEditPlaylist = useCallback((playlist) => setEditPlaylist(playlist), []);
  const closeEditPlaylist = useCallback(() => setEditPlaylist(null), []);

  const value = useMemo(
    () => ({
      addToPlaylistTracks,
      openAddToPlaylist,
      closeAddToPlaylist,
      createPlaylistOpen,
      createPlaylistTracks,
      openCreatePlaylist,
      closeCreatePlaylist,
      editPlaylist,
      openEditPlaylist,
      closeEditPlaylist,
    }),
    [
      addToPlaylistTracks,
      openAddToPlaylist,
      closeAddToPlaylist,
      createPlaylistOpen,
      createPlaylistTracks,
      openCreatePlaylist,
      closeCreatePlaylist,
      editPlaylist,
      openEditPlaylist,
      closeEditPlaylist,
    ]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI harus dipakai di dalam UIProvider');
  return ctx;
}
