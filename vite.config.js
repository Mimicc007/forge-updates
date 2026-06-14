import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Ensures assets are loaded relative to index.html in Electron
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
