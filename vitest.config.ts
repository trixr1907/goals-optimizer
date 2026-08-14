import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    // Exclude Playwright E2E tests — they use a different runner
    // Also exclude agent workspace folders, Next.js build output, and Playwright artifacts
    exclude: ['e2e/**', 'node_modules/**', '.next/**', 'agent-workspace-*/**', 'playwright-report/**', 'test-results/**'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
