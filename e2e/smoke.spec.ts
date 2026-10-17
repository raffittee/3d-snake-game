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
    return g ? { state: g.state, frames: g.frames, elapsed: g.world.elapsed, len: g.world.snakes[0].cells.length } : null;
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
    g.world.player.x = g.world.snakes[0].pos[0].x + 8;
    g.world.player.z = g.world.snakes[0].pos[0].z;
  });
  await expect(page.locator('#panelDead')).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: 'test-results/dead.png' });
  await expect(page.locator('#deadTitle')).toHaveText(/Eaten|Crushed/);
  await page.click('#againBtn');
  await expect(page.locator('#hud')).toBeVisible();
});

test('campaign: win Level 1, pick a perk, Level 2 starts with it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?debug=1&god=1&seed=7&quality=low');
  await page.click('#startBtn');
  await expect(page.locator('#hud')).toBeVisible();
  // Skip most of Level 1's 90 s survive goal, with enough XP banked for one level-up.
  await page.evaluate(() => {
    const g = window.__snake;
    if (!g) return;
    g.world.xpGained = 3;
    g.world.elapsed = 89.5;
  });
  await expect(page.locator('#panelComplete')).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'test-results/complete.png' });
  expect(await page.evaluate(() => window.__snake?.state)).toBe('complete');
  await expect(page.locator('#completeNextBtn')).toHaveText('Pick perks');
  await page.click('#completeNextBtn');
  await expect(page.locator('#panelPerk')).toBeVisible();
  await expect(page.locator('#perkChoices .perk')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/perk.png' });
  const picked = await page.locator('#perkChoices .perk').first().getAttribute('data-perk');
  await page.locator('#perkChoices .perk').first().click();
  // Level 2 starts, and the perk is in the run and in the new level.
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#gLevel')).toContainText('Ruins');
  const state = await page.evaluate(() => ({ s: window.__snake?.state, perks: window.__snake?.world.perks, level: window.__snake?.run.levelIndex }));
  expect(state.s).toBe('play');
  expect(state.level).toBe(1);
  expect(state.perks).toContain(picked);
  expect(errors).toEqual([]);
});

test('a machete cut splits the snake in two', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&god=1&seed=7&quality=low');
  await page.click('#startBtn');
  await expect(page.locator('#hud')).toBeVisible();
  // A long, frozen snake right in front of the player; a machete in hand.
  await page.evaluate(() => {
    const w = window.__snake?.world;
    if (!w) return;
    const c = (i: number) => (i + 0.5) * 2 - 48;
    for (let z = 16; z <= 28; z++) for (let x = 10; x <= 34; x++) w.pillars[z * 48 + x] = 0;
    const cells: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < 16; i++) cells.push({ x: 30 - i, z: 22 });
    const s = w.snakes[0];
    s.cells = cells;
    s.prev = cells.map((q) => ({ ...q }));
    s.timer = 0;
    s.pos = cells.map((q) => ({ x: c(q.x), z: c(q.z) }));
    s.stunTimer = 1e6;
    w.inventory[0] = { item: 'machete', tier: 'white', uses: 5, spoilLeft: 45, spoilTotal: 45 };
    w.selectedSlot = 0;
    w.player.x = c(23);
    w.player.z = c(22) + 1.7;
    w.player.yaw = 0;
    w.player.pitch = -0.32;
  });
  await page.keyboard.press('KeyF');
  await expect.poll(() => page.evaluate(() => window.__snake?.world.snakes.length), { timeout: 10_000 }).toBe(2);
  await expect(page.locator('#hLen')).toContainText('×2');
  expect(errors).toEqual([]);
});

test('Level 3 (Riverside) loads with its river and dock', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&god=1&seed=7&quality=low&level=3');
  await page.click('#startBtn');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#gLevel')).toContainText('Riverside');
  const info = await page.evaluate(() => {
    const w = window.__snake?.world;
    return w ? { size: w.grid.size, water: Array.from(w.tiles).filter((t) => t === 3).length, frames: window.__snake?.frames ?? 0 } : null;
  });
  expect(info?.size).toBe(64);
  expect(info?.water).toBeGreaterThan(100);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/level3.png' });
  expect(errors).toEqual([]);
});

test('Level 4 (Tall grass) loads, and a thrown firecracker bangs', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&god=1&seed=7&quality=low&level=4');
  await page.click('#startBtn');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#gLevel')).toContainText('Tall grass');
  const grass = await page.evaluate(() => Array.from(window.__snake?.world.tiles ?? []).filter((t) => t === 5).length);
  expect(grass).toBeGreaterThan(800);
  await page.evaluate(() => {
    const w = window.__snake?.world;
    if (!w) return;
    w.inventory[0] = { item: 'firecracker', tier: 'white', uses: 1, spoilLeft: 40, spoilTotal: 40 };
    w.selectedSlot = 0;
  });
  await page.keyboard.press('KeyF');
  await expect.poll(() => page.evaluate(() => window.__snake?.world.firecrackers.length ?? 0), { timeout: 30_000 }).toBe(1);
  await page.screenshot({ path: 'test-results/level4.png' });
  await expect.poll(() => page.evaluate(() => window.__snake?.world.firecrackers.length ?? 1), { timeout: 30_000 }).toBe(0);
  expect(errors).toEqual([]);
});

test('Level 5 (Corn maze): no minimap until the map, a smoke bomb, the exit', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&god=1&seed=7&quality=low&level=5');
  await page.click('#startBtn');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#gLevel')).toContainText('Corn maze');
  expect(await page.evaluate(() => window.__snake?.world.snakes.length)).toBe(2);
  await page.evaluate(() => {
    const w = window.__snake?.world;
    if (!w) return;
    w.inventory[0] = { item: 'smokeBomb', tier: 'white', uses: 1, spoilLeft: 40, spoilTotal: 40 };
    w.selectedSlot = 0;
  });
  await page.keyboard.press('KeyF');
  await expect.poll(() => page.evaluate(() => window.__snake?.world.snakes.every((s) => s.lure !== null)), { timeout: 30_000 }).toBe(true);
  await page.screenshot({ path: 'test-results/level5.png' });
  // Walk onto the map: it is found, the exit opens; then the exit ends the level.
  await page.evaluate(() => {
    const w = window.__snake?.world;
    if (!w) return;
    const m = w.relics[0];
    w.player.x = (m.x + 0.5) * w.grid.cell - w.grid.half;
    w.player.z = (m.z + 0.5) * w.grid.cell - w.grid.half;
  });
  await expect.poll(() => page.evaluate(() => window.__snake?.world.gateOpen), { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => {
    const w = window.__snake?.world;
    if (!w) return;
    w.player.x = (w.gate.x + 0.5) * w.grid.cell - w.grid.half;
    w.player.z = (w.gate.z + 0.5) * w.grid.cell - w.grid.half;
  });
  await expect(page.locator('#panelComplete')).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('Level 6 (Swamp): mud, an energy drink, the lanterns and the boat', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&god=1&seed=7&quality=low&level=6');
  await page.click('#startBtn');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#gLevel')).toContainText('Swamp');
  await page.evaluate(() => {
    const w = window.__snake?.world;
    if (!w) return;
    w.inventory[0] = { item: 'energyDrink', tier: 'white', uses: 1, spoilLeft: 45, spoilTotal: 45 };
    w.selectedSlot = 0;
  });
  await page.keyboard.press('KeyF');
  await expect(page.locator('#stamBar')).toHaveClass(/energized/, { timeout: 15_000 });
  await page.screenshot({ path: 'test-results/level6.png' });
  // Light every lantern, then board the boat.
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      const w = window.__snake?.world;
      const r = w?.relics[0];
      if (!w || !r) return;
      w.player.x = (r.x + 0.5) * w.grid.cell - w.grid.half;
      w.player.z = (r.z + 0.5) * w.grid.cell - w.grid.half;
    });
    await expect.poll(() => page.evaluate(() => window.__snake?.world.relicsFound), { timeout: 20_000 }).toBe(i + 1);
  }
  await page.evaluate(() => {
    const w = window.__snake?.world;
    if (!w) return;
    w.player.x = (w.gate.x + 0.5) * w.grid.cell - w.grid.half;
    w.player.z = (w.gate.z + 0.5) * w.grid.cell - w.grid.half;
  });
  await expect(page.locator('#panelComplete')).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('Level 7 (Sandstorm desert): a storm, a burrowing snake, a mongoose', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&god=1&seed=7&quality=low&level=7');
  await page.click('#startBtn');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#gLevel')).toContainText('Sandstorm desert');
  // Into a storm, the snake sent under the sand, and a mongoose let go.
  await page.evaluate(() => {
    const g = window.__snake;
    if (!g) return;
    const w = g.world;
    const s = w.level.storm;
    if (s) w.elapsed = s.first + 1;
    w.snakes[0].burrow.t = 1e9;
    w.inventory[0] = { item: 'mongoose', tier: 'white', uses: 1, spoilLeft: 50, spoilTotal: 50 };
    w.selectedSlot = 0;
  });
  await expect.poll(() => page.evaluate(() => window.__snake?.world.snakes[0].under[0]), { timeout: 30_000 }).toBe(true);
  await page.keyboard.press('KeyF');
  await expect.poll(() => page.evaluate(() => window.__snake?.world.mongooses.length), { timeout: 30_000 }).toBe(1);
  await page.screenshot({ path: 'test-results/level7.png' });
  expect(errors).toEqual([]);
});

test('Level 8 (Frozen lake): cleats, cracked ice cuts the snake, beating it wins', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&god=1&seed=7&quality=low&level=8');
  await page.click('#startBtn');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#gLevel')).toContainText('Frozen lake');
  await page.evaluate(() => {
    const w = window.__snake?.world;
    if (!w) return;
    w.inventory[0] = { item: 'iceCleats', tier: 'white', uses: 1, spoilLeft: 45, spoilTotal: 45 };
    w.selectedSlot = 0;
  });
  await page.keyboard.press('KeyF');
  await expect(page.locator('#buffs')).toContainText('Cleats');
  // A long snake straight across a cracked cell: the ice gives way and cuts it.
  await page.evaluate(() => {
    const w = window.__snake?.world;
    if (!w) return;
    const n = w.grid.size;
    const c = (i: number) => (i + 0.5) * w.grid.cell - w.grid.half;
    for (let x = 4; x < 60; x++) {
      w.tiles[30 * n + x] = 10;
      w.pillars[30 * n + x] = 0;
    }
    w.tiles[30 * n + 22] = 11;
    const s = w.snakes[0];
    const cells = Array.from({ length: 16 }, (_, i) => ({ x: 20 - i, z: 30 }));
    s.cells = cells;
    s.prev = cells.map((q) => ({ ...q }));
    s.pos = cells.map((q) => ({ x: c(q.x), z: c(q.z) }));
    s.under = cells.map(() => false);
    s.lure = { x: 58, z: 30, time: 1e9 };
  });
  await expect.poll(() => page.evaluate(() => window.__snake?.world.snakes.length), { timeout: 60_000 }).toBe(2);
  await page.screenshot({ path: 'test-results/level8.png' });
  // Beat them both: the level is won.
  await page.evaluate(() => {
    const w = window.__snake?.world;
    if (w) w.snakes = [];
  });
  await expect(page.locator('#panelComplete')).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('Level 9 (Broken house): a door opens with R, the key, the front door', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&god=1&seed=7&quality=low&level=9');
  await page.click('#startBtn');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#gLevel')).toContainText('Broken house');
  await expect(page.locator('#noiseMeter')).toBeVisible();
  // Stand at a shut door: the prompt shows; R opens it.
  const door = await page.evaluate(() => {
    const w = window.__snake?.world;
    if (!w) return -1;
    for (const s of w.snakes) s.stunTimer = 1e9;
    const n = w.grid.size;
    const c = (i: number) => (i + 0.5) * w.grid.cell - w.grid.half;
    for (let i = 0; i < n * n; i++) {
      if (w.tiles[i] !== 14 || w.doorState[i] !== 1) continue;
      const x = i % n;
      const z = (i / n) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (w.tiles[(z + dz) * n + x + dx] !== 0) continue;
        w.player.x = c(x + dx);
        w.player.z = c(z + dz);
        w.player.yaw = Math.atan2(dx, dz);
        return i;
      }
    }
    return -1;
  });
  expect(door).toBeGreaterThanOrEqual(0);
  await expect(page.locator('#prompt')).toContainText('Open door');
  await page.keyboard.press('KeyR');
  await expect.poll(() => page.evaluate((i) => window.__snake?.world.doorState[i], door), { timeout: 15_000 }).toBe(0);
  await page.screenshot({ path: 'test-results/level9.png' });
  // The key, then the front door.
  await page.evaluate(() => {
    const w = window.__snake?.world;
    if (!w) return;
    const c = (i: number) => (i + 0.5) * w.grid.cell - w.grid.half;
    w.player.x = c(w.relics[0].x);
    w.player.z = c(w.relics[0].z);
  });
  await expect.poll(() => page.evaluate(() => window.__snake?.world.gateOpen), { timeout: 20_000 }).toBe(true);
  await page.evaluate(() => {
    const w = window.__snake?.world;
    if (!w) return;
    const c = (i: number) => (i + 0.5) * w.grid.cell - w.grid.half;
    w.player.x = c(w.gate.x);
    w.player.z = c(w.gate.z);
  });
  await expect(page.locator('#panelComplete')).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('Level 10 (Dark cave): the flashlight, the Mother in three phases, the campaign ends', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&god=1&seed=7&quality=low&level=10');
  await page.click('#startBtn');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#gLevel')).toContainText('Dark cave');
  await expect(page.locator('#lightMeter')).toBeVisible();
  expect(await page.evaluate(() => window.__snake?.world.bossPhase)).toBe(1);
  // Bring the Mother down to half: she splits in two.
  await page.evaluate(() => {
    const s = window.__snake?.world.snakes[0];
    if (!s) return;
    s.cells = s.cells.slice(0, 15);
    s.prev = s.prev.slice(0, 15);
    s.pos = s.pos.slice(0, 15);
    s.under = s.under.slice(0, 15);
  });
  await expect.poll(() => page.evaluate(() => window.__snake?.world.bossPhase), { timeout: 20_000 }).toBe(2);
  expect(await page.evaluate(() => window.__snake?.world.snakes.length)).toBe(2);
  // One beaten: the last one coils.
  await page.evaluate(() => window.__snake?.world.snakes.splice(1, 1));
  await expect.poll(() => page.evaluate(() => window.__snake?.world.bossPhase), { timeout: 20_000 }).toBe(3);
  await page.screenshot({ path: 'test-results/level10.png' });
  // The last one beaten: the campaign is complete.
  await page.evaluate(() => {
    const w = window.__snake?.world;
    if (w) w.snakes = [];
  });
  await expect(page.locator('#panelComplete')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#cTitle')).toContainText('Campaign');
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

test('an item is picked up, used, and spoils', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?debug=1&god=1&seed=7&quality=low');
  await page.click('#startBtn');
  await expect(page.locator('#hud')).toBeVisible();
  // A gold slingshot right under the player.
  await page.evaluate(() => {
    const w = window.__snake?.world;
    if (!w) return;
    const cell = (v: number) => Math.floor((v + w.grid.half) / w.grid.cell);
    w.drops.push({ id: 999, item: 'slingshot', tier: 'gold', x: cell(w.player.x), z: cell(w.player.z) });
  });
  await expect(page.locator('#slot0')).toHaveClass(/gold/, { timeout: 15_000 });
  await expect(page.locator('#slotUses0')).toHaveText('6');
  await expect(page.locator('#slot0')).toHaveClass(/selected/);
  await page.screenshot({ path: 'test-results/inventory.png' });

  await page.keyboard.press('KeyF');
  await expect(page.locator('#slotUses0')).toHaveText('5', { timeout: 10_000 });

  await page.evaluate(() => {
    const held = window.__snake?.world.inventory[0];
    if (held) held.spoilLeft = 0.01;
  });
  await expect(page.locator('#slot0')).toHaveClass(/empty/, { timeout: 10_000 });
  expect(errors).toEqual([]);
});
