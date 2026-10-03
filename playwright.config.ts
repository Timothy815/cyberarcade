import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against the production build (vite preview), served at /cyberarcade/ like GitHub Pages.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173/cyberarcade/',
    viewport: { width: 1366, height: 768 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } }],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/cyberarcade/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
