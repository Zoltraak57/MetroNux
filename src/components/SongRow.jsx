import {
  ExternalLink,
  Heart,
  ListPlus,
  ListStart,
  ListEnd,
  Play,
  Trash2,
} from 'lucide-react';
import { Cover } from './Cover';
import { MoreMenuButton } from './Menu';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useUI } from '../context/UIContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { formatTime } from '../lib/format';

export function SongRow({
  song,
  index,
  songs,
  source,
  showAlbum = true,
  showCover = true,
  trackNo = null,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRemove,
  className = '',
}) {
  const { favoriteIds, toggleFavorite } = useLibrary();
  const { currentSong, playing, playSongs, togglePlay, addToQueue } = usePlayer();
  const { openAddToPlaylist } = useUI();
  const { toast } = useToast();

  const active = currentSong?.id === song.id;
  const liked = favoriteIds.has(song.id);

  const play = () => {
    if (active) {
      togglePlay();
      return;
    }
    const list = songs && songs.length ? songs : [song];
    const start = list.findIndex((item) => item.id === song.id);
    playSongs(list, start >= 0 ? start : 0, source || null);
  };

  const items = [
    {
      label: 'Putar berikutnya',
      icon: ListStart,
      onClick: () => addToQueue([song], { next: true }),
    },
    {
      label: 'Tambahkan ke antrean',
      icon: ListEnd,
      onClick: () => addToQueue([song]),
    },
    {
      label: 'Tambahkan ke playlist',
      icon: ListPlus,
      onClick: () => openAddToPlaylist([song]),
    },
    {
      label: liked ? 'Hapus dari lagu disukai' : 'Sukai lagu',
      icon: Heart,
      onClick: () => toggleFavorite(song),
    },
    { separator: true },
    {
      label: 'Buka di YouTube Music',
      icon: ExternalLink,
      onClick: () =>
        api
          .openExternal(song.url || `https://music.youtube.com/watch?v=${song.videoId}`)
          .catch(() => toast('Tidak dapat membuka browser', 'error')),
    },
  ];

  if (onRemove) {
    items.push({ separator: true });
    items.push({
      label: 'Hapus dari playlist',
      icon: Trash2,
      danger: true,
      onClick: () => onRemove(song),
    });
  }

  return (
    <div
      className={`song-row ${active ? 'active' : ''} ${showAlbum ? '' : 'no-album'} ${className}`}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      draggable={draggable}
    >
      <button
        type="button"
        className="song-row-open"
        onClick={play}
        aria-label={`Putar ${song.title}`}
        aria-current={active ? 'true' : undefined}
      />
      <div className="song-index" aria-hidden="true">
        {active ? (
          <span className={`eq-bars ${playing ? 'playing' : 'paused'}`}>
            <i />
            <i />
            <i />
          </span>
        ) : (
          <span className="song-number">{trackNo || index + 1}</span>
        )}
        <Play className="song-index-play" size={14} fill="currentColor" />
      </div>

      <div className="song-main">
        {showCover && <Cover art={song.art} title={song.title} size={42} radius={10} />}
        <div className="song-text">
          <div className="song-title" title={song.title}>
            {song.title}
          </div>
          <div className="song-artist" title={song.artist}>
            {song.artist}
          </div>
        </div>
      </div>

      {showAlbum && (
        <div className="song-album" title={song.album}>
          {song.album}
        </div>
      )}

      <div className="song-duration">{song.duration ? formatTime(song.duration) : ''}</div>

      <button
        type="button"
        className={`icon-btn icon-btn-sm heart-btn ${liked ? 'liked' : ''}`}
        aria-label={liked ? 'Hapus dari lagu disukai' : 'Sukai lagu'}
        title={liked ? 'Hapus dari lagu disukai' : 'Sukai lagu'}
        onClick={(event) => {
          event.stopPropagation();
          toggleFavorite(song);
        }}
      >
        <Heart size={17} fill={liked ? 'currentColor' : 'none'} />
      </button>

      <div className="song-row-more">
        <MoreMenuButton items={items} />
      </div>
    </div>
  );
}

export function SongRowHeader({ showAlbum = true, reorder = false }) {
  return (
    <div className={`song-head ${showAlbum ? '' : 'no-album'} ${reorder ? 'with-reorder' : ''}`}>
      <span className="song-head-index">#</span>
      <span>Judul</span>
      {showAlbum && <span>Album</span>}
      <span className="song-head-duration">Durasi</span>
      <span />
      <span />
    </div>
  );
}

export function SongListEmpty({ title, description, action, icon }) {
  return (
    <div className="song-list-empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
