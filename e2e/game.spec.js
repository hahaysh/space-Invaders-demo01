import { test, expect } from '@playwright/test';

const advance = (page, ms) => page.clock.runFor(ms);
const score = async (page) => Number(await page.locator('#score').textContent());

// Observe rendered pixels only; this never reads or changes the game model.
async function picture(page) {
  return page.locator('canvas').evaluate((canvas) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, 800, 600);
    const player = [];
    const bullets = [];
    let hash = 2166136261;
    let enemyLeft = 800;
    for (let y = 0; y < 600; y += 1) {
      for (let x = 0; x < 800; x += 1) {
        const i = (y * 800 + x) * 4;
        hash = Math.imul(hash ^ data[i] ^ (data[i + 1] << 8) ^ (data[i + 2] << 16), 16777619);
        if (y >= 550 && data[i] === 131 && data[i + 1] === 241 && data[i + 2] === 212) player.push(x);
        if (data[i] === 255 && data[i + 1] === 229 && data[i + 2] === 161) bullets.push({ x, y });
        if (data[i] === 169 && data[i + 1] === 186 && data[i + 2] === 255) enemyLeft = Math.min(enemyLeft, x);
      }
    }
    const rows = [...new Set(bullets.map((pixel) => pixel.y))].sort((a, b) => a - b);
    const bulletCount = rows.filter((y, i) => i === 0 || y !== rows[i - 1] + 1).length;
    return { left: Math.min(...player), right: Math.max(...player), enemyLeft, bulletCount, bulletXs: [...new Set(bullets.map((pixel) => pixel.x))], hash };
  });
}

async function listenerCounts(cdp) {
  const counts = [];
  const targets = [
    ['window', ['keydown', 'keyup', 'blur']],
    ['document', ['focusin', 'visibilitychange']],
    ['document.querySelector("#start")', ['click']],
    ['document.querySelector("#restart")', ['click']],
    ['document.querySelector("#difficulty")', ['change']],
  ];
  for (const [expression, eventTypes] of targets) {
    const { result } = await cdp.send('Runtime.evaluate', { expression });
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
    counts.push(listeners.filter((listener) => eventTypes.includes(listener.type)).map((listener) => listener.type).sort());
    await cdp.send('Runtime.releaseObject', { objectId: result.objectId });
  }
  return counts;
}

test.describe('실제 게임 조작', () => {
test.beforeEach(async ({ page }) => {
  page.testErrors = [];
  page.on('pageerror', (error) => page.testErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') page.testErrors.push(message.text()); });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '방어 시작' })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(page.testErrors).toEqual([]);
});

test('REQ-01/08 semantic title, inactive keys, no state globals and responsive Canvas', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Orbit Defender');
  const before = await picture(page);
  await page.keyboard.press('r');
  await page.keyboard.press('p');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('Space');
  await advance(page, 500);
  await expect(page.locator('#status')).toHaveText('출격 대기');
  expect(await picture(page)).toEqual(before);
  expect(await page.evaluate(() => '__ORBIT_TEST__' in window)).toBe(false);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('Space');
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator('canvas')).toHaveAttribute('width', '800');
  await expect(page.locator('canvas')).toHaveAttribute('height', '600');
  expect((await page.locator('canvas').boundingBox()).width).toBeLessThan(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('REQ-02 real direction/A/D keys, opposing input and rasterized screen boundaries', async ({ page }) => {
  await page.keyboard.press('Enter');
  await advance(page, 32);
  const initial = await picture(page);
  await page.keyboard.down('d');
  await advance(page, 512);
  // Complete RAF slots avoid a partial frame; allow one fixed step plus rasterization.
  expect(Math.abs((await picture(page)).left - initial.left - .512 * 320)).toBeLessThanOrEqual(320 / 120 + 1);
  await page.keyboard.down('ArrowLeft');
  const stopped = (await picture(page)).left;
  await advance(page, 200);
  expect((await picture(page)).left).toBe(stopped);
  await page.keyboard.up('d');
  await advance(page, 2000);
  expect((await picture(page)).left).toBe(1);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('ArrowRight');
  await advance(page, 3000);
  expect((await picture(page)).right).toBe(798);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('a');
  await advance(page, 100);
  expect((await picture(page)).right).toBeLessThan(798);
  await page.keyboard.up('a');
  const before = await picture(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press('r');
  expect(await picture(page)).toEqual(before);
  await expect(page.locator('#status')).toHaveText('방어 진행 중');
});

test('REQ-03 Start button releases focus and real held Space shoots without key-repeat acceleration', async ({ page }) => {
  await page.getByRole('button', { name: '방어 시작' }).click();
  await advance(page, 32);
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe('BUTTON');
  await page.keyboard.down('Space');
  await advance(page, 16);
  expect((await picture(page)).bulletCount).toBe(1);
  expect((await picture(page)).bulletXs).toEqual([398, 399, 400, 401]);
  await page.keyboard.down('Space');
  await advance(page, 160);
  expect((await picture(page)).bulletCount).toBe(1);
  await advance(page, 64);
  expect((await picture(page)).bulletCount).toBe(2);
  await page.keyboard.up('Space');
  await advance(page, 1000);
  expect((await picture(page)).bulletCount).toBe(0);
});

test('REQ-02/03 browser blur / hidden events clear keys and avoid large resume jumps', async ({ page }) => {
  await page.keyboard.press('Enter');
  await advance(page, 32);
  for (const eventName of ['blur', 'visibilitychange']) {
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('Space');
    await advance(page, 100);
    await page.evaluate((name) => {
      if (name === 'blur') window.dispatchEvent(new Event('blur'));
      else {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }
    }, eventName);
    const x = (await picture(page)).left;
    await page.clock.fastForward(60000);
    if (eventName === 'visibilitychange') {
      await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }
    await advance(page, 1200);
    await expect(page.locator('#status')).toHaveText('방어 진행 중');
    expect((await picture(page)).left).toBe(x);
    expect((await picture(page)).bulletCount).toBe(0);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('Space');
  }
});

test('REQ-08 native button and selector keyboard events remain native', async ({ page }) => {
  await page.getByRole('button', { name: '방어 시작' }).focus();
  await page.keyboard.press('Space');
  await advance(page, 32);
  await expect(page.locator('#status')).toHaveText('방어 진행 중');
  await page.evaluate(() => {
    const select = document.createElement('select');
    select.setAttribute('aria-label', '테스트용 네이티브 선택');
    select.innerHTML = '<option>첫째</option><option>둘째</option>';
    document.body.append(select);
    window.addEventListener('keydown', (event) => {
      if (event.defaultPrevented) select.dataset.prevented = 'true';
    });
    select.focus();
  });
  const x = (await picture(page)).left;
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await page.keyboard.press('p');
  await advance(page, 100);
  await expect(page.locator('#status')).toHaveText('방어 진행 중');
  await expect(page.getByRole('combobox', { name: '테스트용 네이티브 선택' })).not.toHaveAttribute('data-prevented', 'true');
  expect((await picture(page)).left).toBe(x);
  expect((await picture(page)).bulletCount).toBe(0);
});

test('REQ-01 title-held input and repeats never leak into the started game', async ({ page }) => {
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('Space');
  await page.keyboard.press('Enter');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('Space');
  await advance(page, 300);
  expect((await picture(page)).left).toBe(381);
  expect((await picture(page)).bulletCount).toBe(0);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('Space');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('Space');
  await advance(page, 32);
  expect((await picture(page)).left).toBeLessThan(381);
  expect((await picture(page)).bulletCount).toBe(1);
});

test('Clock long frame is capped without a browser test-state API', async ({ page }) => {
  await page.keyboard.press('Enter');
  await advance(page, 32);
  const x = (await picture(page)).left;
  await page.keyboard.down('ArrowRight');
  await page.clock.fastForward(60000);
  const movement = (await picture(page)).left - x;
  expect(movement).toBeGreaterThan(0);
  expect(movement).toBeLessThanOrEqual(33);
  await page.keyboard.up('ArrowRight');
});

test('REQ-05 actual held Space hits and updates the Korean DOM score', async ({ page }) => {
  await page.getByRole('button', { name: '방어 시작' }).click();
  await advance(page, 32);
  await page.keyboard.down('Space');
  await advance(page, 1800);
  await page.keyboard.up('Space');
  expect(await score(page)).toBeGreaterThan(0);
  expect((await score(page)) % 10).toBe(0);
  expect(await score(page)).toBeLessThanOrEqual(240);
});

test('REQ-07 ten real restarts keep movement, firing and listener counts stable', async ({ page }) => {
  test.setTimeout(240000);
  const cdp = await page.context().newCDPSession(page);
  const baseline = await listenerCounts(cdp);
  expect(baseline[0]).toEqual(['blur', 'keydown', 'keyup']);
  expect(baseline[1]).toEqual(['focusin', 'visibilitychange']);
  expect(baseline[2]).toEqual(['click']);
  expect(baseline[3]).toEqual(['click']);
  expect(baseline[4]).toEqual(['change']);
  await page.keyboard.press('Enter');
  for (let round = 0; round <= 10; round += 1) {
    await advance(page, 32);
    expect((await picture(page)).left).toBe(381);
    expect(await score(page)).toBe(0);
    await page.keyboard.down('ArrowRight');
    await advance(page, 512);
    expect(Math.abs((await picture(page)).left - 381 - .512 * 320)).toBeLessThanOrEqual(320 / 120 + 1);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('Space');
    await advance(page, 16);
    expect((await picture(page)).bulletCount).toBe(1);
    await advance(page, 224);
    expect((await picture(page)).bulletCount).toBe(2);
    await page.keyboard.up('Space');
    expect(await listenerCounts(cdp)).toEqual(baseline);
    if (round === 10) break;
    await advance(page, 55000);
    await expect(page.locator('#status')).toContainText('패배');
    if (round % 2 === 0) await page.keyboard.press('r');
    else await page.getByRole('button', { name: '다시 도전' }).click();
  }
  await cdp.detach();
});

test('CHG-01 AC1..6 held P, long pause, frozen scene and cooldown, cleared inputs and blur', async ({ page }, testInfo) => {
  await page.keyboard.press('Enter');
  await advance(page, 32);
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('Space');
  await advance(page, 16);
  await page.keyboard.down('p');
  await expect(page.locator('#status')).toHaveText('일시정지');
  await expect(page.getByRole('heading', { name: '일시정지', exact: true })).toBeVisible();
  await expect(page.locator('#detail')).toContainText('P를 눌러');
  await expect(page.getByRole('button')).toHaveCount(0);
  const frozen = await picture(page);
  const pausedScore = await score(page);
  await page.keyboard.down('p');
  await page.keyboard.press('Enter');
  await page.keyboard.press('r');
  await page.keyboard.down('a');
  await page.clock.fastForward(60000);
  await expect(page.locator('#status')).toHaveText('일시정지');
  expect(await picture(page)).toEqual(frozen);
  expect(await score(page)).toBe(pausedScore);
  await page.screenshot({ path: testInfo.outputPath('paused.png') });
  await page.keyboard.up('p');
  await page.keyboard.down('p');
  await page.keyboard.down('p');
  await page.keyboard.up('p');
  await advance(page, 64);
  await expect(page.locator('#status')).toHaveText('방어 진행 중');
  expect((await picture(page)).left).toBe(frozen.left);
  expect((await picture(page)).bulletCount).toBe(1);
  await page.keyboard.up('a');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Space');
  await page.keyboard.down('Space');
  await advance(page, 96);
  expect((await picture(page)).bulletCount).toBe(1);
  await advance(page, 64);
  expect((await picture(page)).bulletCount).toBe(2);
  await page.keyboard.up('Space');
  await page.keyboard.press('p');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#status')).toHaveText('일시정지');
});

test('CHG-01 AC5/6/7 ten pause cycles preserve speed, clear held keys and keep one set of listeners', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  const baseline = await listenerCounts(cdp);
  await page.keyboard.press('Enter');
  await advance(page, 32);
  for (let cycle = 0; cycle < 10; cycle += 1) {
    const key = cycle % 2 === 0 ? 'ArrowLeft' : 'ArrowRight';
    const direction = cycle % 2 === 0 ? -1 : 1;
    const x = (await picture(page)).left;
    await page.keyboard.down(key);
    await advance(page, 512);
    expect(Math.abs((await picture(page)).left - x - direction * .512 * 320)).toBeLessThanOrEqual(320 / 120 + 1);
    await page.keyboard.press('p');
    const frozen = await picture(page);
    await page.clock.fastForward(60000);
    expect(await picture(page)).toEqual(frozen);
    await page.keyboard.press('p');
    await advance(page, 64);
    expect((await picture(page)).left).toBe(frozen.left);
    await page.keyboard.up(key);
    expect(await listenerCounts(cdp)).toEqual(baseline);
    await expect(page.locator('#status')).toHaveText('방어 진행 중');
  }
  await cdp.detach();
});

for (const [value, speed, label] of [['easy', 32, '쉬움'], ['normal', 64, '보통'], ['hard', 96, '어려움']]) {
  test(`CHG-02 ${value} actual speed, locked selection and pause/cooldown`, async ({ page }) => {
    const select = page.getByRole('combobox', { name: '다음 게임 난이도' });
    await select.selectOption(value);
    await expect(page.locator('#difficulty-current')).toHaveText(`선택 난이도: ${label}`);
    await page.getByRole('button', { name: '방어 시작' }).click();
    await advance(page, 32);
    await expect(select).toBeDisabled();
    await expect(page.locator('#difficulty-current')).toHaveText(`이번 게임 난이도: ${label}`);
    const x = (await picture(page)).enemyLeft;
    await advance(page, 512);
    expect(Math.abs((await picture(page)).enemyLeft - x - speed * .512)).toBeLessThanOrEqual(speed / 120 + 1);
    const forged = value === 'hard' ? 'easy' : 'hard';
    await select.evaluate((element, other) => {
      element.disabled = false;
      element.value = other;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, forged);
    await expect(select).toBeDisabled();
    await expect(select).toHaveValue(value);
    await page.keyboard.down('Space');
    await advance(page, 16);
    await page.keyboard.press('p');
    await select.evaluate((element, other) => {
      element.disabled = false;
      element.value = other;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, forged);
    await expect(select).toBeDisabled();
    await expect(select).toHaveValue(value);
    const frozen = await picture(page);
    await page.clock.fastForward(60000);
    expect(await picture(page)).toEqual(frozen);
    await page.keyboard.press('p');
    await advance(page, 64);
    const resumed = await picture(page);
    expect(resumed.left).toBe(frozen.left);
    expect(Math.abs(resumed.enemyLeft - frozen.enemyLeft)).toBeLessThanOrEqual(speed * .064 + speed / 120 + 1);
    expect(resumed.bulletCount).toBe(1);
    await page.keyboard.up('Space');
    await page.keyboard.down('Space');
    await advance(page, 96);
    expect((await picture(page)).bulletCount).toBe(1);
    await advance(page, 64);
    expect((await picture(page)).bulletCount).toBe(2);
    await page.keyboard.up('Space');
  });
}

test('CHG-02 native difficulty keyboard selection never starts play and refresh resets normal', async ({ page }) => {
  const select = page.getByRole('combobox', { name: '다음 게임 난이도' });
  await expect(select).toHaveValue('normal');
  await select.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('p');
  await advance(page, 256);
  await expect(page.locator('#status')).toHaveText('출격 대기');
  await expect(select).toHaveValue('hard');
  expect((await picture(page)).left).toBe(381);
  expect((await picture(page)).bulletCount).toBe(0);
  await select.evaluate((element) => element.blur());
  await page.keyboard.press('Enter');
  await expect(page.locator('#difficulty-current')).toHaveText('이번 게임 난이도: 어려움');
  await page.reload();
  await expect(select).toHaveValue('normal');
  await expect(page.locator('#difficulty-current')).toHaveText('선택 난이도: 보통');
});

async function clearWave(page) {
  await page.keyboard.down('Space');
  for (let i = 0; i < 30 && await score(page) < 240; i += 1) {
    const key = i % 2 === 0 ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.down(key);
    await advance(page, 1000);
    await page.keyboard.up(key);
  }
  await page.keyboard.up('Space');
  expect(await score(page)).toBe(240);
}

for (const outcome of ['won', 'lost']) {
  test(`CHG-02 ${outcome} keeps current difficulty until an easy restart is applied`, async ({ page }) => {
    test.setTimeout(90000);
    const select = page.getByRole('combobox', { name: '다음 게임 난이도' });
    await select.selectOption('hard');
    await page.getByRole('button', { name: '방어 시작' }).click();
    await advance(page, 32);
    if (outcome === 'won') await clearWave(page);
    else await advance(page, 40000);
    await expect(page.locator('#status')).toContainText(outcome === 'won' ? '승리' : '패배');
    await expect(select).toBeEnabled();
    await select.selectOption('easy');
    await expect(page.locator('#difficulty-current')).toHaveText('이번 게임 난이도: 어려움');
    await page.getByRole('button', { name: '다시 도전' }).click();
    await advance(page, 32);
    await expect(page.locator('#difficulty-current')).toHaveText('이번 게임 난이도: 쉬움');
    await expect(select).toBeDisabled();
    expect(await score(page)).toBe(0);
    const x = (await picture(page)).enemyLeft;
    await advance(page, 512);
    expect(Math.abs((await picture(page)).enemyLeft - x - 32 * .512)).toBeLessThanOrEqual(32 / 120 + 1);
    await page.keyboard.down('Space');
    await advance(page, 16);
    expect((await picture(page)).bulletCount).toBe(1);
    await page.keyboard.up('Space');
  });
}

async function assertFrozenAndRestart(page, outcome, method) {
  await expect(page.locator('#status')).toContainText(outcome);
  const finalScore = await score(page);
  const frozen = await picture(page);
  await expect(page.locator('#detail')).toContainText(`최종 점수 ${finalScore}점`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('p');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('Space');
  await advance(page, 1000);
  expect(await picture(page)).toEqual(frozen);
  expect(await score(page)).toBe(finalScore);
  if (method === 'key') await page.keyboard.press('r');
  else await page.getByRole('button', { name: '다시 도전' }).click();
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('Space');
  await advance(page, 64);
  await expect(page.locator('#status')).toHaveText('방어 진행 중');
  expect(await score(page)).toBe(0);
  expect((await picture(page)).left).toBe(381);
  expect((await picture(page)).bulletCount).toBe(0);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Space');
  await page.keyboard.down('Space');
  await advance(page, 16);
  expect((await picture(page)).bulletCount).toBe(1);
  await page.keyboard.up('Space');
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe('BUTTON');
}

for (const method of ['key', 'button']) {
  test(`REQ-06/07 natural no-shoot defeat freezes and ${method} restarts`, async ({ page }) => {
    test.setTimeout(90000);
    await page.keyboard.press('Enter');
    await advance(page, 55000);
    expect(await score(page)).toBe(0);
    await assertFrozenAndRestart(page, '패배', method);
  });

  test(`REQ-06/07 real movement and firing clear the wave; ${method} restarts victory`, async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await page.keyboard.press('Enter');
    await advance(page, 32);
    await clearWave(page);
    await expect(page.getByRole('heading', { name: '궤도를 지켜냈습니다' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('real-victory.png') });
    await assertFrozenAndRestart(page, '승리', method);
    const x = (await picture(page)).left;
    await page.keyboard.down('ArrowRight');
    // 512ms spans 32 of Playwright clock's 16ms RAF slots, avoiding a partial final frame.
    await advance(page, 512);
    expect(Math.abs((await picture(page)).left - x - .512 * 320)).toBeLessThanOrEqual(320 / 120 + 1);
    await page.keyboard.up('ArrowRight');
  });
}
});

test('REQ-08 built game runs at repository subpath with no development hooks or external requests', async ({ page }, testInfo) => {
  const errors = [];
  const urls = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => urls.push(request.url()));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto('http://127.0.0.1:4173/space-Invaders-demo01/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Orbit Defender');
  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveAttribute('href', /^data:image\/svg\+xml,/);
  expect(await icon.evaluate(async (link) => {
    const image = new Image();
    image.src = link.href;
    await image.decode();
    return image.naturalWidth > 0 && image.naturalHeight > 0;
  })).toBe(true);
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
  expect(urls.every((url) => url.startsWith('http://127.0.0.1:4173/space-Invaders-demo01/'))).toBe(true);
  expect(urls.some((url) => url.includes('/assets/') && url.endsWith('.js'))).toBe(true);
  expect(urls.some((url) => url.includes('/assets/') && url.endsWith('.css'))).toBe(true);
  expect(urls.some((url) => url.includes('/@vite/') || url.endsWith('.md'))).toBe(false);
  expect(errors).toEqual([]);
});

test('REQ-08 missing Canvas context exposes a Korean error instead of silently running', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await page.goto('http://127.0.0.1:4173/space-Invaders-demo01/');
  await expect(page.getByRole('alert')).toContainText('게임을 실행할 수 없습니다: Canvas 2D를 사용할 수 없습니다.');
  await expect(page.getByRole('button', { name: '방어 시작' })).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect(page.locator('#status')).toHaveText('실행 오류');
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('Canvas 2D를 사용할 수 없습니다.');
  expect(await page.evaluate(() => '__ORBIT_TEST__' in window)).toBe(false);
});

test('CHG-02 unsupported DOM selection reports an error and stops rather than falling back', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto('/');
  await page.keyboard.press('Enter');
  await advance(page, 32);
  await page.locator('#difficulty').evaluate((select) => {
    select.add(new Option('지원하지 않는 값', 'invalid'));
    select.value = 'invalid';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByRole('alert')).toContainText('게임을 실행할 수 없습니다: Unsupported difficulty');
  await expect(page.locator('#status')).toHaveText('실행 오류');
  await expect(page.locator('#difficulty')).toBeDisabled();
  const frozen = await picture(page);
  await page.keyboard.press('p');
  await advance(page, 1000);
  expect(await picture(page)).toEqual(frozen);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('Unsupported difficulty');
});
