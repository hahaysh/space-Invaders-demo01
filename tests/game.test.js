import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, createState, idleInput, transition, update } from '../src/game.js';
import { createClock } from '../src/clock.js';

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
  const initial = update(playing(), { ...idleInput(), fire: true }, 0);
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
