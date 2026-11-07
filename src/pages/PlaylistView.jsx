import { useState } from 'react';
import { ListMusic, ListPlus, Pencil, Play, Shuffle, Trash2, Search } from 'lucide-react';
import { PlaylistCover } from '../components/Cover';
import { MoreMenuButton } from '../components/Menu';
import { SongRow, SongRowHeader } from '../components/SongRow';
import { EmptyState, Modal } from '../components/ui';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useRoute } from '../context/RouteContext';
import { useUI } from '../context/UIContext';
import { useToast } from '../context/ToastContext';
import { artUrl } from '../lib/api';
import { formatDurationLong, shuffleArray } from '../lib/format';

export function PlaylistView() {
  const { route, navigate } = useRoute();
  const { playlistsById, updatePlaylist, deletePlaylist } = useLibrary();
  const { playSongs, addToQueue } = usePlayer();
  const { openEditPlaylist } = useUI();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const playlist = playlistsById.get(route.id);
  if (!playlist) {
    return (
      <div className="page">
        <EmptyState
          icon={ListMusic}
          title="Playlist tidak ditemukan"
          description="Playlist ini mungkin sudah dihapus."
          action={
            <button type="button" className="btn btn-filled" onClick={() => navigate('/playlists')}>
              Lihat semua playlist
            </button>
          }
        />
      </div>
    );
  }

  const tracks = playlist.tracks || [];
  const duration = tracks.reduce((sum, song) => sum + (song.duration || 0), 0);
  const source = { type: 'playlist', id: playlist.id, name: playlist.name };
  const heroSrc = playlist.coverUrl || (tracks[0]?.art ? artUrl(tracks[0].art) : null);

  const reorder = async (from, to) => {
    if (from === null || from === to || from < 0 || to < 0) return;
    const next = [...tracks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    try {
      await updatePlaylist(playlist.id, { tracks: next });
    } catch (err) {
      toast(`Gagal mengubah urutan: ${err.message}`, 'error');
    }
  };

  const removeSong = async (song) => {
    try {
      await updatePlaylist(playlist.id, {
        tracks: tracks.filter((track) => track.id !== song.id),
      });
      toast('Lagu dihapus dari playlist', 'success');
    } catch (err) {
      toast(`Gagal menghapus lagu: ${err.message}`, 'error');
    }
  };

  const remove = async () => {
    try {
      await deletePlaylist(playlist.id);
      setConfirmDelete(false);
      toast('Playlist dihapus', 'success');
      navigate('/playlists');
    } catch (err) {
      toast(`Gagal menghapus playlist: ${err.message}`, 'error');
    }
  };

  const menuItems = [
    {
      label: 'Edit detail',
      icon: Pencil,
      onClick: () => openEditPlaylist(playlist),
    },
    {
      label: 'Tambahkan semua ke antrean',
      icon: ListPlus,
      disabled: !tracks.length,
      onClick: () => addToQueue(tracks),
    },
    { separator: true },
    {
      label: 'Hapus playlist',
      icon: Trash2,
      danger: true,
      onClick: () => setConfirmDelete(true),
    },
  ];

  return (
    <div className="page detail-page playlist-detail">
      <header className="detail-hero">
        {heroSrc && <div className="detail-hero-bg" style={{ backgroundImage: `url(${heroSrc})` }} />}
        <div className="detail-hero-shade" />
        <div className="detail-hero-inner">
          <PlaylistCover
            playlist={playlist}
            songs={tracks}
            size={196}
            radius={18}
            className="detail-cover"
          />
          <div className="detail-info">
            <span className="detail-kicker">Playlist</span>
            <h1>{playlist.name}</h1>
            {playlist.description && <p className="detail-desc">{playlist.description}</p>}
            <p className="detail-sub">
              {tracks.length} lagu{duration ? ` · ${formatDurationLong(duration)}` : ''}
            </p>
            <div className="detail-actions">
              <button
                type="button"
                className="btn btn-filled"
                disabled={!tracks.length}
                onClick={() => playSongs(tracks, 0, source)}
              >
                <Play size={17} fill="currentColor" />
                Putar
              </button>
              <button
                type="button"
                className="btn btn-glass"
                disabled={!tracks.length}
                onClick={() =>
                  playSongs(shuffleArray(tracks), 0, {
                    type: 'playlist',
                    id: playlist.id,
                    name: `${playlist.name} (acak)`,
                  })
                }
              >
                <Shuffle size={17} />
                Acak
              </button>
              <MoreMenuButton items={menuItems} label="Opsi playlist" />
            </div>
          </div>
        </div>
      </header>

      {tracks.length > 0 ? (
        <div className="song-table">
          <SongRowHeader />
          {tracks.map((song, index) => (
            <SongRow
              key={song.id}
              song={song}
              index={index}
              songs={tracks}
              source={source}
              draggable
              onDragStart={() => setDragFrom(index)}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(index);
              }}
              onDrop={(event) => {
                event.preventDefault();
                reorder(dragFrom, index);
                setDragFrom(null);
                setDragOver(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              onRemove={removeSong}
              className={dragOver === index && dragFrom !== index ? 'drag-target' : ''}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ListMusic}
          title="Playlist masih kosong"
          description="Cari lagu di YouTube Music, lalu pilih Tambahkan ke playlist dari menu lagu."
          action={
            <button type="button" className="btn btn-filled" onClick={() => navigate('/search')}>
              <Search size={17} />
              Cari lagu
            </button>
          }
        />
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Hapus playlist?"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-text" onClick={() => setConfirmDelete(false)}>
              Batal
            </button>
            <button type="button" className="btn btn-danger" onClick={remove}>
              <Trash2 size={16} />
              Hapus playlist
            </button>
          </>
        }
      >
        <p className="confirm-text">
          Playlist <strong>{playlist.name}</strong> akan dihapus. Lagu tetap tersedia di YouTube
          Music.
        </p>
      </Modal>
    </div>
  );
}
