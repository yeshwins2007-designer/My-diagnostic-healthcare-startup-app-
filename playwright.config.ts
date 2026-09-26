import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Find the Chromium already present in the image.
 *
 * The installed @playwright/test pins a browser build that may not match the
 * one baked into the environment, and downloading one is both slow and often
 * blocked. So resolve whatever is actually on disk under
 * PLAYWRIGHT_BROWSERS_PATH and launch that; fall back to Playwright's own
 * resolution when nothing is found.
 */
function findChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return undefined;

  const candidates = fs
    .readdirSync(root)
    .filter((d) => d.startsWith('chromium'))
    // Newest build number first.
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .flatMap((dir) => [
      path.join(root, dir, 'chrome-linux', 'chrome'),
      path.join(root, dir, 'chrome-linux', 'headless_shell'),
      path.join(root, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
    ]);

  return candidates.find((p) => fs.existsSync(p));
}

const executablePath = findChromium();

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // the specs share one seeded database
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // An elderly-facing product is designed for a phone held one-handed,
        // so the specs run at phone width rather than desktop.
        viewport: { width: 430, height: 932 },
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
});
