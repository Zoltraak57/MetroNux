import { argbFromHex, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities';

const colorCache = new Map();

function kebab(key) {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

export function hexToRgb(hex) {
  const value = String(hex || '').replace('#', '');
  if (value.length !== 6) return { r: 103, g: 80, b: 164 };
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

export function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
      .join('')
  );
}

export function isValidHex(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || ''));
}

export function buildPalette(seedHex, dark) {
  const safeSeed = isValidHex(seedHex) ? seedHex : '#6750A4';
  const theme = themeFromSourceColor(argbFromHex(safeSeed));
  const scheme = dark ? theme.schemes.dark : theme.schemes.light;
  const neutral = theme.palettes.neutral;
  const tone = (t) => hexFromArgb(neutral.tone(t));
  const containers = dark
    ? { lowest: 4, low: 10, container: 12, high: 17, highest: 22, dim: 6, bright: 24 }
    : { lowest: 100, low: 96, container: 94, high: 92, highest: 90, dim: 87, bright: 98 };

  const s = scheme;
  const h = (argb) => hexFromArgb(argb);

  return {
    primary: h(s.primary),
    onPrimary: h(s.onPrimary),
    primaryContainer: h(s.primaryContainer),
    onPrimaryContainer: h(s.onPrimaryContainer),
    secondary: h(s.secondary),
    onSecondary: h(s.onSecondary),
    secondaryContainer: h(s.secondaryContainer),
    onSecondaryContainer: h(s.onSecondaryContainer),
    tertiary: h(s.tertiary),
    onTertiary: h(s.onTertiary),
    tertiaryContainer: h(s.tertiaryContainer),
    onTertiaryContainer: h(s.onTertiaryContainer),
    error: h(s.error),
    onError: h(s.onError),
    errorContainer: h(s.errorContainer),
    onErrorContainer: h(s.onErrorContainer),
    background: h(s.background),
    onBackground: h(s.onBackground),
    surface: h(s.surface),
    onSurface: h(s.onSurface),
    surfaceVariant: h(s.surfaceVariant),
    onSurfaceVariant: h(s.onSurfaceVariant),
    outline: h(s.outline),
    outlineVariant: h(s.outlineVariant),
    inverseSurface: h(s.inverseSurface),
    inverseOnSurface: h(s.inverseOnSurface),
    inversePrimary: h(s.inversePrimary),
    surfaceTint: h(s.primary),
    surfaceLowest: tone(containers.lowest),
    surfaceLow: tone(containers.low),
    surfaceContainer: tone(containers.container),
    surfaceHigh: tone(containers.high),
    surfaceHighest: tone(containers.highest),
    surfaceDim: tone(containers.dim),
    surfaceBright: tone(containers.bright),
    seed: safeSeed,
  };
}

export function applyTheme(theme, { style, dark, reducedMotion }) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme)) {
    if (key === 'seed') continue;
    root.style.setProperty(`--${kebab(key)}`, value);
  }
  for (const key of ['primary', 'surface', 'secondary', 'tertiary']) {
    const { r, g, b } = hexToRgb(theme[key]);
    root.style.setProperty(`--${key}-rgb`, `${r}, ${g}, ${b}`);
  }
  root.style.setProperty('--seed', theme.seed);
  root.classList.toggle('dark', !!dark);
  root.dataset.style = style === 'glass' ? 'glass' : 'material';
  root.dataset.motion = reducedMotion ? 'reduced' : 'full';
  root.style.colorScheme = dark ? 'dark' : 'light';
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/**
 * Mengambil warna dominan yang cukup hidup dari sebuah gambar (album art).
 * Hasilnya dipakai sebagai "seed" Material You, seperti dynamic color Android.
 */
export function extractDominantColor(url) {
  if (!url) return Promise.resolve(null);
  if (colorCache.has(url)) return Promise.resolve(colorCache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (value) colorCache.set(url, value);
      resolve(value);
    };
    img.onload = () => {
      try {
        const size = 40;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const buckets = Array.from({ length: 12 }, () => ({
          weight: 0,
          r: 0,
          g: 0,
          b: 0,
        }));
        let totalWeight = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 140) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const { h, s, v } = rgbToHsv(r, g, b);
          if (v < 0.12) continue;
          if (v > 0.96 && s < 0.1) continue;
          const weight = Math.pow(s, 1.7) * (0.28 + v * 0.72);
          if (weight <= 0.015) continue;
          const bucket = buckets[Math.min(11, Math.floor(h / 30))];
          bucket.weight += weight;
          bucket.r += r * weight;
          bucket.g += g * weight;
          bucket.b += b * weight;
          totalWeight += weight;
        }
        if (totalWeight <= 0) {
          finish(null);
          return;
        }
        let best = buckets[0];
        for (const bucket of buckets) if (bucket.weight > best.weight) best = bucket;
        if (!best.weight) {
          finish(null);
          return;
        }
        const color = rgbToHex(best.r / best.weight, best.g / best.weight, best.b / best.weight);
        const hsv = rgbToHsv(
          parseInt(color.slice(1, 3), 16),
          parseInt(color.slice(3, 5), 16),
          parseInt(color.slice(5, 7), 16)
        );
        if (hsv.s < 0.12) {
          finish(null);
          return;
        }
        finish(color);
      } catch {
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    setTimeout(() => finish(null), 8000);
    img.src = url;
  });
}
