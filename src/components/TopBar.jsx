import { ChevronLeft, ChevronRight, Moon, Search, Sun } from 'lucide-react';
import { useRoute } from '../context/RouteContext';
import { useSettings } from '../context/SettingsContext';

const TITLES = {
  home: 'Beranda',
  search: 'Pencarian',
  streaming: 'Pencarian',
  playlists: 'Playlist',
  playlist: 'Playlist',
  favorites: 'Lagu Disukai',
  settings: 'Pengaturan',
};

export function TopBar() {
  const { route, navigate } = useRoute();
  const { settings, systemDark, updateSettings } = useSettings();

  const effectiveDark = settings?.themeMode === 'system' ? systemDark : settings?.themeMode !== 'light';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="history-buttons">
          <button type="button" className="icon-btn icon-btn-sm" aria-label="Kembali" onClick={() => window.history.back()}>
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-label="Maju"
            onClick={() => window.history.forward()}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <span className="topbar-title">{TITLES[route.view] || 'Metronux'}</span>
      </div>

      <button type="button" className="topbar-search" onClick={() => navigate('/search')}>
        <Search size={17} />
        <span>Cari lagu, artis, album…</span>
        <kbd>/</kbd>
      </button>

      <div className="topbar-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label={effectiveDark ? 'Ubah ke tema terang' : 'Ubah ke tema gelap'}
          title={effectiveDark ? 'Tema terang' : 'Tema gelap'}
          onClick={() => updateSettings({ themeMode: effectiveDark ? 'light' : 'dark' })}
        >
          {effectiveDark ? <Sun size={19} /> : <Moon size={19} />}
        </button>
      </div>
    </header>
  );
}
