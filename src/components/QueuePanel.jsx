import { useRef, useState } from 'react';
import { ListMusic, Trash2, X, GripVertical, Pause, Play } from 'lucide-react';
import { Cover } from './Cover';
import { IconButton } from './ui';
import { usePlayer } from '../context/PlayerContext';
import { formatTime } from '../lib/format';

export function QueuePanel() {
  const {
    queue,
    index,
    currentSong,
    source,
    playing,
    queueOpen,
    closeQueue,
    playAt,
    togglePlay,
    removeFromQueue,
    moveInQueue,
    clearQueue,
  } = usePlayer();
  const dragIndexRef = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  if (!queueOpen) return null;

  const upNext = queue.slice(index + 1);
  const played = queue.slice(0, Math.max(0, index));

  return (
    <>
      <div className="queue-scrim" onMouseDown={closeQueue} />
      <aside className="queue-panel" aria-label="Antrean pemutaran">
        <header className="queue-head">
          <div>
            <h2>Antrean</h2>
            <p>
              {queue.length} lagu
              {source?.name ? ` · ${source.name}` : ''}
            </p>
          </div>
          <div className="queue-head-actions">
            <IconButton
              label="Bersihkan antrean"
              size="sm"
              disabled={!queue.length}
              onClick={clearQueue}
            >
              <Trash2 size={17} />
            </IconButton>
            <IconButton label="Tutup antrean" size="sm" onClick={closeQueue}>
              <X size={18} />
            </IconButton>
          </div>
        </header>

        {!queue.length ? (
          <div className="queue-empty">
            <ListMusic size={34} />
            <h3>Antrean kosong</h3>
            <p>Pilih lagu atau album untuk mulai memutar musik.</p>
          </div>
        ) : (
          <div className="queue-body">
            {currentSong && (
              <div className="queue-now">
                <Cover art={currentSong.art} title={currentSong.title} size={54} radius={12} />
                <div className="queue-now-text">
                  <small>Sedang diputar</small>
                  <strong>{currentSong.title}</strong>
                  <span>{currentSong.artist}</span>
                </div>
                <IconButton
                  label={playing ? 'Jeda' : 'Putar'}
                  size="sm"
                  onClick={togglePlay}
                  className="queue-play"
                >
                  {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                </IconButton>
              </div>
            )}

            {upNext.length > 0 && (
              <>
                <div className="queue-section-label">Berikutnya</div>
                <div className="queue-list">
                  {upNext.map((song, offset) => {
                    const queueIndex = index + 1 + offset;
                    return (
                      <div
                        key={`${song.id}-${queueIndex}`}
                        className={`queue-item ${dragOver === queueIndex ? 'drag-over' : ''}`}
                        draggable
                        onDragStart={() => {
                          dragIndexRef.current = queueIndex;
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDragOver(queueIndex);
                        }}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (dragIndexRef.current !== null) {
                            moveInQueue(dragIndexRef.current, queueIndex);
                          }
                          dragIndexRef.current = null;
                          setDragOver(null);
                        }}
                        onDragEnd={() => {
                          dragIndexRef.current = null;
                          setDragOver(null);
                        }}
                      >
                        <button
                          type="button"
                          className="queue-item-open"
                          aria-label={`Putar ${song.title}`}
                          onClick={() => playAt(queueIndex)}
                        />
                        <GripVertical size={15} className="queue-grip" />
                        <Cover art={song.art} title={song.title} size={38} radius={9} />
                        <div className="queue-item-text">
                          <strong>{song.title}</strong>
                          <span>{song.artist}</span>
                        </div>
                        {song.duration ? (
                          <span className="queue-item-time">{formatTime(song.duration)}</span>
                        ) : null}
                        <button
                          type="button"
                          className="icon-btn icon-btn-sm queue-remove"
                          aria-label="Hapus dari antrean"
                          onClick={() => removeFromQueue(queueIndex)}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {played.length > 0 && (
              <>
                <div className="queue-section-label">Sudah diputar</div>
                <div className="queue-list played">
                  {played.map((song, offset) => (
                    <div
                      key={`${song.id}-${offset}`}
                      className="queue-item faded"
                    >
                      <button
                        type="button"
                        className="queue-item-open"
                        aria-label={`Putar ${song.title}`}
                        onClick={() => playAt(offset)}
                      />
                      <Cover art={song.art} title={song.title} size={34} radius={8} />
                      <div className="queue-item-text">
                        <strong>{song.title}</strong>
                        <span>{song.artist}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {!upNext.length && (
              <p className="queue-end">Akhir antrean · aktifkan ulangi atau acak untuk melanjutkan.</p>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
