import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the site from /cyberarcade/. The offline USB build (Plan 6) uses relative paths.
  base: mode === 'offline' ? './' : '/cyberarcade/',
  build: { target: 'es2022' },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
}));
