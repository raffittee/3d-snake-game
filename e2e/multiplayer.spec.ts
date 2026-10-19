import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Game } from '../src/game';

declare global {
  interface Window {
    __snake?: Game;
  }
}

/** Collect page errors and console errors (WebRTC's own chatter is not ours). */
function watchErrors(page: Page, into: string[], who: string): void {
  page.on('pageerror', (e) => into.push(`${who}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') into.push(`${who}: ${m.text()}`);
  });
}

/** What the page's multiplayer side knows (private fields read through `any`; this is a test). */
async function mpInfo(page: Page) {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mp = window.__snake?.mp as any;
    const m = mp?.match;
    return {
      phase: mp?.phase as string,
      you: m?.you as number,
      players: m ? m.world.players.map((p: { x: number; z: number; snakeId: number | null }) => ({ x: p.x, z: p.z, snakeId: p.snakeId })) : [],
      voice: mp?.voice ? (Object.values(mp.voice.peerStates()) as string[]) : [],
      snaps: m?.snapshots ?? 0,
    };
  });
}

test('two friends: create and join by code, voice, a Classic round to the scoreboard, then Snake and Players', async ({ browser }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  watchErrors(a, errors, 'host');
  watchErrors(b, errors, 'guest');

  // The host creates a room.
  await a.goto('/?debug=1&quality=low');
  await a.click('#mpBtn');
  await expect(a.locator('#panelMp')).toBeVisible();
  await a.fill('#mpName', 'Ana');
  await a.click('#mpCreate');
  await expect(a.locator('#panelLobby')).toBeVisible({ timeout: 20_000 });
  await expect(a.locator('#lobbyCode')).not.toHaveText('------');
  const code = (await a.locator('#lobbyCode').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  // A friend opens the shared link: the code is already filled in.
  await b.goto(`/?debug=1&quality=low&room=${code}`);
  await b.click('#mpBtn');
  await expect(b.locator('#mpCode')).toHaveValue(code);
  await b.fill('#mpName', 'Ben');
  await b.click('#mpJoin');
  await expect(b.locator('#panelLobby')).toBeVisible({ timeout: 20_000 });
  await expect(a.locator('#lobbyMembers > li')).toHaveCount(2);
  await expect(a.locator('#lobbyMembers')).toContainText('Ben');
  // Only the host starts and picks settings.
  await expect(b.locator('#lobbyStart')).toBeHidden();
  await expect(b.locator('#ls-mode')).toBeDisabled();
  await a.selectOption('#ls-rounds', '1');
  await expect(b.locator('#ls-rounds')).toHaveValue('1');
  // Voice: the two browsers connect to each other directly (fake microphones).
  await expect.poll(async () => (await mpInfo(a)).voice.join(), { timeout: 30_000 }).toContain('connected');
  await a.screenshot({ path: 'test-results/lobby.png' });

  // Classic, one round.
  await a.click('#lobbyStart');
  await expect(a.locator('#mpHud')).toBeVisible({ timeout: 20_000 });
  await expect(b.locator('#mpHud')).toBeVisible({ timeout: 20_000 });
  const start = await mpInfo(b);
  expect(start.you).toBe(1);
  // Both walk; each sees the other move.
  await a.keyboard.down('KeyW');
  await b.keyboard.down('KeyW');
  await a.waitForTimeout(2500);
  await a.keyboard.up('KeyW');
  await b.keyboard.up('KeyW');
  await expect.poll(async () => {
    const seen = await mpInfo(b);
    return Math.hypot(seen.players[0].x - start.players[0].x, seen.players[0].z - start.players[0].z);
  }, { timeout: 15_000 }).toBeGreaterThan(1);
  // The host turns to look at the guest (an avatar with a name tag) for the screenshot.
  await a.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mp = window.__snake?.mp as any;
    const [me, other] = [mp.match.world.players[mp.match.you], mp.match.world.players[1 - mp.match.you]];
    mp.viewYaw = Math.atan2(-(other.x - me.x), -(other.z - me.z));
    mp.viewPitch = -0.05;
  });
  await a.waitForTimeout(1500);
  await a.screenshot({ path: 'test-results/mp-play.png' });
  expect((await mpInfo(a)).snaps).toBeGreaterThan(20);

  // The round runs out (the test server's rounds are 25 s) or everyone goes down: the scoreboard.
  await expect(a.locator('#panelRound')).toBeVisible({ timeout: 60_000 });
  await expect(b.locator('#panelRound')).toBeVisible({ timeout: 10_000 });
  await expect(a.locator('#roundStandings > li')).toHaveCount(2);
  await expect(a.locator('#roundLobby')).toBeVisible({ timeout: 20_000 });
  await a.screenshot({ path: 'test-results/mp-round.png' });
  await a.click('#roundLobby');
  await b.click('#roundLobby');
  await expect(a.locator('#panelLobby')).toBeVisible();

  // Snake and Players: round 1, the host is the snake (third person behind its head).
  await a.selectOption('#ls-mode', 'snakeAndPlayers');
  await expect(b.locator('#ls-mode')).toHaveValue('snakeAndPlayers');
  await a.click('#lobbyStart');
  await expect(a.locator('#mpHud')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await mpInfo(a)).players[0]?.snakeId ?? null, { timeout: 15_000 }).not.toBeNull();
  await expect(a.locator('#mpGoal')).toContainText('You are the snake');
  await expect(b.locator('#mpGoal')).toContainText('Lives');
  await a.keyboard.down('KeyD');
  await a.waitForTimeout(1200);
  await a.keyboard.up('KeyD');
  await a.waitForTimeout(800);
  await a.screenshot({ path: 'test-results/mp-snake.png' });
  await b.screenshot({ path: 'test-results/mp-runner.png' });

  // The host leaves: the match ends for everyone.
  await a.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (window.__snake?.mp as any)?.leave();
  });
  await expect(b.locator('#panelMp')).toBeVisible({ timeout: 20_000 });
  await expect(b.locator('#mpError')).toContainText(/host/i);

  expect(errors.filter((e) => !/WebSocket|ERR_CONNECTION|favicon/i.test(e))).toEqual([]);
});
