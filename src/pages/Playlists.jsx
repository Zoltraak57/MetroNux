import { ListMusic, Plus } from 'lucide-react';
import { PlaylistCover } from '../components/Cover';
import { EmptyState } from '../components/ui';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useRoute } from '../context/RouteContext';
import { useUI } from '../context/UIContext';

export function Playlists() {
  const { playlists } = useLibrary();
  const { playSongs } = usePlayer();
  const { navigate } = useRoute();
  const { openCreatePlaylist } = useUI();

  const play = (playlist) => {
    const tracks = playlist.tracks || [];
    if (tracks.length) {
      playSongs(tracks, 0, { type: 'playlist', id: playlist.id, name: playlist.name });
    } else {
      navigate(`/playlist/${playlist.id}`);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="page-kicker">Koleksi</p>
          <h1>Playlist</h1>
          <p className="page-sub">{playlists.length} playlist streaming</p>
        </div>
        <div className="page-head-actions">
          <button type="button" className="btn btn-filled" onClick={() => openCreatePlaylist()}>
            <Plus size={17} />
            Playlist baru
          </button>
        </div>
      </header>

      {!playlists.length ? (
        <EmptyState
          icon={ListMusic}
          title="Belum ada playlist"
          description="Buat playlist, lalu tambahkan lagu dari hasil pencarian YouTube Music."
          action={
            <button type="button" className="btn btn-filled" onClick={() => openCreatePlaylist()}>
              <Plus size={17} /> Buat playlist
            </button>
          }
        />
      ) : (
        <div className="playlist-grid">
          {playlists.map((playlist) => {
            const tracks = playlist.tracks || [];
            return (
              <div key={playlist.id} className="playlist-card">
                <div className="playlist-card-cover">
                  <PlaylistCover playlist={playlist} songs={tracks} size="100%" radius={14} />
                  <button
                    type="button"
                    className="playlist-card-play"
                    aria-label={`Putar ${playlist.name}`}
                    onClick={() => play(playlist)}
                  >
                    <ListMusic size={20} />
                  </button>
                </div>
                <div className="playlist-card-text">
                  <div className="playlist-card-title-row">
                    <strong title={playlist.name}>{playlist.name}</strong>
                  </div>
                  <span>{tracks.length} lagu</span>
                </div>
                <button
                  type="button"
                  className="playlist-card-open"
                  aria-label={`Buka ${playlist.name}`}
                  onClick={() => navigate(`/playlist/${playlist.id}`)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
