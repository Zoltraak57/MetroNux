import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, artUrl, streamUrl } from '../lib/api';
import { EQ_FREQUENCIES } from '../lib/equalizer';
import { useLibrary } from './LibraryContext';
import { useSettings } from './SettingsContext';
import { useToast } from './ToastContext';

const PlayerActionsContext = createContext(null);
const PlayerProgressContext = createContext(null);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function PlayerProvider({ children }) {
  const { settings } = useSettings();
  const { recordPlay } = useLibrary();
  const { toast } = useToast();

  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(-1);
  const [source, setSource] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(() => {
    const saved = Number(localStorage.getItem('mntx.volume'));
    return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 0.85;
  });
  const [muted, setMutedState] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off');
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [sleepEndsAt, setSleepEndsAt] = useState(null);
  const [sleepRemaining, setSleepRemaining] = useState(0);

  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);

  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const indexRef = useRef(-1);
  const repeatRef = useRef('off');
  const shuffleRef = useRef(false);
  const shouldPlayRef = useRef(false);
  const playingRef = useRef(false);
  const currentSongRef = useRef(null);
  const shuffleHistoryRef = useRef([]);
  const lastRecordedRef = useRef(null);
  const graphRef = useRef(null);
  const settingsRef = useRef(settings);
  const recordPlayRef = useRef(recordPlay);
  const actionsRef = useRef(null);
  const lastPositionUpdateRef = useRef(0);

  settingsRef.current = settings;
  recordPlayRef.current = recordPlay;

  const currentSong = index >= 0 ? queue[index] || null : null;
  currentSongRef.current = currentSong;

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);

  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);

  const updateQueueState = useCallback((next) => {
    queueRef.current = next;
    setQueue(next);
  }, []);

  const updateIndex = useCallback((next) => {
    indexRef.current = next;
    setIndex(next);
  }, []);

  const ensureGraph = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.ctx.resume().catch(() => {});
      return graphRef.current;
    }
    const audio = audioRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!audio || !Ctx) return null;
    try {
      const ctx = new Ctx();
      const sourceNode = ctx.createMediaElementSource(audio);
      const filters = EQ_FREQUENCIES.map((freq) => {
        const filter = ctx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1;
        filter.gain.value = 0;
        return filter;
      });
      sourceNode.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i += 1) filters[i].connect(filters[i + 1]);
      filters[filters.length - 1].connect(ctx.destination);
      graphRef.current = { ctx, source: sourceNode, filters };
      ctx.resume().catch(() => {});
      return graphRef.current;
    } catch {
      return null;
    }
  }, []);

  const ensureGraphIfNeeded = useCallback(() => {
    if (!settingsRef.current?.equalizer?.enabled) return;
    ensureGraph();
  }, [ensureGraph]);

  const applyEqualizer = useCallback(() => {
    const eq = settingsRef.current?.equalizer;
    if (!eq?.enabled) {
      if (graphRef.current) {
        for (const filter of graphRef.current.filters) filter.gain.value = 0;
      }
      return;
    }
    const graph = ensureGraph();
    if (!graph) return;
    const gains = eq.gains || [0, 0, 0, 0, 0];
    graph.filters.forEach((filter, i) => {
      filter.gain.value = clamp(Number(gains[i]) || 0, -12, 12);
    });
  }, [ensureGraph]);

  useEffect(() => {
    applyEqualizer();
  }, [settings?.equalizer, applyEqualizer]);

  const playAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.ended) audio.currentTime = 0;
    ensureGraphIfNeeded();
    audio.play().catch((err) => {
      if (err?.name !== 'AbortError') {
        toast('Tidak bisa memutar lagu ini. Coba lagi.', 'error');
      }
      shouldPlayRef.current = false;
      setPlaying(false);
    });
  }, [ensureGraphIfNeeded, toast]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentSong) {
      audio.pause();
      delete audio.dataset.songId;
      audio.removeAttribute('src');
      audio.load();
      setPosition(0);
      setDuration(0);
      setBuffered(0);
      return;
    }
    if (audio.dataset.songId === currentSong.id) return;

    audio.dataset.songId = currentSong.id;
    audio.src = streamUrl(currentSong.videoId);
    audio.load();
    setPosition(0);
    setDuration(currentSong.duration || 0);
    setBuffered(0);
    if (shouldPlayRef.current) playAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.id, playAudio]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    audio.volume = volume;
    audio.muted = muted;
    localStorage.setItem('mntx.volume', String(volume));
  }, [volume, muted]);

  const next = useCallback(
    (auto = false) => {
      const audio = audioRef.current;
      const list = queueRef.current;
      const i = indexRef.current;
      if (auto && repeatRef.current === 'one' && audio) {
        audio.currentTime = 0;
        shouldPlayRef.current = true;
        audio.play().catch(() => {});
        return;
      }
      if (!list.length) return;
      if (i < 0) {
        shouldPlayRef.current = true;
        updateIndex(0);
        return;
      }
      if (shuffleRef.current && list.length > 1) {
        let candidate = i;
        let attempts = 0;
        do {
          candidate = Math.floor(Math.random() * list.length);
          attempts += 1;
        } while (candidate === i && attempts < 15);
        shuffleHistoryRef.current.push(i);
        if (shuffleHistoryRef.current.length > 200) shuffleHistoryRef.current.shift();
        shouldPlayRef.current = true;
        updateIndex(candidate);
        return;
      }
      if (i + 1 < list.length) {
        shouldPlayRef.current = true;
        updateIndex(i + 1);
        return;
      }
      if (repeatRef.current === 'all') {
        shouldPlayRef.current = true;
        updateIndex(0);
        return;
      }
      if (auto) {
        shouldPlayRef.current = false;
        setPlaying(false);
      }
    },
    [updateIndex]
  );

  const previous = useCallback(() => {
    const audio = audioRef.current;
    const list = queueRef.current;
    const i = indexRef.current;
    if (!list.length) return;
    if (audio && audio.currentTime > 3.5) {
      audio.currentTime = 0;
      return;
    }
    if (shuffleRef.current && shuffleHistoryRef.current.length) {
      const prev = shuffleHistoryRef.current.pop();
      shouldPlayRef.current = true;
      updateIndex(prev);
      return;
    }
    if (i > 0) {
      shouldPlayRef.current = true;
      updateIndex(i - 1);
      return;
    }
    if (repeatRef.current === 'all') {
      shouldPlayRef.current = true;
      updateIndex(list.length - 1);
      return;
    }
    if (audio) audio.currentTime = 0;
  }, [updateIndex]);

  const endedRef = useRef(() => {});
  endedRef.current = () => next(true);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const onTimeUpdate = () => {
      setPosition(audio.currentTime || 0);
      const now = Date.now();
      if (now - lastPositionUpdateRef.current > 900 && 'mediaSession' in navigator) {
        lastPositionUpdateRef.current = now;
        const d = Number.isFinite(audio.duration) ? audio.duration : 0;
        if (d > 0 && navigator.mediaSession.setPositionState) {
          try {
            navigator.mediaSession.setPositionState({
              duration: d,
              playbackRate: audio.playbackRate || 1,
              position: clamp(audio.currentTime || 0, 0, d),
            });
          } catch {}
        }
      }
    };
    const onDurationChange = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onProgress = () => {
      if (audio.buffered.length) {
        setBuffered(audio.buffered.end(audio.buffered.length - 1));
      }
    };
    const onPlay = () => {
      playingRef.current = true;
      shouldPlayRef.current = true;
      setPlaying(true);
      const song = currentSongRef.current;
      if (song && lastRecordedRef.current !== song.id) {
        lastRecordedRef.current = song.id;
        recordPlayRef.current?.(song);
      }
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      audio.volume = volume;
    };
    const onPause = () => {
      playingRef.current = false;
      setPlaying(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    };
    const onEnded = () => endedRef.current();
    const onError = () => {
      if (!audio.src) return;
      toast('Gagal memutar lagu ini. Coba lagu lain.', 'error');
      shouldPlayRef.current = false;
      setPlaying(false);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('loadedmetadata', onDurationChange);
    audio.addEventListener('progress', onProgress);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('loadedmetadata', onDurationChange);
      audio.removeEventListener('progress', onProgress);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [toast, volume]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    const list = queueRef.current;
    if (!list.length) return;
    if (indexRef.current < 0) {
      shouldPlayRef.current = true;
      updateIndex(0);
      return;
    }
    if (!audio) return;
    if (audio.paused) {
      shouldPlayRef.current = true;
      playAudio();
    } else {
      shouldPlayRef.current = false;
      audio.pause();
    }
  }, [playAudio, updateIndex]);

  const playSongs = useCallback(
    (songs, startIndex = 0, sourceInfo = null) => {
      if (!songs || !songs.length) return;
      const list = [...songs];
      const start = clamp(Number(startIndex) || 0, 0, list.length - 1);
      const sameSong = audioRef.current?.dataset.songId === list[start].id;
      shouldPlayRef.current = true;
      shuffleHistoryRef.current = [];
      updateQueueState(list);
      updateIndex(start);
      setSource(sourceInfo || null);
      setQueueOpen(false);
      if (sameSong) {
        ensureGraphIfNeeded();
        if (audioRef.current?.paused) playAudio();
      }
    },
    [ensureGraphIfNeeded, playAudio, updateIndex, updateQueueState]
  );

  const playAt = useCallback(
    (queueIndex) => {
      const list = queueRef.current;
      if (queueIndex < 0 || queueIndex >= list.length) return;
      setQueueOpen(false);
      if (queueIndex === indexRef.current) {
        togglePlay();
        return;
      }
      shouldPlayRef.current = true;
      updateIndex(queueIndex);
    },
    [togglePlay, updateIndex]
  );

  const seek = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : 0;
    const target = clamp(Number(seconds) || 0, 0, max || Number(seconds) || 0);
    try {
      audio.currentTime = target;
      setPosition(target);
    } catch {}
  }, []);

  const setVolume = useCallback((value) => {
    const nextVolume = clamp(Number(value) || 0, 0, 1);
    setVolumeState(nextVolume);
    if (nextVolume > 0) setMutedState(false);
  }, []);

  const toggleMute = useCallback(() => {
    setMutedState((prev) => !prev);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => {
      if (!prev) shuffleHistoryRef.current = [];
      return !prev;
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
  }, []);

  const addToQueue = useCallback(
    (songs, { next: playNext = false } = {}) => {
      const items = (Array.isArray(songs) ? songs : [songs]).filter(Boolean);
      if (!items.length) return;
      const list = queueRef.current;
      if (!list.length) {
        playSongs(items, 0, { type: 'queue', name: 'Antrean' });
        toast(`${items.length} lagu ditambahkan ke antrean`, 'success');
        return;
      }
      const copy = [...list];
      if (playNext) {
        copy.splice(indexRef.current + 1, 0, ...items);
      } else {
        copy.push(...items);
      }
      updateQueueState(copy);
      toast(
        playNext ? 'Diputar berikutnya' : `${items.length} lagu ditambahkan ke antrean`,
        'success'
      );
    },
    [playSongs, toast, updateQueueState]
  );

  const removeFromQueue = useCallback(
    (queueIndex) => {
      const list = [...queueRef.current];
      if (queueIndex < 0 || queueIndex >= list.length) return;
      list.splice(queueIndex, 1);
      if (!list.length) {
        shouldPlayRef.current = false;
        audioRef.current?.pause();
        updateQueueState([]);
        updateIndex(-1);
        setSource(null);
        return;
      }
      let nextIndex = indexRef.current;
      if (queueIndex < indexRef.current) nextIndex = indexRef.current - 1;
      else if (queueIndex === indexRef.current) nextIndex = Math.min(queueIndex, list.length - 1);
      updateQueueState(list);
      updateIndex(nextIndex);
      if (queueIndex === indexRef.current) shouldPlayRef.current = true;
    },
    [updateIndex, updateQueueState]
  );

  const moveInQueue = useCallback(
    (from, to) => {
      const list = [...queueRef.current];
      if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      let nextIndex = indexRef.current;
      if (from === nextIndex) nextIndex = to;
      else if (from < nextIndex && to >= nextIndex) nextIndex -= 1;
      else if (from > nextIndex && to <= nextIndex) nextIndex += 1;
      updateQueueState(list);
      updateIndex(nextIndex);
    },
    [updateIndex, updateQueueState]
  );

  const clearQueue = useCallback(() => {
    shouldPlayRef.current = false;
    audioRef.current?.pause();
    updateQueueState([]);
    updateIndex(-1);
    setSource(null);
    setQueueOpen(false);
    setNowPlayingOpen(false);
  }, [updateIndex, updateQueueState]);

  const stop = useCallback(() => {
    shouldPlayRef.current = false;
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const setSleepTimer = useCallback((minutes) => {
    if (!minutes) {
      setSleepEndsAt(null);
      setSleepRemaining(0);
      return;
    }
    setSleepEndsAt(Date.now() + minutes * 60000);
  }, []);

  useEffect(() => {
    if (!sleepEndsAt) return undefined;
    const tick = () => {
      const remaining = sleepEndsAt - Date.now();
      if (remaining <= 0) {
        shouldPlayRef.current = false;
        audioRef.current?.pause();
        setSleepEndsAt(null);
        setSleepRemaining(0);
        toast('Timer tidur selesai. Pemutaran dijeda.', 'info');
      } else {
        setSleepRemaining(remaining);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [sleepEndsAt, toast]);

  const openNowPlaying = useCallback(() => {
    setNowPlayingOpen(true);
    setQueueOpen(false);
  }, []);
  const closeNowPlaying = useCallback(() => setNowPlayingOpen(false), []);
  const toggleNowPlaying = useCallback(() => {
    setNowPlayingOpen((prev) => !prev);
    setQueueOpen(false);
  }, []);
  const openQueue = useCallback(() => {
    setQueueOpen(true);
    setNowPlayingOpen(false);
  }, []);
  const closeQueue = useCallback(() => setQueueOpen(false), []);
  const toggleQueue = useCallback(() => {
    setQueueOpen((prev) => !prev);
    setNowPlayingOpen(false);
  }, []);

  useEffect(() => {
    if (!currentSong || !('mediaSession' in navigator)) return;
    const art = currentSong.art ? artUrl(currentSong.art) : null;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.artist,
      album: currentSong.album,
      artwork: art ? [{ src: art, sizes: '512x512' }] : [],
    });
  }, [currentSong]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return undefined;
    const handlers = {
      play: () => {
        shouldPlayRef.current = true;
        playAudio();
      },
      pause: () => {
        shouldPlayRef.current = false;
        audioRef.current?.pause();
      },
      nexttrack: () => next(false),
      previoustrack: () => previous(),
      stop: () => stop(),
      seekto: (details) => {
        if (typeof details.seekTime === 'number') seek(details.seekTime);
      },
      seekbackward: (details) => seek((audioRef.current?.currentTime || 0) - (details.seekOffset || 10)),
      seekforward: (details) => seek((audioRef.current?.currentTime || 0) + (details.seekOffset || 10)),
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    }
    return () => {
      for (const action of Object.keys(handlers)) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {}
      }
    };
  }, [next, playAudio, previous, seek, stop]);

  useEffect(() => {
    if (!window.mntx) return undefined;
    return api.onMediaCommand((command) => {
      if (command === 'toggle') togglePlay();
      else if (command === 'next') next(false);
      else if (command === 'previous') previous();
      else if (command === 'stop') stop();
    });
  }, [next, previous, stop, togglePlay]);

  const actionsValue = useMemo(
    () => ({
      queue,
      currentSong,
      index,
      source,
      playing,
      volume,
      muted,
      shuffle,
      repeat,
      nowPlayingOpen,
      queueOpen,
      sleepEndsAt,
      sleepRemaining,
      playSongs,
      playAt,
      togglePlay,
      next: () => next(false),
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      addToQueue,
      removeFromQueue,
      moveInQueue,
      clearQueue,
      stop,
      setSleepTimer,
      openNowPlaying,
      closeNowPlaying,
      toggleNowPlaying,
      openQueue,
      closeQueue,
      toggleQueue,
    }),
    [
      queue,
      currentSong,
      index,
      source,
      playing,
      volume,
      muted,
      shuffle,
      repeat,
      nowPlayingOpen,
      queueOpen,
      sleepEndsAt,
      sleepRemaining,
      playSongs,
      playAt,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      addToQueue,
      removeFromQueue,
      moveInQueue,
      clearQueue,
      stop,
      setSleepTimer,
      openNowPlaying,
      closeNowPlaying,
      toggleNowPlaying,
      openQueue,
      closeQueue,
      toggleQueue,
    ]
  );

  const progressValue = useMemo(
    () => ({ position, duration, buffered, seek }),
    [position, duration, buffered, seek]
  );

  actionsRef.current = actionsValue;

  return (
    <PlayerActionsContext.Provider value={actionsValue}>
      <PlayerProgressContext.Provider value={progressValue}>
        {children}
        <audio
          ref={audioRef}
          crossOrigin="anonymous"
          preload="auto"
          style={{ display: 'none' }}
        />
      </PlayerProgressContext.Provider>
    </PlayerActionsContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerActionsContext);
  if (!ctx) throw new Error('usePlayer harus dipakai di dalam PlayerProvider');
  return ctx;
}

export function usePlayerProgress() {
  const ctx = useContext(PlayerProgressContext);
  if (!ctx) throw new Error('usePlayerProgress harus dipakai di dalam PlayerProvider');
  return ctx;
}
