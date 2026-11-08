import { Heart, House, ListMusic, Search, Settings } from 'lucide-react';
import { useRoute } from '../context/RouteContext';

const ITEMS = [
  { view: 'home', label: 'Beranda', path: '/home', icon: House },
  { view: 'search', label: 'Cari', path: '/search', icon: Search },
  { view: 'favorites', label: 'Disukai', path: '/favorites', icon: Heart },
  { view: 'playlists', label: 'Playlist', path: '/playlists', icon: ListMusic },
  { view: 'settings', label: 'Setelan', path: '/settings', icon: Settings },
];

export function MobileNav() {
  const { route, navigate } = useRoute();

  return (
    <nav className="mobile-nav" aria-label="Navigasi utama">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active =
          route.view === item.view ||
          (item.view === 'search' && route.view === 'streaming') ||
          (item.view === 'playlists' && route.view === 'playlist');
        return (
          <button
            key={item.path}
            type="button"
            className={`mobile-nav-item ${active ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={20} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
