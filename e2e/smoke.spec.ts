import { expect, test } from '@playwright/test';
import type { Game } from '../src/game';

declare global {
  interface Window {
    __snake?: Game;
  }
}

test('title card loads, a run starts, and nothing throws', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?debug=1&god=1&seed=7&quality=low');
  await expect(page.locator('#panelStart')).toBeVisible();
  await expect(page.locator('h1')).toContainText('Snake');
  await page.screenshot({ path: 'test-results/title.png' });

  await page.click('#startBtn');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#overlay')).toBeHidden();

  // Let the loop run, hold forward and sprint for a moment.
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Shift');
  await page.waitForTimeout(2500);
  await page.keyboard.up('Shift');
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: 'test-results/play.png' });

  const info = await page.evaluate(() => {
    const g = window.__snake;
    return g ? { state: g.state, frames: g.frames, elapsed: g.world.elapsed, len: g.world.snake.cells.length } : null;
  });
  expect(info).not.toBeNull();
  expect(info?.state).toBe('play');
  expect(info?.frames).toBeGreaterThan(10);
  expect(info?.elapsed).toBeGreaterThan(1);

  // Space jumps.
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__snake?.world.player.y ?? 0), { timeout: 10_000 }).toBeGreaterThan(0);

  // Pause and resume.
  await page.click('#pauseBtn', { force: true }).catch(() => undefined);
  await page.evaluate(() => window.__snake?.pause());
  await expect(page.locator('#panelPause')).toBeVisible();
  await page.click('#resumeBtn');
  await expect(page.locator('#overlay')).toBeHidden();

  expect(errors).toEqual([]);
});

test('the snake can end a run and the game-over card shows', async ({ page }) => {
  await page.goto('/?debug=1&seed=3&quality=low');
  await page.click('#startBtn');
  // Last life, a few cells in front of the snake, and stand still: it walks up and eats the player.
  await page.evaluate(() => {
    const g = window.__snake;
    if (!g) return;
    g.world.lives = 1;
    g.world.player.x = g.world.snake.pos[0].x + 8;
    g.world.player.z = g.world.snake.pos[0].z;
  });
  await expect(page.locator('#panelDead')).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: 'test-results/dead.png' });
  await expect(page.locator('#deadTitle')).toHaveText(/Eaten|Crushed/);
  await page.click('#againBtn');
  await expect(page.locator('#hud')).toBeVisible();
});

test('reaching the goal shows the level-complete card', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?debug=1&god=1&seed=7&quality=low');
  await page.click('#startBtn');
  await expect(page.locator('#hud')).toBeVisible();
  // Skip most of Level 1's 90 s survive goal instead of waiting for it.
  await page.evaluate(() => {
    const g = window.__snake;
    if (g) g.world.elapsed = 89.5;
  });
  await expect(page.locator('#panelComplete')).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'test-results/complete.png' });
  expect(await page.evaluate(() => window.__snake?.state)).toBe('complete');
  await page.click('#completeAgainBtn');
  await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => window.__snake?.state)).toBe('play');
  expect(errors).toEqual([]);
});

test('settings open from the title, apply, and persist across a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?debug=1&seed=7&quality=low');
  await page.click('#settingsFromStart');
  await expect(page.locator('#panelSettings')).toBeVisible();
  await page.locator('#set-fov').fill('90');
  await expect(page.locator('#out-fov')).toHaveText('90°');
  await page.screenshot({ path: 'test-results/settings.png' });
  await page.click('#settingsBack');
  await expect(page.locator('#panelStart')).toBeVisible();

  await page.reload();
  await page.click('#settingsFromStart');
  await expect(page.locator('#set-fov')).toHaveValue('90');
  expect(errors).toEqual([]);
});
