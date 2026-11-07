'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const electronPath = require('electron');
const port = Number(process.env.PORT || 5173);

const vite = spawn(process.execPath, [viteBin, '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

let electron = null;
let closing = false;
let attempts = 0;

function shutdown(code) {
  if (closing) return;
  closing = true;
  try {
    if (electron && !electron.killed) electron.kill('SIGTERM');
  } catch {}
  try {
    if (!vite.killed) vite.kill('SIGTERM');
  } catch {}
  setTimeout(() => process.exit(code), 200);
}

function waitForVite() {
  attempts += 1;
  if (attempts > 200) {
    console.error('[dev] Vite tidak siap dalam 60 detik.');
    shutdown(1);
    return;
  }
  const req = http.get(
    { host: '127.0.0.1', port, path: '/', timeout: 700 },
    (res) => {
      res.resume();
      if (res.statusCode && res.statusCode < 500) startElectron();
      else setTimeout(waitForVite, 300);
    }
  );
  req.on('error', () => setTimeout(waitForVite, 300));
  req.on('timeout', () => {
    req.destroy();
    setTimeout(waitForVite, 300);
  });
}

function startElectron() {
  if (closing) return;
  console.log('[dev] Vite siap, menjalankan Electron…');
  electron = spawn(electronPath, ['.'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: `http://localhost:${port}`,
      ELECTRON_ENABLE_LOGGING: '1',
    },
  });
  electron.on('exit', (code) => shutdown(code ?? 0));
}

vite.on('exit', (code) => {
  if (!closing) {
    console.error('[dev] Vite berhenti.');
    shutdown(code ?? 1);
  }
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

waitForVite();
