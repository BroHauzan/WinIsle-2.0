import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

// 1. Check Tauri 2.0 release build outputs first
const tauriReleaseDir = path.join(rootDir, 'src-tauri', 'target', 'release');
const tauriNsisDir = path.join(tauriReleaseDir, 'bundle', 'nsis');
const tauriStandaloneExe = path.join(tauriReleaseDir, 'winisle.exe');

const finalSetupExe = path.join(releaseDir, 'WinIsleSetup.exe');
const finalStandaloneExe = path.join(releaseDir, 'winisle.exe');
const finalPortableZip = path.join(releaseDir, 'WinIsle-portable.zip');

// Locate Tauri NSIS Setup installer (*.exe in src-tauri/target/release/bundle/nsis)
if (fs.existsSync(tauriNsisDir)) {
  const nsisFiles = fs
    .readdirSync(tauriNsisDir)
    .filter((f) => f.toLowerCase().endsWith('.exe'));
  if (nsisFiles.length > 0) {
    const srcInstaller = path.join(tauriNsisDir, nsisFiles[0]);
    fs.copyFileSync(srcInstaller, finalSetupExe);
    console.log(`Menyalin Tauri NSIS Installer: ${nsisFiles[0]} -> release/WinIsleSetup.exe`);
  }
}

// Locate Tauri standalone portable binary (src-tauri/target/release/winisle.exe)
if (fs.existsSync(tauriStandaloneExe)) {
  fs.copyFileSync(tauriStandaloneExe, finalStandaloneExe);
  console.log(`Menyalin Tauri Standalone Binary -> release/winisle.exe`);
  if (!fs.existsSync(finalSetupExe)) {
    fs.copyFileSync(tauriStandaloneExe, finalSetupExe);
  }
}

// Fallback if built with Electron or existing .exe in release/
if (!fs.existsSync(finalSetupExe)) {
  const existingExe = fs
    .readdirSync(releaseDir)
    .find(
      (f) =>
        f.toLowerCase().endsWith('.exe') &&
        !f.toLowerCase().includes('uninstall') &&
        !f.toLowerCase().startsWith('builder-')
    );
  if (existingExe) {
    const src = path.join(releaseDir, existingExe);
    if (src !== finalSetupExe) {
      fs.copyFileSync(src, finalSetupExe);
    }
    if (!fs.existsSync(finalStandaloneExe)) {
      fs.copyFileSync(finalSetupExe, finalStandaloneExe);
    }
  }
}

if (!fs.existsSync(finalSetupExe) && !fs.existsSync(finalStandaloneExe)) {
  console.error('Error: Tidak ditemukan file .exe hasil build di src-tauri/target/release maupun release/.');
  process.exit(1);
}

if (fs.existsSync(finalPortableZip)) {
  fs.unlinkSync(finalPortableZip);
}

const targetToZip = fs.existsSync(finalStandaloneExe) ? finalStandaloneExe : finalSetupExe;
console.log(`Mengompres paket portable ke release/WinIsle-portable.zip...`);

try {
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '${targetToZip}' -DestinationPath '${finalPortableZip}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(`zip -j "${finalPortableZip}" "${targetToZip}"`, { stdio: 'inherit' });
  }
} catch {
  const fileName = path.basename(targetToZip);
  execSync(`tar -a -c -f "${finalPortableZip}" -C "${releaseDir}" "${fileName}"`, {
    stdio: 'inherit',
  });
}

for (const f of ['WinIsleSetup.exe', 'winisle.exe', 'WinIsle-portable.zip']) {
  const p = path.join(releaseDir, f);
  if (fs.existsSync(p)) {
    const sizeMb = (fs.statSync(p).size / (1024 * 1024)).toFixed(2);
    console.log(`  [READY] release/${f} (${sizeMb} MB)`);
  }
}

