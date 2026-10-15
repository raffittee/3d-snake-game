# Snake Hunt

First-person 3D Snake, reversed: you are the food. A snake that grows and speeds up hunts you around a walled arena. Survive as long as you can and grab pellets.

## Play it locally

```
npm install
npm run dev
```

Open http://localhost:5173, click **Start running**, then click the view to capture the mouse.

| Key | Action |
|---|---|
| WASD / arrows | Move |
| Mouse | Look |
| Shift | Sprint (uses stamina) |
| Q / E | Turn |
| Esc or P | Pause |
| M | Sound on/off |

## Develop

- `npm run check`: typecheck, lint, unit tests
- `npm run build`: production build in `dist/` (deploy it to any static host)
- `npm run test:e2e`: browser smoke test (first time: `npx playwright install chromium`)

See `CLAUDE.md` for the architecture rules, `docs/GAME_DESIGN.md` for where the game is going, and `docs/BACKLOG.md` for what to build next.
