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
    }
    pruneRuntime(target);
  }

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
