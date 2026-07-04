import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    // Exclude Playwright E2E tests — they use a different runner
    // Also exclude OpenHands result folders which have their own node_modules
    exclude: ['e2e/**', 'node_modules/**', 'openhands-result-*/**'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
