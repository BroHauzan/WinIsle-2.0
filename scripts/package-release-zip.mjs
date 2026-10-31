import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');

console.log('Memeriksa output build di folder release...');

if (!fs.existsSync(releaseDir)) {
  console.error(`Error: Folder release (${releaseDir}) tidak ditemukan.`);
  process.exit(1);
}

const files = fs.readdirSync(releaseDir);
console.log('Isi folder release:', files);

// Cari installer .exe utama (abaikan folder dan file blockmap)
let targetExe = files.find((f) => f.toLowerCase() === 'winislesetup.exe');

if (!targetExe) {
  // Cari file .exe apa pun di release (misal: WinIsle Setup 1.0.0.exe)
  targetExe = files.find(
    (f) =>
      f.toLowerCase().endsWith('.exe') &&
      !f.toLowerCase().includes('uninstall') &&
      !f.toLowerCase().startsWith('builder-')
  );
}

if (!targetExe) {
  console.error('Error: Tidak ditemukan file installer .exe di dalam folder release.');
  process.exit(1);
}

const targetExePath = path.join(releaseDir, targetExe);
const finalExePath = path.join(releaseDir, 'WinIsleSetup.exe');
const finalZipPath = path.join(releaseDir, 'WinIsleSetup.zip');

// Jika nama filenya berbeda, copy/rename ke WinIsleSetup.exe
if (targetExe !== 'WinIsleSetup.exe') {
  console.log(`Menyalin ${targetExe} -> WinIsleSetup.exe...`);
  fs.copyFileSync(targetExePath, finalExePath);
}

if (fs.existsSync(finalZipPath)) {
  fs.unlinkSync(finalZipPath);
}

console.log(`Mengompres WinIsleSetup.exe ke WinIsleSetup.zip...`);

try {
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '${finalExePath}' -DestinationPath '${finalZipPath}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(`zip -j "${finalZipPath}" "${finalExePath}"`, { stdio: 'inherit' });
  }

  console.log(`SUKSES! Installer siap didownload dan dirilis:`);
  console.log(`  -> release/WinIsleSetup.exe`);
  console.log(`  -> release/WinIsleSetup.zip`);
} catch (err) {
  console.error('Gagal mengompres ZIP dengan command native, mencoba fallback node:', err);
  // Fallback jika powershell Compress-Archive terkendala
  try {
    const tarCmd = `tar -a -c -f "${finalZipPath}" -C "${releaseDir}" "WinIsleSetup.exe"`;
    execSync(tarCmd, { stdio: 'inherit' });
    console.log(`SUKSES via fallback tar: release/WinIsleSetup.zip berhasil dibuat.`);
  } catch (tarErr) {
    console.error('Gagal membuat ZIP:', tarErr);
    process.exit(1);
  }
}
