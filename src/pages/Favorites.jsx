import { Heart, Music2, Play, Shuffle } from 'lucide-react';
import { SongRow, SongRowHeader } from '../components/SongRow';
import { EmptyState } from '../components/ui';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useRoute } from '../context/RouteContext';
import { formatDurationLong, shuffleArray } from '../lib/format';

export function Favorites() {
  const { favorites } = useLibrary();
  const { playSongs } = usePlayer();
  const { navigate } = useRoute();
  const duration = favorites.reduce((sum, song) => sum + (song.duration || 0), 0);
  const source = { type: 'favorites', name: 'Lagu Disukai' };

  return (
    <div className="page detail-page">
      <header className="favorites-hero">
        <div className="favorites-icon">
          <Heart size={54} fill="currentColor" />
        </div>
        <div className="detail-info">
          <span className="detail-kicker">Koleksi</span>
          <h1>Lagu Disukai</h1>
          <p className="detail-sub">
            {favorites.length} lagu{duration ? ` · ${formatDurationLong(duration)}` : ''}
          </p>
          <div className="detail-actions">
            <button
              type="button"
              className="btn btn-filled"
              disabled={!favorites.length}
              onClick={() => playSongs(favorites, 0, source)}
            >
              <Play size={17} fill="currentColor" />
              Putar
            </button>
            <button
              type="button"
              className="btn btn-glass"
              disabled={!favorites.length}
              onClick={() =>
                playSongs(shuffleArray(favorites), 0, {
                  type: 'favorites',
                  name: 'Lagu Disukai (acak)',
                })
              }
            >
              <Shuffle size={17} />
              Acak
            </button>
          </div>
        </div>
      </header>

      {favorites.length ? (
        <div className="song-table">
          <SongRowHeader />
          {favorites.map((song, index) => (
            <SongRow key={song.id} song={song} index={index} songs={favorites} source={source} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Music2}
          title="Belum ada lagu disukai"
          description="Cari lagu di YouTube Music, lalu tekan ikon hati untuk menyimpannya di sini."
          action={
            <button type="button" className="btn btn-filled" onClick={() => navigate('/search')}>
              <Music2 size={17} />
              Cari lagu
            </button>
          }
        />
      )}
    </div>
  );
}
