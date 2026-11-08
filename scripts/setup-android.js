'use strict';

/**
 * Menyiapkan library Node.js untuk Android (arm64-v8a dan armeabi-v7a).
 * Diunduh sekali lalu disalin ke jniLibs dan folder header CMake.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const VERSION = 'v18.20.4';
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, 'android', '.cache');
const ZIP = path.join(CACHE, `nodejs-mobile-${VERSION}-android.zip`);
const URL = `https://github.com/nodejs-mobile/nodejs-mobile/releases/download/${VERSION}/nodejs-mobile-${VERSION}-android.zip`;
const JNI = path.join(ROOT, 'android', 'app', 'src', 'main', 'jniLibs');
const INCLUDE = path.join(ROOT, 'android', 'app', 'src', 'main', 'cpp', 'include');

const ABIS = ['arm64-v8a', 'armeabi-v7a'];

function exists(file) {
  try {
    fs.accessSync(file);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} gagal`);
}

async function download() {
  if (exists(ZIP)) return;
  fs.mkdirSync(CACHE, { recursive: true });
  console.log(`[android] mengunduh nodejs-mobile ${VERSION}`);
  const response = await fetch(URL, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Unduhan gagal: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(ZIP, buffer);
}

function extract() {
  const temp = path.join(CACHE, 'unpack');
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(temp, { recursive: true });
  run('unzip', ['-q', '-o', ZIP, '-d', temp]);

  for (const abi of ABIS) {
    const source = path.join(temp, 'bin', abi, 'libnode.so');
    if (!exists(source)) throw new Error(`libnode.so tidak ditemukan untuk ${abi}`);
    const target = path.join(JNI, abi, 'libnode.so');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }

  const headers = path.join(temp, 'include', 'node');
  if (!exists(headers)) throw new Error('Header Node tidak ditemukan di paket');
  fs.rmSync(INCLUDE, { recursive: true, force: true });
  fs.mkdirSync(INCLUDE, { recursive: true });
  fs.cpSync(headers, path.join(INCLUDE, 'node'), { recursive: true });

  fs.rmSync(temp, { recursive: true, force: true });
}

async function main() {
  if (isReady()) {
    console.log('[android] library dan header Node sudah siap');
    return;
  }
  await download();
  extract();
  console.log('[android] library dan header Node siap di android/app/src/main');
}

function isReady() {
  const libs = ABIS.every((abi) => exists(path.join(JNI, abi, 'libnode.so')));
  return libs && exists(path.join(INCLUDE, 'node', 'node.h'));
}

main().catch((err) => {
  console.error('[android]', err?.message || err);
  process.exit(1);
});
