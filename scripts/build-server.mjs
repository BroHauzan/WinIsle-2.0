import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist-server');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Compile native Windows memory trimmer helper (trim-mem.exe)
if (process.platform === 'win32') {
  const cscCandidatePaths = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
  ];
  const cscPath = cscCandidatePaths.find((p) => fs.existsSync(p));
  const trimCs = path.join(rootDir, 'electron', 'trim-mem.cs');
  const trimExe = path.join(rootDir, 'electron', 'trim-mem.exe');

  if (cscPath && fs.existsSync(trimCs)) {
    try {
      const res = spawnSync(cscPath, [
        '/nologo',
        '/optimize',
        '/target:winexe',
        `/out:${trimExe}`,
        trimCs,
      ]);
      if (res.status === 0) {
        console.log('Successfully compiled electron/trim-mem.exe');
      }
    } catch (e) {
      console.warn('Could not compile trim-mem.exe:', e.message);
    }
  }
}

await build({
  entryPoints: [path.join(rootDir, 'server.ts')],
  outfile: path.join(outDir, 'server.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  minify: false,
  external: ['vite', 'fsevents', 'bufferutil', 'utf-8-validate'],
  logOverride: {
    'empty-import-meta': 'silent',
  },
});

console.log('Successfully bundled server.ts -> dist-server/server.cjs');
