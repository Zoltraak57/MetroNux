'use strict';

/**
 * Menyiapkan berkas Android: UI React, backend Node, dan dependensi runtime
 * yang disalin ke assets/nodejs-project agar APK bisa berjalan tanpa npm.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist-mobile');
const ANDROID_ASSETS = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'nodejs-project');
const ELECTRON_DIR = path.join(ROOT, 'electron');
const RUNTIME_PACKAGES = ['youtubei.js', '@bufbuild/protobuf', 'fflate', 'meriyah'];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else if (entry.isSymbolicLink()) fs.copyFileSync(fs.realpathSync(src), dest);
    else fs.copyFileSync(src, dest);
  }
}

// Hanya berkas runtime yang ikut. Peta sumber, definisi tipe, dan dokumentasi
// tidak dipakai Node dan membuat APK serta ekstraksi pertama lebih berat.
function pruneRuntime(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pruneRuntime(target);
      continue;
    }
    if (/\.(map|d\.ts|md)$/i.test(entry.name)) fs.rmSync(target, { force: true });
  }
}

function injectShim(file) {
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes('mobile-shim.js')) return;
  const tag = '<script src="./mobile-shim.js"></script>';
  const moduleIndex = html.indexOf('<script type="module"');
  const next = moduleIndex >= 0
    ? html.slice(0, moduleIndex) + tag + '\n    ' + html.slice(moduleIndex)
    : html.replace('</body>', `  ${tag}\n  </body>`);
  fs.writeFileSync(file, next, 'utf8');
}

// nodejs-mobile dibangun tanpa ICU (v8_enable_i18n_support=0), sehingga V8
// menolak semua properti regex (\p{...}). Ganti dengan rentang kode poin biasa.
const EMOJI_HELPER = `function isEmojiOnly(text) {
    for (const char of text) {
        const cp = char.codePointAt(0);
        if (cp === 0x200d || cp === 0xfe0f || cp === 0x20e3) continue;
        if ((cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf) ||
            (cp >= 0x2b00 && cp <= 0x2bff) || (cp >= 0x2190 && cp <= 0x21ff) ||
            (cp >= 0x2300 && cp <= 0x23ff) || (cp >= 0x25a0 && cp <= 0x25ff) ||
            (cp >= 0x2900 && cp <= 0x297f) || cp === 0x00a9 || cp === 0x00ae ||
            cp === 0x203c || cp === 0x2049 || cp === 0x2122 || cp === 0x2139 ||
            cp === 0x3030 || cp === 0x303d || cp === 0x3297 || cp === 0x3299) continue;
        return false;
    }
    return text.length > 0;
}
`;

const EMOJI_STRIP_PATTERN = '/[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{FE0F}\\u{200D}\\u{20E3}]/gu';

function patchTextJs(target) {
  const file = path.join(target, 'dist', 'src', 'parser', 'classes', 'misc', 'Text.js');
  if (!fs.existsSync(file)) throw new Error('Berkas Text.js youtubei.js tidak ditemukan');
  const original = fs.readFileSync(file, 'utf8');
  const pattern = '(/^(?:\\p{Emoji}|\\u200d)+$/u).test(text)';
  if (!original.includes(pattern)) {
    if (original.includes('function isEmojiOnly')) return;
    throw new Error('Pola emoji youtubei.js berubah, patch dibatalkan');
  }
  const marker = "const TAG = 'Text';";
  if (!original.includes(marker)) throw new Error('Penanda Text.js youtubei.js tidak ditemukan');
  const patched = original
    .replace(marker, `${EMOJI_HELPER}${marker}`)
    .replace(pattern, 'isEmojiOnly(text)');
  fs.writeFileSync(file, patched, 'utf8');
  console.log('[mobile] patch Text.js youtubei.js untuk V8 tanpa ICU');
}

function patchCommentView(target) {
  const file = path.join(target, 'dist', 'src', 'parser', 'classes', 'comments', 'CommentView.js');
  if (!fs.existsSync(file)) throw new Error('Berkas CommentView.js youtubei.js tidak ditemukan');
  const original = fs.readFileSync(file, 'utf8');
  const pattern = ".replace(/[^\\p{L}\\p{N}\\p{P}\\p{Z}]/gu, '')";
  if (!original.includes(pattern)) {
    if (/\.replace\(\/\[\\u\{1F000\}/.test(original)) return;
    throw new Error('Pola komentar youtubei.js berubah, patch dibatalkan');
  }
  fs.writeFileSync(file, original.replace(pattern, `.replace(${EMOJI_STRIP_PATTERN}, '')`), 'utf8');
  console.log('[mobile] patch CommentView.js youtubei.js untuk V8 tanpa ICU');
}

// Jaring pengaman: jangan pernah mengirim properti regex Unicode ke V8 tanpa ICU.
function assertNoUnicodeProperties(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (/\.(js|mjs|cjs)$/i.test(entry.name)) {
        if (/\\[pP]\{/.test(fs.readFileSync(target, 'utf8'))) {
          found.push(path.relative(dir, target));
        }
      }
    }
  };
  walk(dir);
  if (found.length) {
    throw new Error(`Properti regex Unicode tidak didukung runtime Android: ${found.join(', ')}`);
  }
}

function patchYoutubei(target) {
  patchTextJs(target);
  patchCommentView(target);
}


function buildUi() {
  const vite = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
  const result = spawnSync(vite, ['build', '--outDir', 'dist-mobile', '--emptyOutDir'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, METRONUX_MOBILE: '1' },
  });
  if (result.status !== 0) throw new Error('Build UI mobile gagal');
}

async function main() {
  buildUi();

  fs.copyFileSync(path.join(ROOT, 'mobile', 'shim.js'), path.join(OUT, 'mobile-shim.js'));
  injectShim(path.join(OUT, 'index.html'));

  await fsp.rm(ANDROID_ASSETS, { recursive: true, force: true });
  await fsp.mkdir(ANDROID_ASSETS, { recursive: true });

  // Backend dan modul bersama.
  fs.copyFileSync(path.join(ROOT, 'mobile', 'backend', 'main.js'), path.join(ANDROID_ASSETS, 'main.js'));
  copyDir(ELECTRON_DIR, path.join(ANDROID_ASSETS, 'electron'));
  for (const name of ['server.js', 'store.js', 'lyrics.js', 'ytmusic.js']) {
    const file = path.join(ANDROID_ASSETS, 'electron', name);
    if (!fs.existsSync(file)) throw new Error(`Modul backend hilang: ${name}`);
  }
  // Modul yang tidak dipakai versi Android.
  for (const name of ['main.js', 'preload.js', 'library.js', 'utils.js', 'importers']) {
    fs.rmSync(path.join(ANDROID_ASSETS, 'electron', name), { recursive: true, force: true });
  }

  // UI hasil build.
  copyDir(OUT, path.join(ANDROID_ASSETS, 'web'));

  // Dependensi runtime minimal.
  const modulesDir = path.join(ANDROID_ASSETS, 'node_modules');
  await fsp.mkdir(modulesDir, { recursive: true });
  for (const name of RUNTIME_PACKAGES) {
    const from = path.join(ROOT, 'node_modules', name);
    if (!fs.existsSync(from)) throw new Error(`Dependensi hilang: ${name}`);
    const target = path.join(modulesDir, name);
    copyDir(from, target);
    if (name === 'youtubei.js') {
      // Bundle browser tidak dipakai runtime Node.
      fs.rmSync(path.join(target, 'bundle'), { recursive: true, force: true });
      patchYoutubei(target);
    }
    pruneRuntime(target);
  }
  assertNoUnicodeProperties(modulesDir);

  const size = (dir) => {
    let total = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      total += entry.isDirectory() ? size(target) : fs.statSync(target).size;
    }
    return total;
  };

  console.log(`[mobile] aset siap: ${(size(ANDROID_ASSETS) / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error('[mobile]', err?.stack || err);
  process.exit(1);
});
