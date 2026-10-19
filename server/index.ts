/**
 * Snake Hunt game server: private rooms for friends (docs/GAME_DESIGN.md, Multiplayer). Runs the
 * same sim as the browser (src/sim) and is the only authority in a match.
 *
 *   npm run server          (PORT, default 2567)
 *
 * The client finds it at `VITE_SERVER_URL` (build time) or `?server=` (default: this machine, port 2567).
 */
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { SnakeRoom } from './SnakeRoom';

export function createServer(): Server {
  const server = new Server({ transport: new WebSocketTransport(), greet: false });
  server.define('snake', SnakeRoom);
  return server;
}

const isMain = process.argv[1] && /server[\\/]index\.(ts|js|mjs)$/.test(process.argv[1]);
if (isMain) {
  const port = Number(process.env.PORT ?? 2567);
  void createServer()
    .listen(port)
    .then(() => console.log(`Snake Hunt server on port ${port}`));
}
