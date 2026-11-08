import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Music2, RefreshCw } from 'lucide-react';
import { ToastProvider } from './context/ToastContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { RouteProvider, useRoute } from './context/RouteContext';
import { LibraryProvider } from './context/LibraryContext';
import { PlayerProvider, usePlayer, usePlayerProgress } from './context/PlayerContext';
import { UIProvider } from './context/UIContext';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { PlayerBar } from './components/PlayerBar';
import { MobileNav } from './components/MobileNav';
import { QueuePanel } from './components/QueuePanel';
import { NowPlaying } from './components/NowPlaying';
import { AddToPlaylistDialog, PlaylistFormDialog } from './components/PlaylistDialogs';
import { Home } from './pages/Home';
import { Playlists } from './pages/Playlists';
import { PlaylistView } from './pages/PlaylistView';
import { Favorites } from './pages/Favorites';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { artUrl } from './lib/api';
import { buildPalette, applyTheme, extractDominantColor } from './lib/theme';

function Splash({ error }) {
  return (
    <div className="splash">
      <div className="splash-mark">
        {error ? <AlertTriangle size={34} /> : <Music2 size={34} />}
      </div>
      <h1>Metronux</h1>
      {error ? (
        <>
          <p className="splash-error">Aplikasi tidak dapat dimuat.</p>
          <p className="splash-detail">{error}</p>
          <button type="button" className="btn btn-filled" onClick={() => window.location.reload()}>
            <RefreshCw size={17} />
            Coba lagi
          </button>
        </>
      ) : (
        <>
          <p>Menyiapkan tema dan pustaka streaming…</p>
          <span className="splash-loader" />
        </>
      )}
    </div>
  );
}

function RootGate({ children }) {
  const { ready, settings, info, error } = useSettings();
  if (error) return <Splash error={error} />;
  if (!ready || !settings || !info) return <Splash />;
  return children;
}

function ThemeManager() {
  const { settings, info, systemDark } = useSettings();
  const { currentSong } = usePlayer();
  const [artSeed, setArtSeed] = useState(null);

  const dark =
    settings.themeMode === 'system' ? !!systemDark : settings.themeMode !== 'light';

  useEffect(() => {
    if (settings.seedMode !== 'art') return undefined;
    let cancelled = false;
    const source = currentSong?.art ? artUrl(currentSong.art) : null;
    extractDominantColor(source).then((color) => {
      if (!cancelled) setArtSeed(color);
    });
    return () => {
      cancelled = true;
    };
  }, [settings.seedMode, currentSong?.art]);

  const seed = useMemo(() => {
    if (settings.seedMode === 'custom') return settings.seedColor || '#6750A4';
    if (settings.seedMode === 'art') {
      return artSeed || settings.seedColor || info.systemAccent || '#6750A4';
    }
    return info.systemAccent || '#6750A4';
  }, [settings.seedMode, settings.seedColor, artSeed, info.systemAccent]);

  const palette = useMemo(() => buildPalette(seed, dark), [seed, dark]);

  useEffect(() => {
    applyTheme(palette, {
      style: settings.themeStyle,
      dark,
      reducedMotion: !!settings.reduceMotion,
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', palette.surface);
  }, [palette, dark, settings.themeStyle, settings.reduceMotion]);

  return null;
}

const PAGES = {
  home: Home,
  playlists: Playlists,
  playlist: PlaylistView,
  favorites: Favorites,
  search: Search,
  streaming: Search,
  settings: Settings,
};

function NotFound() {
  const { navigate } = useRoute();
  return (
    <div className="page">
      <div className="empty-state">
        <div className="empty-icon">
          <Music2 size={32} />
        </div>
        <h3>Halaman tidak ditemukan</h3>
        <p>Alamat ini tidak tersedia di Metronux.</p>
        <button type="button" className="btn btn-filled" onClick={() => navigate('/home')}>
          Kembali ke beranda
        </button>
      </div>
    </div>
  );
}

function useKeyboardShortcuts() {
  const {
    togglePlay,
    seek,
    next,
    previous,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    toggleQueue,
    openNowPlaying,
    closeNowPlaying,
    closeQueue,
    nowPlayingOpen,
    queueOpen,
  } = usePlayer();
  const { position } = usePlayerProgress();
  const { navigate } = useRoute();

  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (event.key === 'Escape') {
        if (nowPlayingOpen) closeNowPlaying();
        if (queueOpen) closeQueue();
        return;
      }

      if (isTyping) return;
      if (event.altKey || event.metaKey) return;

      if (event.ctrlKey) {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          next();
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          previous();
        }
        return;
      }

      switch (event.key) {
        case ' ':
          event.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          event.preventDefault();
          seek(position + 5);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          seek(position - 5);
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 's':
        case 'S':
          toggleShuffle();
          break;
        case 'r':
        case 'R':
          cycleRepeat();
          break;
        case 'q':
        case 'Q':
          toggleQueue();
          break;
        case 'l':
        case 'L':
          openNowPlaying();
          break;
        case '/':
          event.preventDefault();
          navigate('/search');
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    togglePlay,
    seek,
    next,
    previous,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    toggleQueue,
    openNowPlaying,
    closeNowPlaying,
    closeQueue,
    nowPlayingOpen,
    queueOpen,
    navigate,
    position,
  ]);
}

function Shell() {
  const { route } = useRoute();
  const Page = PAGES[route.view] || NotFound;
  useKeyboardShortcuts();

  return (
    <div className="app-shell">
      <div className="app-body">
        <Sidebar />
        <div className="app-main">
          <TopBar />
          <main className="content" key={route.path}>
            <Page />
          </main>
        </div>
      </div>
      <PlayerBar />
      <MobileNav />
      <QueuePanel />
      <NowPlaying />
      <PlaylistFormDialog />
      <AddToPlaylistDialog />
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <RouteProvider>
          <RootGate>
            <LibraryProvider>
              <PlayerProvider>
                <UIProvider>
                  <ThemeManager />
                  <Shell />
                </UIProvider>
              </PlayerProvider>
            </LibraryProvider>
          </RootGate>
        </RouteProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}
