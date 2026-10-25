import { defineConfig, devices } from '@playwright/test';

// Locally, an installed Google Chrome can be used with PW_CHANNEL=chrome; CI installs Chromium.
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:4173${process.env.BASE_PATH ?? '/'}`, trace: 'retain-on-failure', ...(channel ? { channel } : {}) },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) } },
    { name: 'phone', use: { ...devices['Pixel 7'], ...(channel ? { channel } : {}) } },
  ],
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    url: `http://localhost:4173${process.env.BASE_PATH ?? '/'}`,
    reuseExistingServer: !process.env.CI,
  },
});
