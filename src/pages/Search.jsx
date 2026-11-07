import { useEffect, useRef, useState } from 'react';
import { Music2, Play, Search as SearchIcon, Youtube } from 'lucide-react';
import { SongRow, SongRowHeader } from '../components/SongRow';
import { Chip, EmptyState, SectionHeader, Spinner } from '../components/ui';
import { usePlayer } from '../context/PlayerContext';
import { useRoute } from '../context/RouteContext';
import { api } from '../lib/api';

const TYPES = [
  { value: 'song', label: 'Lagu' },
  { value: 'video', label: 'Video' },
];

const SUGGESTIONS = ['Tulus', 'Bernadya', 'NIKI', 'The 1975', 'Lofi Indonesia', 'Dangdut koplo'];

export function Search() {
  const { route, navigate } = useRoute();
  const { playSongs } = usePlayer();
  const [query, setQuery] = useState(() => route.query.get('q') || '');
  const [type, setType] = useState(() => (route.query.get('type') === 'video' ? 'video' : 'song'));
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  const runSearch = async (rawQuery, searchType) => {
    const q = String(rawQuery || '').trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const data = await api.searchYoutube(q, searchType);
      if (requestRef.current !== requestId) return;
      setResults(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      if (requestRef.current !== requestId) return;
      setResults([]);
      setError(err?.message || 'Gagal mencari di YouTube Music');
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  };

  useEffect(() => {
    const nextQuery = route.query.get('q') || '';
    const nextType = route.query.get('type') === 'video' ? 'video' : 'song';
    setQuery(nextQuery);
    setType(nextType);
    runSearch(nextQuery, nextType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.query]);

  const submit = (event) => {
    event?.preventDefault?.();
    const q = query.trim();
    if (!q) return;
    if (route.query.get('q') === q && route.query.get('type') === type) {
      runSearch(q, type);
    } else {
      navigate(`/search?q=${encodeURIComponent(q)}&type=${type}`);
    }
  };

  const changeType = (value) => {
    setType(value);
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}&type=${value}`);
    }
  };

  const clear = () => {
    setQuery('');
    setResults([]);
    setError(null);
    navigate('/search', { replace: true });
  };

  const activeQuery = route.query.get('q') || '';
  const source = { type: 'streaming', name: `YouTube Music: ${activeQuery || 'Pencarian'}` };
  const totalDuration = results.reduce((sum, song) => sum + (song.duration || 0), 0);
  const minutes = Math.round(totalDuration / 60);

  return (
    <div className="page streaming-page">
      <header className="page-head streaming-head">
        <div>
          <p className="page-kicker">Streaming langsung</p>
          <h1>Cari musik</h1>
          <p className="page-sub">Semua hasil diputar langsung dari YouTube Music, tanpa unduhan.</p>
        </div>
      </header>

      <form className="search-field search-big stream-search" onSubmit={submit}>
        <SearchIcon size={22} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari lagu, artis, atau album…"
          aria-label="Cari di YouTube Music"
        />
        {query && (
          <button type="button" className="search-clear" onClick={clear} aria-label="Bersihkan">
            ×
          </button>
        )}
        <button type="submit" className="btn btn-filled btn-sm stream-search-btn" disabled={loading || !query.trim()}>
          {loading ? <Spinner size={16} /> : <SearchIcon size={16} />}
          Cari
        </button>
      </form>

      <div className="stream-toolbar">
        <div className="stream-types">
          {TYPES.map((item) => (
            <Chip key={item.value} active={type === item.value} onClick={() => changeType(item.value)}>
              {item.label}
            </Chip>
          ))}
        </div>
        {results.length > 0 && (
          <div className="stream-summary">
            <span>
              {results.length} hasil{minutes > 0 ? ` · ${minutes} mnt` : ''}
            </span>
            <button
              type="button"
              className="btn btn-tonal btn-sm"
              onClick={() => playSongs(results, 0, source)}
            >
              <Play size={15} fill="currentColor" /> Putar semua
            </button>
          </div>
        )}
      </div>

      {!activeQuery.trim() && (
        <div className="stream-idle">
          <div className="stream-idle-card">
            <SearchIcon size={24} />
            <h3>Mulai dari kata kunci</h3>
            <p>Pilih salah satu, atau ketik judul lagu, artis, atau album favoritmu.</p>
            <div className="stream-suggestions">
              {SUGGESTIONS.map((item) => (
                <Chip
                  key={item}
                  onClick={() => navigate(`/search?q=${encodeURIComponent(item)}&type=${type}`)}
                >
                  {item}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading && results.length === 0 && (
        <div className="stream-loading">
          <Spinner size={28} />
          <span>Menghubungi YouTube Music…</span>
        </div>
      )}

      {error && (
        <EmptyState
          icon={Youtube}
          title="Pencarian gagal"
          description={error}
          action={
            <button type="button" className="btn btn-filled" onClick={() => runSearch(activeQuery, type)}>
              Coba lagi
            </button>
          }
        />
      )}

      {!loading && !error && activeQuery.trim() && results.length === 0 && (
        <EmptyState
          icon={Music2}
          title="Tidak ada hasil"
          description={`Tidak ada ${type === 'video' ? 'video' : 'lagu'} yang cocok untuk "${activeQuery.trim()}". Coba kata kunci lain.`}
        />
      )}

      {results.length > 0 && (
        <section className="stream-results">
          <SectionHeader
            title={type === 'video' ? 'Video' : 'Lagu'}
            subtitle="Diputar langsung dari YouTube Music"
          />
          <div className="song-table">
            <SongRowHeader />
            {results.map((song, index) => (
              <SongRow key={song.id} song={song} index={index} songs={results} source={source} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
