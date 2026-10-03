import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the site from /cyberarcade/. The offline USB build (Plan 6) uses relative paths.
  base: mode === 'offline' ? './' : '/cyberarcade/',
  // Phaser is ~1.2 MB minified; it loads lazily, only when Malware Invaders starts.
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
}));
