import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the built site works from any static-host subpath.
  base: './',
  // three.js alone is about 500 kB minified; that is expected for this game.
  build: { chunkSizeWarningLimit: 700 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The on-disk module cache is shared between Vitest processes. When two runs start together
    // (for example a terminal run and the editor's test extension) and the cache is stale, one
    // deletes it while the other reads it: a one-off "Cannot read properties of undefined" or
    // EPERM failure. The suite runs in about a second, so the cache buys nothing here.
    fsModuleCache: false,
  },
});
