import { useState } from 'react';
import {
  Heart,
  ListMusic,
  Maximize2,
  Mic2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Timer,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Cover } from './Cover';
import { Menu } from './Menu';
import { IconButton } from './ui';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer, usePlayerProgress } from '../context/PlayerContext';
import { formatTime } from '../lib/format';

function SeekBar() {
  const { position, duration } = usePlayerProgress();
  const { seek } = usePlayer();
  const [seeking, setSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const value = seeking ? seekValue : Math.min(position, duration || position);
  const pct = duration > 0 ? (value / duration) * 100 : 0;

  return (
    <div className="seek-row">
      <span className="time">{formatTime(value)}</span>
      <input
        type="range"
        className="range seek-range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={value}
        style={{ '--pct': `${pct}%` }}
        onChange={(event) => {
          const next = Number(event.target.value);
          setSeekValue(next);
          if (!seeking) seek(next);
        }}
        onPointerDown={() => {
          setSeeking(true);
          setSeekValue(position);
        }}
        onPointerUp={() => {
          setSeeking(false);
          seek(seekValue);
        }}
        onKeyUp={(event) => {
          if (event.key.startsWith('Arrow')) seek(Number(event.currentTarget.value));
        }}
        aria-label="Posisi pemutaran"
        disabled={!duration}
      />
      <span className="time">{formatTime(duration)}</span>
    </div>
  );
}

function VolumeControl() {
  const { volume, muted, setVolume, toggleMute } = usePlayer();
  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className="volume-control">
      <IconButton label={muted ? 'Nyalakan suara' : 'Bisukan'} onClick={toggleMute} size="sm">
        <Icon size={18} />
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
  );
}

export function PlayerBar() {
  const {
    currentSong,
    playing,
    shuffle,
    repeat,
    togglePlay,
    next,
    previous,
    toggleShuffle,
    cycleRepeat,
    openNowPlaying,
    toggleQueue,
    queue,
    queueOpen,
    nowPlayingOpen,
    sleepEndsAt,
    sleepRemaining,
    setSleepTimer,
  } = usePlayer();
  const { favoriteIds, toggleFavorite } = useLibrary();
  const [timerPos, setTimerPos] = useState(null);

  const liked = currentSong ? favoriteIds.has(currentSong.id) : false;
  const sleepLabel = sleepEndsAt
    ? `${Math.floor(sleepRemaining / 60000)}:${String(Math.floor((sleepRemaining % 60000) / 1000)).padStart(2, '0')}`
    : null;

  const sleepItems = [
    { label: 'Matikan timer tidur', disabled: !sleepEndsAt, onClick: () => setSleepTimer(null) },
    { separator: true },
    ...[15, 30, 45, 60].map((minutes) => ({
      label: `${minutes} menit`,
      hint: sleepEndsAt ? 'atur ulang' : undefined,
      onClick: () => setSleepTimer(minutes),
    })),
  ];

  return (
    <footer className="playerbar">
      <div className="player-left">
        <button
          type="button"
          className="now-playing-button"
          onClick={openNowPlaying}
          disabled={!currentSong}
          title={currentSong ? 'Buka tampilan sekarang diputar' : 'Belum ada lagu'}
        >
          <Cover art={currentSong?.art} title={currentSong?.title} size={54} radius={12} />
          <span className="player-song-text">
            <strong>{currentSong?.title || 'Belum ada lagu diputar'}</strong>
            <small>{currentSong?.artist || 'Cari lagu untuk mulai memutar'}</small>
          </span>
        </button>
        {currentSong && (
          <IconButton
            label={liked ? 'Hapus dari lagu disukai' : 'Sukai lagu'}
            active={liked}
            onClick={() => toggleFavorite(currentSong)}
            size="sm"
            className={liked ? 'liked' : ''}
          >
            <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
          </IconButton>
        )}
      </div>

      <div className="player-center">
        <div className="player-controls">
          <IconButton
            label="Acak"
            active={shuffle}
            onClick={toggleShuffle}
            size="sm"
            className="player-mode-btn"
          >
            <Shuffle size={17} />
          </IconButton>
          <IconButton label="Sebelumnya" onClick={previous} disabled={!currentSong}>
            <SkipBack size={21} fill="currentColor" />
          </IconButton>
          <button
            type="button"
            className="play-main"
            onClick={togglePlay}
            disabled={!currentSong}
            aria-label={playing ? 'Jeda' : 'Putar'}
          >
            {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
          <IconButton label="Berikutnya" onClick={next} disabled={!currentSong}>
            <SkipForward size={21} fill="currentColor" />
          </IconButton>
          <IconButton
            label={repeat === 'one' ? 'Ulangi satu lagu' : repeat === 'all' ? 'Ulangi semua' : 'Ulangi'}
            active={repeat !== 'off'}
            onClick={cycleRepeat}
            size="sm"
            className="player-mode-btn"
          >
            {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={17} />}
          </IconButton>
        </div>
        <SeekBar />
      </div>

      <div className="player-right">
        <IconButton
          label="Lirik"
          onClick={openNowPlaying}
          size="sm"
          className="player-extra"
        >
          <Mic2 size={18} />
        </IconButton>
        <div className="queue-button-wrap">
          <IconButton label="Antrean" onClick={toggleQueue} active={queueOpen} size="sm">
            <ListMusic size={18} />
          </IconButton>
          {queue.length > 0 && <span className="queue-count">{queue.length}</span>}
        </div>
        <div className="timer-wrap">
          <IconButton
            label={sleepLabel ? `Timer tidur ${sleepLabel}` : 'Timer tidur'}
            active={!!sleepEndsAt}
            size="sm"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setTimerPos({ x: rect.right - 228, y: rect.top - 8 });
            }}
          >
            <Timer size={18} />
          </IconButton>
          {sleepLabel && <span className="timer-label">{sleepLabel}</span>}
        </div>
        <VolumeControl />
        <IconButton label="Perbesar pemutar" onClick={openNowPlaying} size="sm" className="player-extra">
          <Maximize2 size={17} />
        </IconButton>
      </div>

      {timerPos && (
        <Menu
          x={timerPos.x}
          y={timerPos.y}
          items={[
            {
              label: sleepLabel ? `Timer aktif · ${sleepLabel}` : 'Timer tidur',
              icon: Timer,
              disabled: true,
              onClick: () => {},
            },
            ...sleepItems,
          ]}
          onClose={() => setTimerPos(null)}
        />
      )}
    </footer>
  );
}
