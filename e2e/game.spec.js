import { test, expect } from '@playwright/test';

const snapshot = (page) => page.evaluate(() => window.__ORBIT_TEST__.snapshot());
const input = (page) => page.evaluate(() => window.__ORBIT_TEST__.input());
const advance = (page, ms) => page.clock.runFor(ms);

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__ORBIT_TEST__));
});

test('REQ-01/08 semantic title, inactive keys and responsive logical Canvas', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Orbit Defender');
  await expect(page.getByRole('status').filter({ hasText: '출격 대기' })).toBeVisible();
  await page.keyboard.press('r');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('Space');
  await advance(page, 500);
  expect((await snapshot(page)).mode).toBe('title');
  expect((await snapshot(page)).player.x).toBe(380);
  expect((await snapshot(page)).bullets).toHaveLength(0);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('Space');
  await page.setViewportSize({ width: 390, height: 800 });
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('width', '800');
  await expect(canvas).toHaveAttribute('height', '600');
  expect((await canvas.boundingBox()).width).toBeLessThan(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('REQ-01/02 Enter starts, movement aliases, opposing keys and boundaries', async ({ page }) => {
  await page.keyboard.press('Enter');
  await advance(page, 32);
  await expect(page.locator('#status')).toHaveText('방어 진행 중');
  const startX = (await snapshot(page)).player.x;
  await page.keyboard.down('d');
  await advance(page, 500);
  expect((await snapshot(page)).player.x - startX).toBeCloseTo(160, 0);
  await page.keyboard.down('ArrowLeft');
  const x = (await snapshot(page)).player.x;
  await advance(page, 200);
  expect((await snapshot(page)).player.x).toBe(x);
  await page.keyboard.up('d');
  await advance(page, 2000);
  expect((await snapshot(page)).player.x).toBe(0);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('ArrowRight');
  await advance(page, 3000);
  expect((await snapshot(page)).player.x).toBe(760);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('a');
  await advance(page, 100);
  expect((await snapshot(page)).player.x).toBeLessThan(760);
  await page.keyboard.up('a');
  const before = await snapshot(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press('r');
  await page.keyboard.press('p');
  expect(await snapshot(page)).toEqual(before);
});

test('REQ-03 clicked Start releases button focus so Space shoots at fixed rate', async ({ page }) => {
  await page.getByRole('button', { name: '방어 시작' }).click();
  await advance(page, 32);
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe('BUTTON');
  await page.keyboard.down('Space');
  await advance(page, 16);
  const first = await snapshot(page);
  expect(first.bullets).toHaveLength(1);
  expect(first.bullets[0].x).toBe(398);
  await page.keyboard.down('Space');
  await advance(page, 160);
  expect((await snapshot(page)).bullets).toHaveLength(1);
  await advance(page, 64);
  expect((await snapshot(page)).bullets).toHaveLength(2);
  await page.keyboard.up('Space');
  await advance(page, 1000);
  expect((await snapshot(page)).bullets).toHaveLength(0);
});

test('REQ-02/03 blur and hidden document clear held input and timing', async ({ page }) => {
  await page.keyboard.press('Enter');
  await advance(page, 32);
  for (const signal of ['blur', 'visibilitychange']) {
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('Space');
    await advance(page, 100);
    await page.evaluate((eventName) => {
      if (eventName === 'blur') window.dispatchEvent(new Event('blur'));
      else {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }
    }, signal);
    expect(await input(page)).toEqual({ left: false, right: false, fire: false });
    const x = (await snapshot(page)).player.x;
    await page.clock.fastForward(60000);
    if (signal === 'visibilitychange') {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }
    await advance(page, 32);
    expect((await snapshot(page)).player.x).toBe(x);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('Space');
  }
});

test('REQ-08 native button / selector events are not swallowed', async ({ page }) => {
  await page.getByRole('button', { name: '방어 시작' }).focus();
  await page.keyboard.press('Space');
  await advance(page, 32);
  expect((await snapshot(page)).mode).toBe('playing');
  await page.evaluate(() => {
    const select = document.createElement('select');
    select.setAttribute('aria-label', '테스트용 네이티브 선택');
    select.innerHTML = '<option>첫째</option><option>둘째</option>';
    document.body.append(select);
    window.nativeEvents = [];
    window.addEventListener('keydown', (event) => window.nativeEvents.push(event.defaultPrevented));
    select.focus();
  });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await advance(page, 100);
  expect(await page.evaluate(() => window.nativeEvents)).not.toContain(true);
  expect(await input(page)).toEqual({ left: false, right: false, fire: false });
  expect((await snapshot(page)).bullets).toHaveLength(0);
});

test('Clock real RAF is single, fixed and capped after a long frame', async ({ page }) => {
  await page.keyboard.press('Enter');
  await advance(page, 32);
  const steps = await page.evaluate(() => window.__ORBIT_TEST__.timing().steps);
  await advance(page, 1000);
  const later = await page.evaluate(() => window.__ORBIT_TEST__.timing().steps);
  expect(later - steps).toBeGreaterThanOrEqual(118);
  expect(later - steps).toBeLessThanOrEqual(122);
  await page.keyboard.down('ArrowRight');
  const x = (await snapshot(page)).player.x;
  await page.clock.fastForward(60000);
  expect((await snapshot(page)).player.x - x).toBeLessThanOrEqual(32.00001);
  await page.keyboard.up('ArrowRight');
});

test('REQ-04 real clock moves 24 enemies and reflects at the edge once', async ({ page }) => {
  const initial = await snapshot(page);
  expect(initial.enemies).toHaveLength(24);
  expect(initial.enemies[23]).toEqual({ id: 23, x: 616, y: 168, width: 40, height: 24 });
  await advance(page, 300);
  expect((await snapshot(page)).enemies).toEqual(initial.enemies);
  await page.keyboard.press('Enter');
  await advance(page, 32);
  const before = (await snapshot(page)).enemies[0].x;
  const beforeSteps = await page.evaluate(() => window.__ORBIT_TEST__.timing().steps);
  await advance(page, 1000);
  const after = await snapshot(page);
  const afterSteps = await page.evaluate(() => window.__ORBIT_TEST__.timing().steps);
  expect(afterSteps - beforeSteps).toBeGreaterThanOrEqual(118);
  expect(afterSteps - beforeSteps).toBeLessThanOrEqual(122);
  expect(after.enemies[0].x - before).toBeCloseTo((afterSteps - beforeSteps) / 120 * 64, 8);
  expect(after.enemies[0].y).toBe(72);
  await advance(page, 1300);
  const boundary = await snapshot(page);
  expect(boundary.enemyDirection).toBe(-1);
  expect(boundary.enemies.every((enemy) => enemy.x >= 0 && enemy.x + enemy.width <= 800)).toBe(true);
  expect(boundary.enemies[0].y).toBe(96);
  await advance(page, 100);
  expect((await snapshot(page)).enemies[0].y).toBe(96);
});

test('REQ-05 real held Space hits enemies and DOM score follows the model', async ({ page }) => {
  await page.getByRole('button', { name: '방어 시작' }).click();
  await advance(page, 32);
  await page.keyboard.down('Space');
  await advance(page, 1800);
  await page.keyboard.up('Space');
  const game = await snapshot(page);
  expect(game.score).toBeGreaterThan(0);
  expect(game.score).toBe((24 - game.enemies.length) * 10);
  await expect(page.locator('#score')).toHaveText(String(game.score));
});

test('REQ-05 injected overlap fixture uses the actual loop and scores once', async ({ page }) => {
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const game = window.__ORBIT_TEST__.snapshot();
    game.enemies = [{ ...game.enemies[0], x: 100, y: 100 }];
    game.bullets = Array.from({ length: 3 }, () => ({ x: 110, y: 115, width: 4, height: 12 }));
    window.__ORBIT_TEST__.inject(game);
  });
  await advance(page, 32);
  const after = await snapshot(page);
  expect(after.score).toBe(10);
  expect(after.enemies).toHaveLength(0);
  expect(after.bullets).toHaveLength(2);
  await expect(page.locator('#score')).toHaveText('10');
  await advance(page, 300);
  expect((await snapshot(page)).score).toBe(10);
});
