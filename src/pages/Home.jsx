import { useEffect, useMemo, useState } from 'react';
import { Heart, Library, Search, Shuffle, Youtube } from 'lucide-react';
import { PlaylistCover } from '../components/Cover';
import { MediaCard } from '../components/MediaCard';
import { Chip, EmptyState, SectionHeader, Spinner } from '../components/ui';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useRoute } from '../context/RouteContext';
import { api } from '../lib/api';
import { greeting, todayLabel } from '../lib/format';

const SUGGESTIONS = ['Tulus', 'Bernadya', 'NIKI', 'Lofi Indonesia', 'Dangdut koplo', 'Pop 2000an'];

function uniqueTracks(tracks) {
  const seen = new Set();
  return (tracks || []).filter((track) => {
    if (!track?.id || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

export function Home() {
  const { playlists, favorites, historySongs } = useLibrary();
  const { playSongs } = usePlayer();
  const { navigate } = useRoute();
  const [state, setState] = useState({ loading: true, sections: [], error: null });

  const loadHome = () => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    api
      .getHome()
      .then((data) => {
        if (cancelled) return;
        setState({ loading: false, sections: data?.sections || [], error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ loading: false, sections: [], error: err?.message || 'Gagal memuat rekomendasi.' });
      });
    return () => {
      cancelled = true;
    };
  };

  useEffect(loadHome, []);

  const discovery = useMemo(
    () => uniqueTracks(state.sections.flatMap((section) => section.items)).slice(0, 30),
    [state.sections]
  );

  const playDiscovery = () => {
    if (discovery.length) {
      playSongs(discovery, 0, { type: 'home', name: 'Pilihan untukmu' });
    } else {
      navigate('/search');
    }
  };

  const playPlaylist = (playlist) => {
    const tracks = playlist.tracks || [];
    if (tracks.length) {
      playSongs(tracks, 0, { type: 'playlist', id: playlist.id, name: playlist.name });
    } else {
      navigate(`/playlist/${playlist.id}`);
    }
  };

  const hasPersonal = historySongs.length || favorites.length || playlists.length;

  return (
    <div className="page home-page">
      <header className="home-head">
        <div>
          <p className="page-kicker">{todayLabel()}</p>
          <h1>{greeting()}</h1>
          <p className="home-stat">
            Streaming langsung dari YouTube Music
            {favorites.length ? ` · ${favorites.length} lagu disukai` : ''}
            {playlists.length ? ` · ${playlists.length} playlist` : ''}
          </p>
        </div>
        <div className="home-head-actions">
          <button type="button" className="btn btn-filled" onClick={playDiscovery}>
            <Shuffle size={17} />
            Putar untukmu
          </button>
          <button type="button" className="btn btn-tonal" onClick={() => navigate('/search')}>
            <Search size={17} />
            Cari musik
          </button>
        </div>
      </header>

      {state.loading && (
        <div className="stream-loading">
          <Spinner size={28} />
          <span>Menyiapkan pilihan untukmu…</span>
        </div>
      )}

      {state.sections.map((section) => (
        <section key={section.title}>
          <SectionHeader title={section.title} />
          <div className="hscroll">
            {section.items.map((song, index) => (
              <MediaCard
                key={`${section.title}-${song.id}`}
                title={song.title}
                subtitle={song.artist}
                art={song.art}
                onClick={() =>
                  playSongs(section.items, index, { type: 'collection', name: section.title })
                }
                onPlay={() =>
                  playSongs(section.items, index, { type: 'collection', name: section.title })
                }
              />
            ))}
          </div>
        </section>
      ))}

      {!state.loading && state.error && (
        <EmptyState
          icon={Youtube}
          title="Rekomendasi belum tersedia"
          description={state.error}
          action={
            <button type="button" className="btn btn-filled" onClick={loadHome}>
              Coba lagi
            </button>
          }
        />
      )}

      {!state.loading && !state.sections.length && (
        <section>
          <SectionHeader title="Mulai dari sini" subtitle="Pilih kata kunci, atau cari lagu favoritmu." />
          <div className="stream-suggestions">
            {SUGGESTIONS.map((item) => (
              <Chip key={item} onClick={() => navigate(`/search?q=${encodeURIComponent(item)}`)}>
                {item}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {historySongs.length > 0 && (
        <section>
          <SectionHeader title="Diputar terakhir" />
          <div className="hscroll">
            {historySongs.slice(0, 8).map((song, index) => (
              <MediaCard
                key={song.id}
                title={song.title}
                subtitle={song.artist}
                art={song.art}
                onClick={() =>
                  playSongs(historySongs, index, { type: 'history', name: 'Diputar terakhir' })
                }
                onPlay={() =>
                  playSongs(historySongs, index, { type: 'history', name: 'Diputar terakhir' })
                }
              />
            ))}
          </div>
        </section>
      )}

      {favorites.length > 0 && (
        <section>
          <SectionHeader title="Lagu yang kamu sukai" action={() => navigate('/favorites')} />
          <div className="hscroll">
            {favorites.slice(0, 8).map((song, index) => (
              <MediaCard
                key={song.id}
                title={song.title}
                subtitle={song.artist}
                art={song.art}
                onClick={() =>
                  playSongs(favorites, index, { type: 'favorites', name: 'Lagu Disukai' })
                }
                onPlay={() =>
                  playSongs(favorites, index, { type: 'favorites', name: 'Lagu Disukai' })
                }
              />
            ))}
          </div>
        </section>
      )}

      {playlists.length > 0 && (
        <section>
          <SectionHeader title="Playlist-mu" action={() => navigate('/playlists')} />
          <div className="hscroll">
            {playlists.slice(0, 10).map((playlist) => {
              const tracks = playlist.tracks || [];
              return (
                <MediaCard
                  key={playlist.id}
                  title={playlist.name}
                  subtitle={`${tracks.length} lagu`}
                  cover={<PlaylistCover playlist={playlist} songs={tracks} size="100%" radius={12} />}
                  onClick={() => navigate(`/playlist/${playlist.id}`)}
                  onPlay={() => playPlaylist(playlist)}
                />
              );
            })}
          </div>
        </section>
      )}

      {!state.loading && !hasPersonal && !state.sections.length && (
        <EmptyState
          icon={Library}
          title="Pustaka streaming siap"
          description="Cari lagu di YouTube Music, lalu simpan ke playlist atau lagu disukai."
          action={
            <button type="button" className="btn btn-filled" onClick={() => navigate('/search')}>
              <Search size={17} /> Mulai mencari
            </button>
          }
        />
      )}

      <footer className="home-footer">
        <Youtube size={14} /> Streaming dari YouTube Music · Material You ·{' '}
        <Heart size={14} /> tanpa unduhan
      </footer>
    </div>
  );
}
