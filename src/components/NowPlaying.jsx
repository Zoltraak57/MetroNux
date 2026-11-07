import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ExternalLink,
  Heart,
  ListMusic,
  ListPlus,
  Mic2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Info,
} from 'lucide-react';
import { Cover } from './Cover';
import { IconButton, Spinner } from './ui';
import { MoreMenuButton } from './Menu';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer, usePlayerProgress } from '../context/PlayerContext';
import { useSettings } from '../context/SettingsContext';
import { useUI } from '../context/UIContext';
import { api, artUrl } from '../lib/api';
import { formatDurationLong, formatTime } from '../lib/format';

function LyricsView({ song, position, seek, enabled }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const containerRef = useRef(null);
  const lineRefs = useRef([]);

  useEffect(() => {
    if (!song) return undefined;
    if (!enabled) {
      setState({ loading: false, data: null, error: 'Lirik dinonaktifkan di Pengaturan.' });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    api
      .findLyrics({
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
      })
      .then((data) => {
        if (!cancelled) setState({ loading: false, data, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, data: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [song?.id, enabled]);

  const synced = state.data?.synced || [];
  const activeIndex = useMemo(() => {
    if (!synced.length) return -1;
    let active = -1;
    for (let i = 0; i < synced.length; i += 1) {
      if (synced[i].time <= position + 0.25) active = i;
      else break;
    }
    return active;
  }, [synced, position]);

  useEffect(() => {
    if (activeIndex < 0) return;
    const node = lineRefs.current[activeIndex];
    if (node) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeIndex]);

  if (state.loading) {
    return (
      <div className="lyrics-loading">
        <Spinner size={26} />
        <span>Mencari lirik…</span>
      </div>
    );
  }

  if (state.error || (!state.data && !state.loading)) {
    return (
      <div className="lyrics-empty">
        <Mic2 size={30} />
        <h3>Lirik tidak tersedia</h3>
        <p>{state.error || 'Tidak ditemukan lirik untuk lagu ini di LRCLIB.'}</p>
      </div>
    );
  }

  if (state.data?.instrumental) {
    return (
      <div className="lyrics-empty">
        <Mic2 size={30} />
        <h3>Instrumental</h3>
        <p>Lagu ini tidak memiliki lirik.</p>
      </div>
    );
  }

  if (synced.length) {
    return (
      <div className="lyrics-scroll" ref={containerRef}>
        {synced.map((line, index) => (
          <button
            type="button"
            key={`${line.time}-${index}`}
            ref={(node) => {
              lineRefs.current[index] = node;
            }}
            className={`lyric-line ${index === activeIndex ? 'active' : ''} ${
              index < activeIndex ? 'past' : ''
            }`}
            onClick={() => seek(line.time)}
          >
            {line.text}
          </button>
        ))}
        <div className="lyrics-spacer" />
        <div className="lyrics-source">Lirik dari LRCLIB</div>
      </div>
    );
  }

  if (state.data?.plain) {
    return (
      <div className="lyrics-scroll plain">
        {state.data.plain.split(/\r?\n/).map((line, index) => (
          <p key={index} className={line.trim() ? '' : 'gap'}>
            {line || '\u00A0'}
          </p>
        ))}
        <div className="lyrics-source">Lirik dari LRCLIB</div>
      </div>
    );
  }

  return (
    <div className="lyrics-empty">
      <Mic2 size={30} />
      <h3>Lirik tidak tersedia</h3>
      <p>Belum ada lirik tersinkronisasi untuk lagu ini.</p>
    </div>
  );
}

export function NowPlaying() {
  const {
    currentSong,
    playing,
    shuffle,
    repeat,
    volume,
    muted,
    nowPlayingOpen,
    closeNowPlaying,
    togglePlay,
    next,
    previous,
    toggleShuffle,
    cycleRepeat,
    setVolume,
    toggleMute,
    openQueue,
  } = usePlayer();
  const { position, duration, seek } = usePlayerProgress();
  const { favoriteIds, toggleFavorite } = useLibrary();
  const { settings } = useSettings();
  const { openAddToPlaylist } = useUI();
  const [tab, setTab] = useState(settings.showLyricsOnNowPlaying === false ? 'info' : 'lyrics');

  useEffect(() => {
    if (nowPlayingOpen) {
      setTab(settings.showLyricsOnNowPlaying === false ? 'info' : 'lyrics');
    }
  }, [nowPlayingOpen, settings.showLyricsOnNowPlaying]);

  if (!nowPlayingOpen || !currentSong) return null;

  const liked = favoriteIds.has(currentSong.id);
  const art = currentSong.art ? artUrl(currentSong.art) : null;
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const openInYoutube = () =>
    api
      .openExternal(currentSong.url || `https://music.youtube.com/watch?v=${currentSong.videoId}`)
      .catch(() => {});
  const moreItems = [
    {
      label: 'Tambahkan ke playlist',
      icon: ListPlus,
      onClick: () => openAddToPlaylist([currentSong]),
    },
    {
      label: liked ? 'Hapus dari lagu disukai' : 'Sukai lagu',
      icon: Heart,
      onClick: () => toggleFavorite(currentSong),
    },
    { separator: true },
    {
      label: 'Buka di YouTube Music',
      icon: ExternalLink,
      onClick: openInYoutube,
    },
  ];

  return (
    <div className="nowplaying">
      <div className="np-backdrop">
        {art ? (
          <div className="np-art-bg" style={{ backgroundImage: `url(${art})` }} />
        ) : (
          <div className="np-gradient-bg" />
        )}
        <div className="np-overlay" />
      </div>

      <header className="np-head">
        <button type="button" className="np-close" onClick={closeNowPlaying} aria-label="Tutup tampilan">
          <ChevronDown size={22} />
        </button>
        <div className="np-head-label">
          <span>Sedang diputar</span>
          <small>YouTube Music</small>
        </div>
        <div className="np-head-actions">
          <IconButton
            label="Antrean"
            onClick={() => {
              openQueue();
            }}
            size="sm"
          >
            <ListMusic size={19} />
          </IconButton>
        </div>
      </header>

      <div className="np-content">
        <section className="np-left">
          <div className="np-cover-wrap">
            <Cover art={currentSong.art} title={currentSong.title} size="100%" radius={20} />
          </div>

          <div className="np-meta">
            <div className="np-title-row">
              <div>
                <h1 title={currentSong.title}>{currentSong.title}</h1>
                <p>
                  {currentSong.artist}
                  {currentSong.year ? ` · ${currentSong.year}` : ''}
                </p>
              </div>
              <div className="np-meta-actions">
                <IconButton
                  label={liked ? 'Hapus dari lagu disukai' : 'Sukai lagu'}
                  active={liked}
                  onClick={() => toggleFavorite(currentSong)}
                  className={liked ? 'liked' : ''}
                >
                  <Heart size={21} fill={liked ? 'currentColor' : 'none'} />
                </IconButton>
                <IconButton
                  label="Tambahkan ke playlist"
                  onClick={() => openAddToPlaylist([currentSong])}
                >
                  <ListPlus size={20} />
                </IconButton>
                <IconButton label="Buka di YouTube Music" onClick={openInYoutube}>
                  <ExternalLink size={20} />
                </IconButton>
                <MoreMenuButton items={moreItems} />
              </div>
            </div>

            <div className="np-progress">
              <input
                type="range"
                className="range np-range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(position, duration || position)}
                style={{ '--pct': `${pct}%` }}
                onChange={(event) => seek(Number(event.target.value))}
                aria-label="Posisi pemutaran"
              />
              <div className="np-times">
                <span>{formatTime(position)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="np-controls">
              <IconButton label="Acak" active={shuffle} onClick={toggleShuffle} size="sm">
                <Shuffle size={19} />
              </IconButton>
              <IconButton label="Sebelumnya" onClick={previous}>
                <SkipBack size={26} fill="currentColor" />
              </IconButton>
              <button type="button" className="np-play" onClick={togglePlay} aria-label={playing ? 'Jeda' : 'Putar'}>
                {playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
              </button>
              <IconButton label="Berikutnya" onClick={next}>
                <SkipForward size={26} fill="currentColor" />
              </IconButton>
              <IconButton
                label="Ulangi"
                active={repeat !== 'off'}
                onClick={cycleRepeat}
                size="sm"
              >
                {repeat === 'one' ? <Repeat1 size={19} /> : <Repeat size={19} />}
              </IconButton>
            </div>

            <div className="np-extra">
              <div className="np-volume">
                <IconButton label={muted ? 'Nyalakan suara' : 'Bisukan'} size="sm" onClick={toggleMute}>
                  {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </IconButton>
                <input
                  type="range"
                  className="range volume-range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  style={{ '--pct': `${(muted ? 0 : volume) * 100}%` }}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  aria-label="Volume"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="np-right">
          <div className="np-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'lyrics'}
              className={tab === 'lyrics' ? 'active' : ''}
              onClick={() => setTab('lyrics')}
            >
              <Mic2 size={16} /> Lirik
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'info'}
              className={tab === 'info' ? 'active' : ''}
              onClick={() => setTab('info')}
            >
              <Info size={16} /> Info
            </button>
          </div>

          <div className="np-panel">
            {tab === 'lyrics' ? (
              <LyricsView
                song={currentSong}
                position={position}
                seek={seek}
                enabled={settings.lyricsEnabled !== false}
              />
            ) : (
              <div className="np-info">
                <div className="np-info-art">
                  <Cover art={currentSong.art} title={currentSong.title} size={96} radius={14} />
                  <div>
                    <h3>{currentSong.title}</h3>
                    <p>{currentSong.artist}</p>
                    <span>{formatDurationLong(currentSong.duration)}</span>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Sumber</dt>
                    <dd>{currentSong.sourceLabel || 'YouTube Music'}</dd>
                  </div>
                  <div>
                    <dt>Album</dt>
                    <dd>{currentSong.album || 'Tidak ada'}</dd>
                  </div>
                  <div>
                    <dt>Artis</dt>
                    <dd>{currentSong.albumArtist || currentSong.artist}</dd>
                  </div>
                  <div>
                    <dt>Tahun</dt>
                    <dd>{currentSong.year || 'Tidak ada'}</dd>
                  </div>
                  <div>
                    <dt>Tautan</dt>
                    <dd className="np-path">
                      <button type="button" className="link-btn" onClick={openInYoutube}>
                        Buka di YouTube Music
                      </button>
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
