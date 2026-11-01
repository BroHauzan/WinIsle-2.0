import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

function stripAiStudioAssetsPlugin() {
  return {
    name: 'strip-aistudio-chat-assets',
    closeBundle() {
      const chatAssetsDir = path.resolve(process.cwd(), 'dist', 'assets', 'aistudio');
      if (fs.existsSync(chatAssetsDir)) {
        try {
          fs.rmSync(chatAssetsDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react(), tailwindcss(), stripAiStudioAssetsPlugin()],
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    hmr: false,
  },
}));

