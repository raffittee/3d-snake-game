/**
 * Host a game night from this PC: starts the game server and a free Cloudflare quick tunnel to it
 * (HTTPS, so voice works; no account needed), then prints the link to send your friends.
 *
 *   npm run host
 *
 * The tunnel's address changes every time, so send the new link each session. The first run
 * downloads Cloudflare's `cloudflared` program into node_modules. Stop with Ctrl+C.
 *
 * Env: PORT (default 2567); SNAKE_CLIENT_URL, the game page friends open (default: the GitHub Pages
 * build). For a local client use http://localhost:5173/ (npm run dev).
 */
import { existsSync } from 'node:fs';
import { Tunnel, bin, install } from 'cloudflared';
import { createServer } from './index';

const PORT = Number(process.env.PORT ?? 2567);
const CLIENT_URL = process.env.SNAKE_CLIENT_URL ?? 'https://raffittee.github.io/3d-snake-game/';

async function main(): Promise<void> {
  const server = createServer();
  await server.listen(PORT);
  console.log(`Game server on port ${PORT}.`);

  if (!existsSync(bin)) {
    console.log('First run: downloading cloudflared (Cloudflare\'s tunnel program)...');
    await install(bin);
  }
  console.log('Opening a tunnel...');
  const tunnel = Tunnel.quick(`http://localhost:${PORT}`);
  const url = await new Promise<string>((resolve) => tunnel.once('url', resolve));
  await new Promise((resolve) => tunnel.once('connected', resolve));
  const host = new URL(url).host;
  const link = `${CLIENT_URL}${CLIENT_URL.includes('?') ? '&' : '?'}server=${host}`;
  console.log('');
  console.log('  Ready. Everyone (you too) opens:');
  console.log(`  ${link}`);
  console.log('');
  console.log('  Then: Play with friends. You create the room; in the lobby, Copy gives an invite link with the code.');
  console.log('  Keep this window open while you play. Ctrl+C stops the server and the tunnel.');
  console.log('');

  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log('Stopping...');
    tunnel.stop();
    await server.gracefullyShutdown(false).catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
  tunnel.on('exit', (code: number | null) => {
    if (stopping) return;
    console.error(`The tunnel closed (code ${code}). Run npm run host again for a new link.`);
    void stop();
  });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
