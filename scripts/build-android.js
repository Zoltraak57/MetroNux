'use strict';

/**
 * Membangun APK rilis universal (32 bit dan 64 bit) memakai Gradle.
 * Butuh ANDROID_HOME dan JAVA_HOME yang menunjuk JDK 17.
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const OUT = path.join(ROOT, 'release', 'android');
const KEYSTORE = path.join(ANDROID, 'metronux-release.jks');
const KEYSTORE_PROPS = path.join(ANDROID, 'keystore.properties');

function findGradle() {
  const local = process.env.GRADLE_BIN;
  if (local) return { command: local, args: [] };
  const wrapper = path.join(ANDROID, 'gradlew');
  if (fs.existsSync(wrapper)) return { command: wrapper, args: [] };
  return { command: 'gradle', args: [] };
}

function ensureKeystore() {
  if (fs.existsSync(KEYSTORE) && fs.existsSync(KEYSTORE_PROPS)) return;

  const keytool = path.join(
    process.env.JAVA_HOME,
    'bin',
    process.platform === 'win32' ? 'keytool.exe' : 'keytool'
  );
  const password = crypto.randomBytes(16).toString('hex');
  console.log('[android] membuat keystore rilis baru');
  const result = spawnSync(
    keytool,
    [
      '-genkeypair', '-v',
      '-keystore', KEYSTORE,
      '-alias', 'metronux',
      '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
      '-storepass', password, '-keypass', password,
      '-dname', 'CN=Metronux, OU=Android, O=Metronux, L=Jakarta, ST=DKI Jakarta, C=ID',
    ],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) {
    console.error('[android] Gagal membuat keystore. Buat manual lalu ulangi build.');
    process.exit(1);
  }
  fs.writeFileSync(
    KEYSTORE_PROPS,
    [
      'storeFile=metronux-release.jks',
      `storePassword=${password}`,
      'keyAlias=metronux',
      `keyPassword=${password}`,
      '',
    ].join('\n'),
    'utf8'
  );
  fs.chmodSync(KEYSTORE_PROPS, 0o600);
  fs.chmodSync(KEYSTORE, 0o600);
}

function main() {
  if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) {
    console.error('[android] Set ANDROID_HOME ke folder Android SDK.');
    process.exit(1);
  }
  if (!process.env.JAVA_HOME) {
    console.error('[android] Set JAVA_HOME ke JDK 17.');
    process.exit(1);
  }

  ensureKeystore();

  const gradle = findGradle();
  const result = spawnSync(
    gradle.command,
    [...gradle.args, 'assembleRelease', '--no-daemon'],
    { cwd: ANDROID, stdio: 'inherit', env: process.env }
  );
  if (result.status !== 0) process.exit(result.status || 1);

  const apk = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (!fs.existsSync(apk)) {
    console.error('[android] APK rilis tidak ditemukan.');
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const version = require(path.join(ROOT, 'package.json')).version;
  const target = path.join(OUT, `Metronux-${version}-universal.apk`);
  fs.copyFileSync(apk, target);
  const size = (fs.statSync(target).size / 1024 / 1024).toFixed(1);
  console.log(`[android] APK siap: ${target} (${size} MB)`);
}

main();
