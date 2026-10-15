import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the built site works from any static-host subpath.
  base: './',
  // three.js alone is about 500 kB minified; that is expected for this game.
  build: { chunkSizeWarningLimit: 700 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
