import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, createState, createEnemies, idleInput, transition, update, overlaps, createClock } from '../src/game.js';
import { build } from 'vite';
import { readFile } from 'node:fs/promises';

const playing = () => transition(createState(), 'start');
function run(state, input, steps) {
  for (let i = 0; i < steps; i += 1) state = update(state, { ...idleInput(), ...input }, RULES.fixedStep);
  return state;
}

test('REQ-01 title, explicit start, excluded restart and immutable state', () => {
  const title = createState();
  assert.equal(title.mode, 'title');
  assert.equal(transition(title, 'restart'), title);
  assert.equal(run(title, { left: true, fire: true }, 120), title);
  const game = transition(title, 'start');
  assert.equal(game.mode, 'playing');
  assert.equal(game.score, 0);
  assert.equal(title.mode, 'title');
  assert.equal(transition(game, 'start'), game);
  assert.equal(transition(game, 'restart'), game);
  assert.deepEqual(game.player, { x: 380, y: 550, width: 40, height: 20 });
});

test('REQ-02 speed, bounds, no vertical movement and opposing inputs', () => {
  const original = playing();
  const right = run(original, { right: true }, 60);
  assert.ok(Math.abs(right.player.x - 540) < 1e-9);
  assert.equal(right.player.y, 550);
  assert.equal(original.player.x, 380);
  assert.equal(run(original, { left: true }, 300).player.x, 0);
  assert.equal(run(original, { right: true }, 300).player.x, 760);
  assert.equal(run(original, { left: true, right: true }, 120).player.x, 380);
});

test('REQ-03 immediate shot exact spawn and upward speed', () => {
  let game = update(playing(), { ...idleInput(), fire: true }, 0);
  assert.deepEqual(game.bullets, [{ x: 398, y: 538, width: 4, height: 12 }]);
  game = update(game, idleInput(), .1);
  assert.equal(game.bullets[0].y, 478);
  const shifted = update(run(playing(), { right: true }, 3), { ...idleInput(), fire: true }, 0);
  assert.equal(shifted.bullets[0].x, shifted.player.x + 18);
});

test('REQ-03 held fire has no shot before 0.2, fires at boundary and repeats', () => {
  const game = playing();
  game.player.x = 0; // Isolate cadence from later enemy collision and consumption.
  const initial = update(game, { ...idleInput(), fire: true }, 0);
  const before = run(initial, { fire: true }, 23);
  assert.equal(before.bullets.length, 1);
  const exact = run(before, { fire: true }, 1);
  assert.equal(exact.bullets.length, 2);
  assert.equal(run(exact, { fire: true }, 1).bullets.length, 2);
  assert.equal(run(initial, { fire: true }, 96).bullets.length, 5);
  assert.equal(update(before, { ...idleInput(), fire: true }, 0).bullets.length, 1);
});

test('REQ-03 bullet bottom just above, exactly at, and past zero', () => {
  for (const [y, remaining] of [[-11.999, 1], [-12, 0], [-12.001, 0]]) {
    const game = playing();
    game.bullets = [{ x: 0, y, width: 4, height: 12 }];
    assert.equal(update(game, idleInput(), 0).bullets.length, remaining);
  }
});

test('Invalid time, input, state and actions fail explicitly', () => {
  for (const dt of [-.001, Infinity, NaN, .101, '0']) assert.throws(() => update(playing(), idleInput(), dt));
  for (const input of [null, {}, { left: 1, right: false, fire: false }, { ...idleInput(), pause: true }]) {
    assert.throws(() => update(playing(), input, 0));
  }
  assert.throws(() => transition(createState(), 'pause'), /Unknown/);
  assert.throws(() => update({ ...playing(), mode: 'paused' }, idleInput(), 0), /mode/);
  assert.throws(() => update({ ...playing(), cooldown: -1 }, idleInput(), 0), /cooldown/);
  assert.throws(() => update({ ...playing(), bullets: [{}] }, idleInput(), 0), /finite/);
  for (const x of [-.001, 760.001, Infinity]) {
    const game = playing();
    game.player.x = x;
    assert.throws(() => update(game, idleInput(), 0));
  }
});

test('Clock fixed 1/120, cap 0.1, reset and invalid timestamps', () => {
  const deltas = [];
  const clock = createClock((dt) => deltas.push(dt));
  clock.advance(0);
  clock.advance(50);
  assert.equal(deltas.length, 6);
  clock.advance(60050);
  assert.equal(deltas.length, 18);
  assert.ok(deltas.every((dt) => dt === 1 / 120));
  clock.reset();
  clock.advance(120000);
  assert.equal(deltas.length, 18);
  assert.throws(() => clock.advance(1), /backwards/);
  assert.throws(() => clock.advance(NaN), /finite/);
  assert.throws(() => createClock(null), /function/);
});

test('REQ-04 exactly 3×8 independent enemies at specified positions and speed', () => {
  const game = playing();
  assert.equal(game.enemies.length, 24);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      assert.deepEqual(game.enemies[row * 8 + col], {
        id: row * 8 + col, x: 112 + col * 72, y: 72 + row * 48, width: 40, height: 24,
      });
    }
  }
  const after = run(game, {}, 120);
  assert.ok(Math.abs(after.enemies[0].x - 176) < 1e-9);
  assert.equal(after.enemies[0].y, 72);
  assert.equal(after.enemyDirection, 1);
  assert.equal(after.enemies.length, 24);
  assert.deepEqual(game.enemies, createEnemies());
  assert.notEqual(createEnemies()[0], game.enemies[0]);
});

test('REQ-04 exact boundary clamps, flips and drops only once on both sides', () => {
  for (const direction of [-1, 1]) {
    const game = playing();
    game.enemyDirection = direction;
    game.enemies = [{ ...game.enemies[0], x: direction === 1 ? 753.6 : 6.4 }];
    const exact = update(game, idleInput(), .1);
    assert.ok(Math.abs(exact.enemies[0].x - (direction === 1 ? 760 : 0)) < 1e-10);
    assert.equal(exact.enemies[0].y, 96);
    assert.equal(exact.enemyDirection, -direction);
    const following = update(exact, idleInput(), .1);
    assert.equal(following.enemies[0].y, 96);
    assert.equal(following.enemyDirection, -direction);
    assert.ok(following.enemies[0].x > 0 && following.enemies[0].x + 40 < 800);
  }
});

test('REQ-04 before / beyond boundary and survivor bounds, no automatic acceleration', () => {
  const game = playing();
  game.enemies = [{ ...game.enemies[0], x: 750 }];
  const before = update(game, idleInput(), .1);
  assert.equal(before.enemyDirection, 1);
  assert.equal(before.enemies[0].y, 72);
  const beyond = update(before, idleInput(), .1);
  assert.equal(beyond.enemies[0].x, 760);
  assert.equal(beyond.enemies[0].y, 96);
  assert.equal(beyond.enemyDirection, -1);
  const survivor = playing();
  survivor.enemies = [survivor.enemies[0]];
  const after = run(survivor, {}, 270);
  assert.equal(after.enemyDirection, 1);
  assert.equal(after.enemies[0].y, 72);
  assert.ok(Math.abs(after.enemies[0].x - 256) < 1e-9);
  assert.equal(after.enemies.length, 1);
});

test('REQ-05 strict area overlap excludes every touching edge and a miss', () => {
  const enemy = { x: 100, y: 100, width: 40, height: 24 };
  for (const [x, y] of [[96, 105], [140, 105], [110, 88], [110, 124], [0, 0]]) {
    const bullet = { x, y, width: 4, height: 12 };
    assert.equal(overlaps(enemy, bullet), false);
    const game = playing();
    game.enemies = [{ ...enemy, id: 0 }];
    game.bullets = [bullet];
    const after = update(game, idleInput(), 0);
    assert.equal(after.score, 0);
    assert.equal(after.enemies.length, 1);
    assert.equal(after.bullets.length, 1);
  }
  assert.equal(overlaps(enemy, { x: 139.999, y: 105, width: 4, height: 12 }), true);
});

test('REQ-05 one bullet removes at most one overlapping enemy', () => {
  const game = playing();
  game.enemies = [
    { ...game.enemies[0], x: 100, y: 100 },
    { ...game.enemies[1], x: 102, y: 100 },
  ];
  game.bullets = [{ x: 110, y: 105, width: 4, height: 12 }];
  const after = update(game, idleInput(), 0);
  assert.equal(after.score, 10);
  assert.equal(after.enemies.length, 1);
  assert.equal(after.enemies[0].id, 1);
  assert.equal(after.bullets.length, 0);
  assert.equal(game.enemies.length, 2);
  assert.equal(game.bullets.length, 1);
});

test('REQ-05 multiple bullets cannot score the same enemy twice; maximum 240', () => {
  const game = playing();
  game.enemies = [game.enemies[0]];
  game.bullets = Array.from({ length: 3 }, () => ({ x: 120, y: 75, width: 4, height: 12 }));
  const after = update(game, idleInput(), 0);
  assert.equal(after.score, 10);
  assert.equal(after.enemies.length, 0);
  assert.equal(after.bullets.length, 2);
  assert.equal(update(after, idleInput(), 0).score, 10);
  const all = playing();
  all.bullets = all.enemies.map((enemy) => ({ x: enemy.x + 1, y: enemy.y + 1, width: 4, height: 12 }));
  const cleared = update(all, idleInput(), 0);
  assert.equal(cleared.score, 240);
  assert.equal(cleared.enemies.length, 0);
  assert.equal(cleared.bullets.length, 0);
  assert.equal(run(cleared, { fire: true }, 100).score, 240);
});

test('REQ-04/05 rejects invalid enemy identities, direction and score', () => {
  const game = playing();
  assert.throws(() => update({ ...game, enemyDirection: 0 }, idleInput(), 0), /direction/);
  assert.throws(() => update({ ...game, enemies: [game.enemies[0], game.enemies[0]] }, idleInput(), 0), /identity/);
  for (const score of [-10, 1, 250, NaN]) assert.throws(() => update({ ...game, score }, idleInput(), 0), /score/);
  assert.throws(() => update({ ...game, score: 240 }, idleInput(), 0), /score/);
  assert.throws(() => update({ ...game, enemies: [{ ...game.enemies[0], x: 761 }] }, idleInput(), 0), /geometry/);
  assert.throws(() => update({ ...game, enemies: [{ ...game.enemies[0], width: 41 }] }, idleInput(), 0), /geometry/);
});

test('REQ-06 survivor bottom below / exactly at / above 520 determines loss', () => {
  for (const [y, mode] of [[495.999, 'playing'], [496, 'lost'], [496.001, 'lost']]) {
    const game = playing();
    game.enemies = [{ ...game.enemies[0], y }];
    assert.equal(update(game, idleInput(), 0).mode, mode);
  }
});

test('REQ-06 collision precedes defeat: removed dangerous enemy never causes loss', () => {
  const game = playing();
  game.enemies = [{ ...game.enemies[0], y: 496 }];
  game.score = 230;
  game.bullets = [{ x: 120, y: 500, width: 4, height: 12 }];
  const winner = update(game, idleInput(), 0);
  assert.equal(winner.mode, 'won');
  assert.equal(winner.score, 240);
  assert.equal(winner.enemies.length, 0);
  const stillPlaying = update({ ...game, enemies: [...game.enemies, { ...createEnemies()[1] }], score: 220 }, idleInput(), 0);
  assert.equal(stillPlaying.mode, 'playing');
  const defeated = update({
    ...game, enemies: [...game.enemies, { ...createEnemies()[1], y: 496 }], score: 220,
  }, idleInput(), 0);
  assert.equal(defeated.mode, 'lost');
  assert.equal(defeated.score, 230);
  assert.equal(defeated.enemies.length, 1);
});

test('REQ-06 boundary descent is reflected before loss and full clearing wins at 240', () => {
  const game = playing();
  game.enemies = [{ ...game.enemies[0], x: 759, y: 472 }];
  assert.equal(update(game, idleInput(), .1).mode, 'lost');
  const all = playing();
  all.bullets = all.enemies.map((enemy) => ({ x: enemy.x + 2, y: enemy.y + 2, width: 4, height: 12 }));
  const won = update(all, idleInput(), 0);
  assert.equal(won.mode, 'won');
  assert.equal(won.score, 240);
});

test('REQ-06/07 both endings freeze all state and restart to independent initial state', () => {
  for (const mode of ['won', 'lost']) {
    const game = {
      ...playing(), mode, score: 230, enemies: [{ ...createEnemies()[0], y: 496 }],
      bullets: [{ x: 120, y: 500, width: 4, height: 12 }], enemyDirection: -1, cooldown: .17,
      player: { x: 17, y: 550, width: 40, height: 20 },
    };
    const saved = structuredClone(game);
    assert.equal(run(game, { left: true, fire: true }, 120), game);
    assert.deepEqual(game, saved);
    assert.equal(transition(game, 'start'), game);
    const restarted = transition(game, 'restart');
    assert.deepEqual(restarted, playing());
    assert.notEqual(restarted.player, game.player);
    assert.notEqual(restarted.enemies, game.enemies);
    assert.equal(update(restarted, { ...idleInput(), fire: true }, 0).bullets.length, 1);
    assert.deepEqual(game, saved);
  }
});

test('REQ-06 a complete no-input round reaches defeat without extra enemies or waves', () => {
  const game = run(playing(), {}, 6600);
  assert.equal(game.mode, 'lost');
  assert.equal(game.score, 0);
  assert.equal(game.enemies.length, 24);
  assert.ok(game.enemies.some((enemy) => enemy.y + enemy.height >= 520));
  assert.equal(run(game, {}, 1200), game);
});

test('REQ-08 original scripts and stable dependency versions match manifest and lock', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.scripts, {
    dev: 'vite',
    test: 'node --test tests/*.test.js',
    'test:e2e': 'playwright test',
    build: 'vite build',
    preview: 'vite preview',
  });
  for (const [name, version] of Object.entries(manifest.devDependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.equal(lock.packages[''].devDependencies[name], version);
    assert.equal(lock.packages[`node_modules/${name}`].version, version);
    assert.match(lock.packages[`node_modules/${name}`].integrity, /^sha(?:1|256|384|512)-[A-Za-z0-9+/]+=*$/);
  }
});

test('REQ-08 source exposes no browser state globals or development-only state API', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /import '\.\/styles\.css';/);
  assert.doesNotMatch(main, /__ORBIT_TEST__|import\.meta\.env\.DEV|window\.[\w$]+\s*=/);
  assert.doesNotMatch(main, /\b(?:inject|snapshot|validateState)\b/);
});

test('REQ-08 production uses relative assets and excludes development hooks and documents', async () => {
  const result = await build({ logLevel: 'silent', build: { write: false } });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output);
  const html = outputs.find((file) => file.fileName === 'index.html').source;
  assert.match(html, /(?:src|href)="\.\/assets\//);
  for (const file of outputs) {
    const text = String(file.code ?? file.source);
    assert.doesNotMatch(text, /__ORBIT_TEST__|snapshot:|inject\(next\)|https?:\/\/|cdn\./);
    assert.doesNotMatch(file.fileName, /\.md$|tests|e2e/);
  }
});
