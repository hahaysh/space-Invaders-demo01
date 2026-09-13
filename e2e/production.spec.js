import { test, expect } from '@playwright/test';

test('REQ-08 built game runs at repository subpath with no development hooks or external requests', async ({ page }, testInfo) => {
  const errors = [];
  const urls = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => urls.push(request.url()));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto('http://127.0.0.1:4176/space-Invaders-demo01/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Orbit Defender');
  expect(await page.evaluate(() => '__ORBIT_TEST__' in window)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('title.png') });
  await page.getByRole('button', { name: '방어 시작' }).click();
  await page.clock.runFor(32);
  await page.keyboard.down('Space');
  await page.clock.runFor(1800);
  await page.keyboard.up('Space');
  await expect(page.locator('#status')).toHaveText('방어 진행 중');
  expect(Number(await page.locator('#score').textContent())).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('playing.png') });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.screenshot({ path: testInfo.outputPath('narrow.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(urls.every((url) => url.startsWith('http://127.0.0.1:4176/space-Invaders-demo01/'))).toBe(true);
  expect(urls.some((url) => url.includes('/assets/') && url.endsWith('.js'))).toBe(true);
  expect(urls.some((url) => url.includes('/assets/') && url.endsWith('.css'))).toBe(true);
  expect(urls.some((url) => url.includes('/@vite/') || url.endsWith('.md'))).toBe(false);
  expect(errors).toEqual([]);
});

test('REQ-08 missing Canvas context exposes a Korean error instead of silently running', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await page.goto('http://127.0.0.1:4176/space-Invaders-demo01/');
  await expect(page.getByRole('alert')).toContainText('게임을 실행할 수 없습니다: Canvas 2D를 사용할 수 없습니다.');
  await expect(page.getByRole('button', { name: '방어 시작' })).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect(page.locator('#status')).toHaveText('실행 오류');
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('Canvas 2D를 사용할 수 없습니다.');
  expect(await page.evaluate(() => '__ORBIT_TEST__' in window)).toBe(false);
});
