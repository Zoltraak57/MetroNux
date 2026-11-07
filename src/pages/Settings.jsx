import { useState } from 'react';
import {
  Check,
  Database,
  Info,
  Layers,
  Monitor,
  Moon,
  Palette,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';
import { Segmented, Toggle } from '../components/ui';
import { useLibrary } from '../context/LibraryContext';
import { useSettings } from '../context/SettingsContext';
import { api } from '../lib/api';
import { EQ_LABELS, EQ_PRESETS, gainsForPreset } from '../lib/equalizer';

const ACCENTS = [
  '#6750A4',
  '#3584e4',
  '#2190a4',
  '#3a944a',
  '#c88800',
  '#ed7b00',
  '#d3303b',
  '#d56199',
  '#9141ac',
  '#8d6e63',
];

const SHORTCUTS = [
  ['Spasi', 'Putar / jeda'],
  ['← / →', 'Mundur / maju 5 detik'],
  ['Ctrl + ← / →', 'Lagu sebelumnya / berikutnya'],
  ['M', 'Bisukan suara'],
  ['S', 'Acak'],
  ['R', 'Ulangi'],
  ['Q', 'Buka antrean'],
  ['L', 'Tampilan sekarang diputar'],
  ['/', 'Cari'],
  ['Esc', 'Tutup panel'],
];

export function Settings() {
  const { settings, info, updateSettings } = useSettings();
  const { playlists, favorites, history } = useLibrary();

  const eq = settings.equalizer || { enabled: false, preset: 'flat', gains: [0, 0, 0, 0, 0] };

  const updateEq = (patch) => {
    updateSettings({ equalizer: { ...eq, ...patch } });
  };

  const setCustomColor = (hex) => {
    updateSettings({ seedMode: 'custom', seedColor: hex });
  };

  return (
    <div className="page settings-page">
      <header className="page-head">
        <div>
          <p className="page-kicker">Preferensi</p>
          <h1>Pengaturan</h1>
          <p className="page-sub">Sesuaikan tampilan, pemutaran, dan pustaka streaming.</p>
        </div>
      </header>

      <div className="settings-layout">
        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon"><Palette size={20} /></span>
            <div>
              <h2>Tampilan</h2>
              <p>Material You solid secara default. Glassmorphism bisa dinyalakan kapan saja.</p>
            </div>
          </div>

          <div className="setting-row stacked">
            <div>
              <strong>Gaya tampilan</strong>
              <span>
                Glassmorphism memberi efek kaca pada bilah pemutar, panel antrean, dan dialog.
                Material You tetap jadi default.
              </span>
            </div>
            <Segmented
              compact
              value={settings.themeStyle === 'glass' ? 'glass' : 'material'}
              onChange={(value) => updateSettings({ themeStyle: value })}
              options={[
                { value: 'material', label: 'Material You', icon: <Palette size={14} /> },
                { value: 'glass', label: 'Glassmorphism', icon: <Layers size={14} /> },
              ]}
            />
          </div>

          <div className="setting-row">
            <div>
              <strong>Mode warna</strong>
              <span>Gelap, terang, atau ikuti sistem.</span>
            </div>
            <Segmented
              compact
              value={settings.themeMode}
              onChange={(value) => updateSettings({ themeMode: value })}
              options={[
                { value: 'dark', label: 'Gelap', icon: <Moon size={14} /> },
                { value: 'light', label: 'Terang', icon: <Sun size={14} /> },
                { value: 'system', label: 'Sistem', icon: <Monitor size={14} /> },
              ]}
            />
          </div>

          <div className="setting-row stacked">
            <div>
              <strong>Sumber warna aksen</strong>
              <span>
                Material You dinamis dari wallpaper (aksen sistem), warna pilihan, atau sampul lagu.
              </span>
            </div>
            <Segmented
              compact
              value={settings.seedMode}
              onChange={(value) => updateSettings({ seedMode: value })}
              options={[
                { value: 'system', label: 'Sistem' },
                { value: 'custom', label: 'Kustom' },
                { value: 'art', label: 'Sampul' },
              ]}
            />
          </div>

          {settings.seedMode === 'system' && (
            <div className="setting-row sub">
              <div className="accent-current">
                <span className="color-dot" style={{ background: info?.systemAccent || '#6750A4' }} />
                <span>Aksen sistem terdeteksi: {info?.systemAccent || '#6750A4'}</span>
              </div>
              <span className="muted">Diambil dari GNOME/KDE</span>
            </div>
          )}

          {settings.seedMode === 'custom' && (
            <div className="color-picker-row">
              <div className="swatches">
                {ACCENTS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={`swatch ${settings.seedColor?.toLowerCase() === color ? 'active' : ''}`}
                    style={{ background: color }}
                    aria-label={`Warna ${color}`}
                    onClick={() => setCustomColor(color)}
                  >
                    {settings.seedColor?.toLowerCase() === color && <Check size={14} />}
                  </button>
                ))}
              </div>
              <label className="color-custom">
                <input
                  type="color"
                  value={settings.seedColor || '#6750A4'}
                  onChange={(event) => setCustomColor(event.target.value)}
                />
                <span>{settings.seedColor || '#6750A4'}</span>
              </label>
            </div>
          )}

          {settings.seedMode === 'art' && (
            <p className="setting-note">
              <Palette size={15} /> Warna tema akan mengikuti sampul lagu yang sedang diputar.
            </p>
          )}

          <div className="setting-row">
            <div>
              <strong>Kurangi animasi</strong>
              <span>Nonaktifkan transisi dan animasi agar lebih ringan.</span>
            </div>
            <Toggle
              checked={!!settings.reduceMotion}
              onChange={(value) => updateSettings({ reduceMotion: value })}
              label="Kurangi animasi"
            />
          </div>

          <div className="setting-row">
            <div>
              <strong>Sidebar ringkas</strong>
              <span>Tampilkan ikon saja untuk ruang layar lebih lega.</span>
            </div>
            <Toggle
              checked={!!settings.sidebarCompact}
              onChange={(value) => updateSettings({ sidebarCompact: value })}
              label="Sidebar ringkas"
            />
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon"><SlidersHorizontal size={20} /></span>
            <div>
              <h2>Pemutaran</h2>
              <p>Equalizer, lirik, dan perilaku pemutar.</p>
            </div>
          </div>

          <div className="setting-row">
            <div>
              <strong>Tampilkan lirik</strong>
              <span>Ambil lirik tersinkron dari LRCLIB saat membuka tampilan pemutar.</span>
            </div>
            <Toggle
              checked={settings.lyricsEnabled !== false}
              onChange={(value) => updateSettings({ lyricsEnabled: value })}
              label="Tampilkan lirik"
            />
          </div>

          <div className="setting-row">
            <div>
              <strong>Buka tab lirik otomatis</strong>
              <span>Tampilan “sekarang diputar” langsung membuka lirik.</span>
            </div>
            <Toggle
              checked={settings.showLyricsOnNowPlaying !== false}
              onChange={(value) => updateSettings({ showLyricsOnNowPlaying: value })}
              label="Buka tab lirik otomatis"
            />
          </div>

          <div className="eq-section">
            <div className="setting-row">
              <div>
                <strong>Equalizer</strong>
                <span>Lima band: {EQ_LABELS.join(' · ')}</span>
              </div>
              <Toggle
                checked={!!eq.enabled}
                onChange={(value) => updateEq({ enabled: value })}
                label="Aktifkan equalizer"
              />
            </div>

            <div className={`eq-controls ${eq.enabled ? '' : 'disabled'}`}>
              <div className="eq-presets">
                {Object.entries(EQ_PRESETS).map(([key, preset]) => (
                  <button
                    type="button"
                    key={key}
                    className={`chip ${eq.preset === key ? 'active' : ''}`}
                    onClick={() => updateEq({ preset: key, gains: gainsForPreset(key), enabled: true })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="eq-bands">
                {EQ_LABELS.map((label, index) => (
                  <label key={label} className="eq-band">
                    <span className="eq-gain">
                      {eq.gains[index] > 0 ? '+' : ''}
                      {eq.gains[index] || 0} dB
                    </span>
                    <input
                      type="range"
                      className="range eq-range"
                      min={-12}
                      max={12}
                      step={1}
                      value={eq.gains[index] ?? 0}
                      style={{ '--pct': `${((eq.gains[index] + 12) / 24) * 100}%` }}
                      onChange={(event) => {
                        const gains = [...(eq.gains || [0, 0, 0, 0, 0])];
                        gains[index] = Number(event.target.value);
                        updateEq({ gains, preset: 'custom', enabled: true });
                      }}
                    />
                    <span className="eq-label">{label}</span>
                  </label>
                ))}
              </div>
              <p className="setting-note">
                Equalizer berjalan di Web Audio API dan hanya memengaruhi pemutaran di Metronux.
              </p>
            </div>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon"><Database size={20} /></span>
            <div>
              <h2>Pustaka streaming</h2>
              <p>Playlist, lagu disukai, dan riwayat diputar tersimpan di perangkat ini.</p>
            </div>
          </div>
          <div className="stat-grid">
            <div>
              <strong>{playlists.length}</strong>
              <span>Playlist</span>
            </div>
            <div>
              <strong>{favorites.length}</strong>
              <span>Lagu disukai</span>
            </div>
            <div>
              <strong>{history.length}</strong>
              <span>Riwayat</span>
            </div>
          </div>
          <div className="settings-actions">
            <button type="button" className="btn btn-tonal" onClick={() => api.openDataFolder()}>
              <Database size={16} />
              Buka folder data
            </button>
          </div>
          <p className="setting-note">
            Audio tidak diunduh. Setiap lagu diputar langsung dari YouTube Music, dan metadata
            playlist hanya disimpan sebagai tautan.
          </p>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon"><Info size={20} /></span>
            <div>
              <h2>Tentang & pintasan</h2>
              <p>Metronux {info?.version || '1.0.0'} · Electron + React</p>
            </div>
          </div>
          <div className="about-grid">
            <div>
              <strong>Platform</strong>
              <span>Linux · {info?.platform || 'linux'}</span>
            </div>
            <div>
              <strong>Folder data</strong>
              <span className="mono" title={info?.dataDir}>{info?.dataDir}</span>
            </div>
            <div>
              <strong>Sumber musik</strong>
              <span>YouTube Music</span>
            </div>
            <div>
              <strong>Penyimpanan audio</strong>
              <span>Streaming, tanpa unduhan</span>
            </div>
          </div>
          <h3 className="shortcut-title">Pintasan keyboard</h3>
          <div className="shortcuts">
            {SHORTCUTS.map(([key, label]) => (
              <div key={key}>
                <kbd>{key}</kbd>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="setting-note">
            <Info size={14} /> Metronux memutar lagu langsung dari YouTube Music dan tidak
            menyimpan berkas audio di disk.
          </p>
        </section>
      </div>
    </div>
  );
}
