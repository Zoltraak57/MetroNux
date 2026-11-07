import {
  Heart,
  Layers,
  ListMusic,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  House,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { PlaylistCover } from './Cover';
import { useLibrary } from '../context/LibraryContext';
import { useRoute } from '../context/RouteContext';
import { useSettings } from '../context/SettingsContext';
import { useUI } from '../context/UIContext';

function NavItem({ icon: Icon, label, path, active, onClick, compact, badge }) {
  return (
    <button
      type="button"
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={onClick}
      title={compact ? label : undefined}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={20} />
      {!compact && <span>{label}</span>}
      {!compact && badge ? <span className="nav-badge">{badge}</span> : null}
    </button>
  );
}

export function Sidebar() {
  const { playlists, favorites } = useLibrary();
  const { route, navigate } = useRoute();
  const { settings, info, updateSettings } = useSettings();
  const { openCreatePlaylist } = useUI();
  const compact = !!settings?.sidebarCompact;
  const glass = settings?.themeStyle === 'glass';

  return (
    <aside className={`sidebar ${compact ? 'compact' : ''}`}>
      <button type="button" className="brand" onClick={() => navigate('/home')}>
        <BrandMark />
        {!compact && (
          <span className="brand-text">
            <strong>Metronux</strong>
            <small>Streaming musik</small>
          </span>
        )}
      </button>

      <nav className="sidebar-nav">
        <NavItem
          icon={House}
          label="Beranda"
          active={route.view === 'home'}
          onClick={() => navigate('/home')}
          compact={compact}
        />
        <NavItem
          icon={Search}
          label="Cari"
          active={route.view === 'search' || route.view === 'streaming'}
          onClick={() => navigate('/search')}
          compact={compact}
        />
        <NavItem
          icon={Heart}
          label="Lagu Disukai"
          active={route.view === 'favorites'}
          onClick={() => navigate('/favorites')}
          compact={compact}
          badge={favorites.length || undefined}
        />
      </nav>

      {!compact && (
        <div className="sidebar-playlists">
          <div className="sidebar-section-head">
            <span>Playlist</span>
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              title="Buat playlist"
              aria-label="Buat playlist"
              onClick={() => openCreatePlaylist()}
            >
              <Plus size={17} />
            </button>
          </div>
          <div className="sidebar-playlist-list">
            {playlists.length === 0 && (
              <p className="sidebar-hint">Belum ada playlist. Buat satu untuk menyimpan lagu dari pencarian.</p>
            )}
            {playlists.slice(0, 40).map((playlist) => {
              const tracks = playlist.tracks || [];
              return (
                <button
                  type="button"
                  key={playlist.id}
                  className={`sidebar-playlist ${route.view === 'playlist' && route.id === playlist.id ? 'active' : ''}`}
                  onClick={() => navigate(`/playlist/${playlist.id}`)}
                  title={playlist.name}
                >
                  <PlaylistCover playlist={playlist} songs={tracks} size={30} radius={9} />
                  <span className="sidebar-playlist-text">
                    <strong>{playlist.name}</strong>
                    <small>{tracks.length} lagu</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        {!compact && (
          <div className="sidebar-theme" role="group" aria-label="Gaya tampilan">
            <span className="sidebar-theme-label">Gaya tampilan</span>
            <div className="sidebar-theme-switch">
              <button
                type="button"
                aria-pressed={!glass}
                onClick={() => updateSettings({ themeStyle: 'material' })}
                title="Material You"
              >
                <Palette size={14} />
                Material
              </button>
              <button
                type="button"
                aria-pressed={glass}
                onClick={() => updateSettings({ themeStyle: 'glass' })}
                title="Glassmorphism"
              >
                <Layers size={14} />
                Glass
              </button>
            </div>
          </div>
        )}
        <div className="sidebar-footer-actions">
          {compact && (
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              title={glass ? 'Matikan Glassmorphism' : 'Nyalakan Glassmorphism'}
              aria-label="Gaya tampilan"
              aria-pressed={glass}
              onClick={() => updateSettings({ themeStyle: glass ? 'material' : 'glass' })}
            >
              {glass ? <Palette size={18} /> : <Layers size={18} />}
            </button>
          )}
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            title="Pengaturan"
            aria-label="Pengaturan"
            onClick={() => navigate('/settings')}
          >
            <Settings size={18} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            title={compact ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            aria-label={compact ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            onClick={() => updateSettings({ sidebarCompact: !compact })}
          >
            {compact ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        {!compact && (
          <p className="sidebar-version">
            v{info?.version || '1.0'} · <ListMusic size={12} /> Streaming
          </p>
        )}
      </div>
    </aside>
  );
}
