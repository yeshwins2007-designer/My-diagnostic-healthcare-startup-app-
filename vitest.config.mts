import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // Playwright specs live under tests/e2e and are run by `npm run test:e2e`.
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname) },
  },
});
