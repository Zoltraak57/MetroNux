'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const GNOME_ACCENTS = {
  blue: '#3584e4',
  teal: '#2190a4',
  green: '#3a944a',
  yellow: '#c88800',
  orange: '#ed7b00',
  red: '#d3303b',
  pink: '#d56199',
  purple: '#9141ac',
  slate: '#6f8396',
  sand: '#c0a67a',
};

function normalizeHex(value) {
  const v = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return '#' + v.slice(1).split('').map((c) => c + c).join('').toLowerCase();
  }
  const rgb = /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/.exec(v);
  if (rgb) {
    return (
      '#' +
      rgb
        .slice(1)
        .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0'))
        .join('')
    );
  }
  const hex = /^([0-9a-f]{6})$/i.exec(v);
  if (hex) return `#${hex[1].toLowerCase()}`;
  return null;
}

async function getSystemAccent() {
  try {
    const { stdout } = await execFileAsync('gsettings', [
      'get',
      'org.gnome.desktop.interface',
      'accent-color',
    ]);
    const name = stdout.trim().replace(/['"]/g, '').toLowerCase();
    if (GNOME_ACCENTS[name]) return GNOME_ACCENTS[name];
  } catch {}

  try {
    const { stdout } = await execFileAsync('kreadconfig6', [
      '--file',
      'kdeglobals',
      '--group',
      'General',
      '--key',
      'AccentColor',
    ]);
    const hex = normalizeHex(stdout.trim());
    if (hex) return hex;
  } catch {}

  try {
    const { stdout } = await execFileAsync('gsettings', [
      'get',
      'org.gnome.desktop.interface',
      'gtk-theme',
    ]);
    const theme = stdout.trim().toLowerCase();
    if (theme.includes('yaru')) return '#e95420';
    if (theme.includes('mint')) return '#9aca3c';
  } catch {}

  try {
    const kdeglobals = await fsp.readFile(
      path.join(os.homedir(), '.config', 'kdeglobals'),
      'utf8'
    );
    const match = /^AccentColor=([^\n]+)$/m.exec(kdeglobals);
    const hex = match ? normalizeHex(match[1]) : null;
    if (hex) return hex;
  } catch {}

  return '#6750A4';
}

const IMAGE_EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

async function cacheRemoteImage(url, artDir) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('URL gambar tidak valid');
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Hanya gambar http/https yang didukung');
  const res = await fetch(parsed.toString(), {
    headers: {
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      accept: 'image/*',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Gagal mengunduh gambar (HTTP ${res.status})`);
  const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_EXT_BY_MIME[mime];
  if (!ext) throw new Error('Format gambar tidak didukung');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > 12 * 1024 * 1024) throw new Error('Gambar terlalu besar');
  if (!buffer.length) throw new Error('Gambar kosong');
  const filename = `${crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 24)}.${ext}`;
  const dest = path.join(artDir, filename);
  try {
    await fsp.access(dest);
  } catch {
    await fsp.mkdir(artDir, { recursive: true });
    await fsp.writeFile(dest, buffer);
  }
  return filename;
}

function existsSyncSafe(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

module.exports = { getSystemAccent, normalizeHex, cacheRemoteImage, existsSyncSafe };
