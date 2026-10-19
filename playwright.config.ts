import { defineConfig } from '@playwright/test';

/**
 * Smoke test config. Runs against a production build served by `vite preview`.
 * Software WebGL (swiftshader) lets it run on machines and CI boxes with no GPU.
 * Set CHROMIUM_PATH to use a specific browser binary; otherwise Playwright's own is used
 * (install it once with `npx playwright install chromium`).
 */
export default defineConfig({
  testDir: 'e2e',
  // Software WebGL renders the textured arena at a few fps, so tests take 25 to 40 s each.
  timeout: 120_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1000, height: 640 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      // Software WebGL; a fake microphone (voice chat) that needs no permission prompt; real local
      // addresses for WebRTC so two pages on this machine can connect.
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--disable-features=WebRtcHideLocalIpsWithMdns',
      ],
    },
  },
  webServer: [
    {
      command: 'npm run build && npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // The game server for the multiplayer test, with short rounds so a whole match fits.
      command: 'npm run server',
      port: 2567,
      reuseExistingServer: true,
      timeout: 60_000,
      env: { SNAKE_ROUND_SECONDS: '25', PORT: '2567' },
    },
  ],
});
