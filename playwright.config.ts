import { defineConfig, devices } from '@playwright/test';

const PORT = 5199;
const ORIGIN = `http://127.0.0.1:${PORT}`;

/** Files that only make sense with a touch screen. The desktop project skips them. */
const TOUCH_ONLY = /(touch|mobile-reading)\.spec\.ts$/;
/** Files that need a keyboard, a mouse or a media preference of a desktop. The mobile project skips them. */
const DESKTOP_ONLY = /(mouse|keyboard|reduced-motion)\.spec\.ts$/;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `${ORIGIN}/app.html`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: {
    baseURL: ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
      testIgnore: TOUCH_ONLY,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testIgnore: DESKTOP_ONLY,
    },
    {
      name: 'webkit-smoke',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 720 } },
      testMatch: /smoke\.spec\.ts$/,
    },
  ],
});
