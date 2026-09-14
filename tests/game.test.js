import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, DIFFICULTIES, createState, createEnemies, selectDifficulty, idleInput, transition, update, overlaps, createClock } from '../src/game.js';
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
  assert.throws(() => update({ ...playing(), mode: 'unknown' }, idleInput(), 0), /mode/);
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

test('CHG-01 AC1/8 pause toggles only playing and paused; other actions remain gated', () => {
  const game = playing();
  const before = structuredClone(game);
  const paused = transition(game, 'togglePause');
  assert.equal(paused.mode, 'paused');
  assert.deepEqual({ ...paused, mode: 'playing' }, before);
  assert.deepEqual(game, before);
  assert.deepEqual(transition(paused, 'togglePause'), before);
  for (const action of ['start', 'restart']) assert.equal(transition(paused, action), paused);
  for (const mode of ['title', 'won', 'lost']) {
    const inactive = { ...createState(), mode, lives: mode === 'lost' ? 0 : 3 };
    assert.equal(transition(inactive, 'togglePause'), inactive);
  }
});

test('CHG-01 AC3 pause freezes every value for 60 seconds and preserves exact cooldown boundary', () => {
  const game = playing();
  game.player.x = 0;
  game.enemies.shift();
  game.score = 10;
  const fired = update(game, { ...idleInput(), fire: true }, 0);
  for (const elapsedSteps of [0, 12]) {
    const paused = transition(run(fired, {}, elapsedSteps), 'togglePause');
    const snapshot = structuredClone(paused);
    for (let i = 0; i < 600; i += 1) {
      assert.deepEqual(update(paused, { left: true, right: false, fire: true }, .1), snapshot);
    }
    assert.deepEqual(paused, snapshot);
    assert.equal(paused.score, 10);
    assert.ok(Math.abs(paused.cooldown - (.2 - elapsedSteps / 120)) < 1e-12);
    const resumed = transition(paused, 'togglePause');
    const before = run(resumed, { fire: true }, 23 - elapsedSteps);
    assert.equal(before.bullets.length, 1);
    assert.equal(run(before, { fire: true }, 1).bullets.length, 2);
  }
});

test('CHG-01 AC6/7 repeated resume resets the time baseline without accumulating paused time', () => {
  let game = playing();
  const clock = createClock((dt) => { game = update(game, { ...idleInput(), right: true }, dt); });
  clock.advance(0);
  clock.advance(50);
  for (let i = 1; i <= 10; i += 1) {
    game = transition(game, 'togglePause');
    const snapshot = structuredClone(game);
    const steps = clock.inspect().steps;
    clock.reset();
    game = transition(game, 'togglePause');
    clock.advance(i * 60000);
    assert.deepEqual(game, { ...snapshot, mode: 'playing' });
    assert.equal(clock.inspect().steps, steps);
    clock.advance(i * 60000 + 50);
    assert.equal(clock.inspect().steps, steps + 6);
    assert.ok(Math.abs(game.player.x - snapshot.player.x - 16) < 1e-9);
  }
});

test('CHG-02 AC1/9 difficulty defaults are distinct from unsupported values', () => {
  assert.deepEqual(Object.keys(DIFFICULTIES), ['easy', 'normal', 'hard']);
  assert.equal(createState().difficulty, 'normal');
  assert.deepEqual(createState(undefined), createState('normal'));
  for (const invalid of ['', 'extreme', 'constructor', '__proto__', null, 0, {}]) {
    assert.throws(() => createState(invalid), /Unsupported difficulty/);
    assert.throws(() => selectDifficulty(playing(), invalid), /Unsupported difficulty/);
  }
  assert.throws(() => selectDifficulty(createState(), undefined), /Unsupported difficulty/);
  assert.throws(() => update({ ...playing(), difficulty: 'extreme' }, idleInput(), 0), /difficulty/);
  assert.throws(() => update({ ...playing(), selectedDifficulty: null }, idleInput(), 0), /difficulty/);
});

test('CHG-02 AC2/3/4 pending selection applies only on start or restart and is locked during play', () => {
  for (const mode of ['title', 'won', 'lost']) {
    const original = { ...createState(), mode, lives: mode === 'lost' ? 0 : 3 };
    const selected = selectDifficulty(original, 'hard');
    assert.equal(selected.selectedDifficulty, 'hard');
    assert.equal(selected.difficulty, 'normal');
    assert.deepEqual({ ...selected, selectedDifficulty: 'normal' }, original);
    const started = transition(selected, mode === 'title' ? 'start' : 'restart');
    assert.deepEqual(started, { ...createState('hard'), mode: 'playing' });
    assert.equal(selectDifficulty(started, 'easy'), started);
    const paused = transition(started, 'togglePause');
    assert.equal(selectDifficulty(paused, 'easy'), paused);
    assert.equal(transition(paused, 'togglePause').difficulty, 'hard');
  }
});

test('CHG-02 AC1/6/7 selected enemy speeds change distance only and every difficulty freezes', () => {
  for (const [difficulty, speed] of [['easy', 32], ['normal', 64], ['hard', 96]]) {
    assert.equal(DIFFICULTIES[difficulty].enemySpeed, speed);
    const game = transition(createState(difficulty), 'start');
    const next = update(game, { left: false, right: true, fire: true }, .1);
    assert.ok(Math.abs(next.enemies[0].x - 112 - speed * .1) < 1e-9);
    assert.equal(next.enemies.length, 24);
    assert.equal(next.enemies[0].y, 72);
    assert.equal(next.player.x, 412);
    assert.equal(next.player.y, 550);
    assert.equal(next.bullets[0].y, 478);
    assert.equal(next.cooldown, .2);
    const paused = transition(next, 'togglePause');
    const snapshot = structuredClone(paused);
    for (let i = 0; i < 600; i += 1) assert.deepEqual(update(paused, idleInput(), .1), snapshot);
    assert.deepEqual(transition(paused, 'togglePause'), next);
  }
});

test('CHG-02 AC6/10 every speed uses the same distance for both wall boundaries and one drop', () => {
  for (const [difficulty, speed] of [['easy', 32], ['normal', 64], ['hard', 96]]) {
    for (const direction of [-1, 1]) {
      const game = transition(createState(difficulty), 'start');
      game.enemies = [game.enemies[0]];
      game.enemyDirection = direction;
      game.enemies[0].x = direction === 1 ? 760 - speed * .05 : speed * .05;
      const before = update(game, idleInput(), .049999);
      assert.equal(before.enemyDirection, direction);
      assert.equal(before.enemies[0].y, 72);
      for (const dt of [.05, .050001]) {
        const reached = update(game, idleInput(), dt);
        assert.equal(reached.enemyDirection, -direction);
        assert.equal(reached.enemies[0].x, direction === 1 ? 760 : 0);
        assert.equal(reached.enemies[0].y, 96);
        assert.equal(update(reached, idleInput(), .01).enemies[0].y, 96);
      }
    }
  }
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

test('REQ-06 CHG-03 survivor bottom below / exactly at / above 520 deducts one life', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (const lives of [3, 2, 1]) {
      for (const y of [495.999, 496, 496.001]) {
        const game = { ...transition(createState(difficulty), 'start'), lives };
        game.enemies = [{ ...game.enemies[0], y }];
        const next = update(game, idleInput(), 0);
        const reached = y >= 496;
        assert.equal(next.lives, lives - Number(reached));
        assert.equal(next.mode, !reached ? 'playing' : lives === 1 ? 'lost' : 'retry');
        assert.equal(game.lives, lives);
      }
    }
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
  assert.equal(winner.lives, 3);
  for (const lives of [1, 2]) {
    const lowLifeWinner = update({ ...game, lives }, idleInput(), 0);
    assert.equal(lowLifeWinner.mode, 'won');
    assert.equal(lowLifeWinner.lives, lives);
    assert.equal(lowLifeWinner.score, 240);
  }
  const stillPlaying = update({ ...game, enemies: [...game.enemies, { ...createEnemies()[1] }], score: 220 }, idleInput(), 0);
  assert.equal(stillPlaying.mode, 'playing');
  for (const lives of [3, 2, 1]) {
    const defeated = update({
      ...game, lives, enemies: [...game.enemies, { ...createEnemies()[1], y: 496 }], score: 220,
    }, idleInput(), 0);
    assert.equal(defeated.mode, lives === 1 ? 'lost' : 'retry');
    assert.equal(defeated.lives, lives - 1);
    assert.equal(defeated.score, 230);
    assert.equal(defeated.enemies.length, 1);
  }
});

test('REQ-06 CHG-03 boundary descent is reflected before deduction and full clearing wins at 240', () => {
  const game = playing();
  game.enemies = [{ ...game.enemies[0], x: 759, y: 472 }];
  const reached = update(game, idleInput(), .1);
  assert.equal(reached.mode, 'retry');
  assert.equal(reached.lives, 2);
  const all = playing();
  all.bullets = all.enemies.map((enemy) => ({ x: enemy.x + 2, y: enemy.y + 2, width: 4, height: 12 }));
  const won = update(all, idleInput(), 0);
  assert.equal(won.mode, 'won');
  assert.equal(won.score, 240);
});

test('REQ-06/07 both endings freeze all state and restart to independent initial state', () => {
  for (const mode of ['won', 'lost']) {
    const game = {
      ...playing(), mode, lives: mode === 'lost' ? 0 : 2, score: 230, enemies: [{ ...createEnemies()[0], y: 496 }],
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

test('REQ-06 CHG-03 complete no-input rounds reach 3-2-1-0 without automatic revival', () => {
  let game = playing();
  for (const remaining of [2, 1, 0]) {
    game = run(game, {}, 6600);
    assert.equal(game.mode, remaining ? 'retry' : 'lost');
    assert.equal(game.lives, remaining);
    assert.equal(game.score, 0);
    assert.equal(game.enemies.length, 24);
    assert.ok(game.enemies.some((enemy) => enemy.y + enemy.height >= 520));
    assert.equal(run(game, {}, 1200), game);
    if (remaining) game = transition(game, 'retry');
  }
});

test('CHG-03 AC1/3 invalid lives and inconsistent modes fail explicitly', () => {
  assert.equal(RULES.initialLives, 3);
  assert.equal(createState().lives, 3);
  for (const lives of [undefined, null, '3', -.1, -1, .5, 4, NaN, Infinity]) {
    assert.throws(() => update({ ...playing(), lives }, idleInput(), 0), /lives/i);
  }
  for (const mode of ['title', 'playing', 'paused', 'retry', 'won']) {
    assert.throws(() => transition({ ...createState(), mode, lives: 0 }, 'retry'), /Lives/);
  }
  assert.throws(() => transition({ ...createState(), mode: 'lost' }, 'restart'), /Lives/);
  assert.throws(() => transition({ ...createState(), mode: 'retry' }, 'retry'), /Lives/);
});

test('CHG-03 AC2/3/6 multiple arrivals deduct once; retries reset attempts, never lives or difficulty', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    let game = transition(createState(difficulty), 'start');
    for (const remaining of [2, 1, 0]) {
      game = {
        ...game, score: 20, enemyDirection: -1, cooldown: .17,
        player: { ...game.player, x: 20 },
        enemies: createEnemies().slice(2).map((enemy) => ({ ...enemy, y: 496 })),
        bullets: [{ x: 0, y: 500, width: 4, height: 12 }],
      };
      const original = structuredClone(game);
      const arrived = update(game, idleInput(), 0);
      assert.equal(arrived.lives, remaining);
      assert.equal(arrived.mode, remaining ? 'retry' : 'lost');
      assert.equal(arrived.score, 20);
      assert.equal(run(arrived, { fire: true, right: true }, 1200), arrived);
      assert.deepEqual(game, original);
      if (remaining) {
        game = transition(arrived, 'retry');
        assert.deepEqual(game, { ...transition(createState(difficulty), 'start'), lives: remaining });
        assert.notEqual(game.player, arrived.player);
        assert.notEqual(game.enemies, arrived.enemies);
        assert.equal(update(game, { ...idleInput(), fire: true }, 0).bullets.length, 1);
        const paused = transition(game, 'togglePause');
        assert.equal(run(paused, { fire: true }, 7200), paused);
      } else {
        const selected = selectDifficulty(arrived, 'easy');
        assert.deepEqual(transition(selected, 'restart'), transition(createState('easy'), 'start'));
      }
    }
  }
});

test('CHG-03 AC4/5/10/13 retry freezes failed score and cooldown and rejects unrelated actions', () => {
  const retry = {
    ...playing(), mode: 'retry', lives: 1, score: 10, cooldown: .19,
    enemies: createEnemies().slice(1), bullets: [{ x: 0, y: 500, width: 4, height: 12 }],
  };
  const snapshot = structuredClone(retry);
  assert.equal(run(retry, { left: true, fire: true }, 7200), retry);
  assert.deepEqual(retry, snapshot);
  for (const action of ['start', 'restart', 'togglePause']) assert.equal(transition(retry, action), retry);
  assert.equal(selectDifficulty(retry, 'hard'), retry);
  assert.throws(() => selectDifficulty(retry, 'invalid'), /difficulty/);
  for (const mode of ['title', 'playing', 'paused', 'won', 'lost']) {
    const state = { ...createState(), mode, lives: mode === 'lost' ? 0 : 3 };
    assert.equal(transition(state, 'retry'), state);
  }
});

test('CHG-03 AC2/11 one clock frame cannot deduct twice and retry resets the time baseline', () => {
  let game = playing();
  game.enemies = game.enemies.map((enemy) => ({ ...enemy, y: 496 }));
  const clock = createClock((dt) => {
    const previous = game.mode;
    game = update(game, idleInput(), dt);
    if (game.mode !== previous) clock.reset();
  });
  clock.advance(0);
  clock.advance(100);
  assert.equal(game.lives, 2);
  assert.equal(game.mode, 'retry');
  assert.equal(clock.inspect().steps, 1);
  const frozen = structuredClone(game);
  clock.advance(60100);
  clock.advance(60200);
  assert.deepEqual(game, frozen);
  game = transition(game, 'retry');
  clock.reset();
  const fresh = structuredClone(game);
  clock.advance(120000);
  assert.deepEqual(game, fresh);
  clock.advance(120050);
  assert.ok(Math.abs(game.enemies[0].x - 112 - 64 * .05) < 1e-9);
  assert.equal(game.lives, 2);
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
