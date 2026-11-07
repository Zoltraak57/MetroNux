import { useEffect, useState } from 'react';
import { Check, ListMusic, ListPlus, Plus } from 'lucide-react';
import { Modal, Spinner } from './ui';
import { PlaylistCover } from './Cover';
import { useLibrary } from '../context/LibraryContext';
import { useRoute } from '../context/RouteContext';
import { useUI } from '../context/UIContext';
import { useToast } from '../context/ToastContext';

export function PlaylistFormDialog() {
  const {
    createPlaylistOpen,
    createPlaylistTracks,
    closeCreatePlaylist,
    editPlaylist,
    closeEditPlaylist,
  } = useUI();
  const { createPlaylist, updatePlaylist } = useLibrary();
  const { navigate } = useRoute();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const isEdit = !!editPlaylist;
  const open = createPlaylistOpen || isEdit;

  useEffect(() => {
    if (editPlaylist) {
      setName(editPlaylist.name || '');
      setDescription(editPlaylist.description || '');
    } else if (createPlaylistOpen) {
      setName('');
      setDescription('');
    }
  }, [createPlaylistOpen, editPlaylist]);

  const close = () => {
    if (isEdit) closeEditPlaylist();
    else closeCreatePlaylist();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (isEdit) {
        await updatePlaylist(editPlaylist.id, {
          name: name.trim(),
          description: description.trim(),
        });
        toast('Playlist diperbarui', 'success');
        close();
      } else {
        const playlist = await createPlaylist({
          name: name.trim(),
          description: description.trim(),
          tracks: createPlaylistTracks,
          source: 'youtube',
        });
        toast('Playlist dibuat', 'success');
        close();
        navigate(`/playlist/${playlist.id}`);
      }
    } catch (err) {
      toast(`Gagal menyimpan playlist: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={isEdit ? 'Edit playlist' : 'Playlist baru'}
      subtitle={
        isEdit
          ? 'Perbarui nama dan deskripsi playlist.'
          : createPlaylistTracks?.length
          ? `${createPlaylistTracks.length} lagu akan ditambahkan.`
          : 'Buat koleksi lagu dengan nama dan deskripsi sendiri.'
      }
      footer={
        <>
          <button type="button" className="btn btn-text" onClick={close} disabled={busy}>
            Batal
          </button>
          <button
            type="submit"
            form="playlist-form"
            className="btn btn-filled"
            disabled={!name.trim() || busy}
          >
            {busy ? <Spinner size={17} /> : <Check size={17} />}
            {isEdit ? 'Simpan perubahan' : 'Buat playlist'}
          </button>
        </>
      }
    >
      <form id="playlist-form" className="form" onSubmit={submit}>
        <label className="field">
          <span>Nama playlist</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Misalnya: Favorit sore hari"
            maxLength={120}
          />
        </label>
        <label className="field">
          <span>Deskripsi (opsional)</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ceritakan suasana playlist ini…"
            rows={3}
            maxLength={500}
          />
        </label>
      </form>
    </Modal>
  );
}

export function AddToPlaylistDialog() {
  const { addToPlaylistTracks, closeAddToPlaylist, openCreatePlaylist } = useUI();
  const { playlists, addSongsToPlaylist } = useLibrary();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState(null);

  const open = addToPlaylistTracks !== null;
  const tracks = addToPlaylistTracks || [];

  const addTo = async (playlist) => {
    if (busyId) return;
    setBusyId(playlist.id);
    const existing = new Set((playlist.tracks || []).map((track) => track.id));
    const additions = tracks.filter((track) => track?.id && !existing.has(track.id));
    try {
      if (!additions.length) {
        toast('Semua lagu sudah ada di playlist ini', 'info');
        closeAddToPlaylist();
        return;
      }
      await addSongsToPlaylist(playlist.id, additions);
      toast(
        `${additions.length} lagu ditambahkan ke "${playlist.name}"`,
        'success'
      );
      closeAddToPlaylist();
    } catch (err) {
      toast(`Gagal menambahkan lagu: ${err.message}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={closeAddToPlaylist}
      title="Tambahkan ke playlist"
      subtitle={`${tracks.length} lagu dipilih`}
      size="sm"
      footer={
        <button
          type="button"
          className="btn btn-tonal"
          onClick={() => {
            const selected = tracks;
            closeAddToPlaylist();
            openCreatePlaylist(selected);
          }}
        >
          <Plus size={17} />
          Buat playlist baru
        </button>
      }
    >
      {!playlists.length ? (
        <div className="add-playlist-empty">
          <ListMusic size={30} />
          <p>Belum ada playlist. Buat playlist baru untuk menyimpan lagu ini.</p>
        </div>
      ) : (
        <div className="add-playlist-list">
          {playlists.map((playlist) => {
            const songs = playlist.tracks || [];
            const existing = new Set(songs.map((track) => track.id));
            const allPresent = tracks.every((track) => existing.has(track.id));
            return (
              <button
                type="button"
                key={playlist.id}
                className="add-playlist-item"
                onClick={() => addTo(playlist)}
                disabled={!!busyId}
              >
                <PlaylistCover playlist={playlist} songs={songs} size={44} radius={11} />
                <span>
                  <strong>{playlist.name}</strong>
                  <small>{songs.length} lagu</small>
                </span>
                {busyId === playlist.id ? (
                  <Spinner size={18} />
                ) : allPresent ? (
                  <span className="already-badge">
                    <Check size={14} /> Sudah ada
                  </span>
                ) : (
                  <ListPlus size={18} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
