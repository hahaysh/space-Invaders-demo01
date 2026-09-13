export const RULES = Object.freeze({
  width: 800, height: 600,
  playerWidth: 40, playerHeight: 20, playerX: 380, playerY: 550, playerSpeed: 320,
  bulletWidth: 4, bulletHeight: 12, bulletSpeed: 600, bulletOffsetX: 18, bulletY: 538,
  fireInterval: 0.2, fixedStep: 1 / 120, maxFrame: 0.1, defenseY: 520,
  enemyRows: 3, enemyColumns: 8, enemyWidth: 40, enemyHeight: 24,
  enemyX: 112, enemyY: 72, enemyGapX: 72, enemyGapY: 48,
  enemySpeed: 64, enemyDrop: 24, pointsPerEnemy: 10,
});

export const idleInput = () => ({ left: false, right: false, fire: false });

export function createClock(tick) {
  if (typeof tick !== 'function') throw new TypeError('tick must be a function');
  let previous = null;
  let remainder = 0;
  let steps = 0;
  return {
    reset() { previous = null; remainder = 0; },
    advance(timestamp) {
      if (!Number.isFinite(timestamp)) throw new TypeError('timestamp must be finite');
      if (previous !== null && timestamp < previous) throw new RangeError('timestamp must not go backwards');
      if (previous !== null) remainder += Math.min((timestamp - previous) / 1000, RULES.maxFrame);
      previous = timestamp;
      while (remainder + 1e-12 >= RULES.fixedStep) {
        remainder -= RULES.fixedStep;
        if (remainder < 0) remainder = 0;
        tick(RULES.fixedStep);
        steps += 1;
      }
    },
    inspect: () => ({ steps, remainder }),
  };
}

export function createEnemies() {
  return Array.from({ length: RULES.enemyRows * RULES.enemyColumns }, (_, id) => ({
    id,
    x: RULES.enemyX + (id % RULES.enemyColumns) * RULES.enemyGapX,
    y: RULES.enemyY + Math.floor(id / RULES.enemyColumns) * RULES.enemyGapY,
    width: RULES.enemyWidth,
    height: RULES.enemyHeight,
  }));
}

export function createState() {
  return {
    mode: 'title',
    player: { x: RULES.playerX, y: RULES.playerY, width: RULES.playerWidth, height: RULES.playerHeight },
    bullets: [],
    enemies: createEnemies(),
    enemyDirection: 1,
    score: 0,
    cooldown: 0,
  };
}

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
}

export function validateState(state) {
  if (!state || !['title', 'playing', 'paused', 'won', 'lost'].includes(state.mode)) throw new TypeError('Invalid game mode');
  if (!Array.isArray(state.bullets)) throw new TypeError('bullets must be an array');
  if (!Array.isArray(state.enemies) || state.enemies.length > 24) throw new TypeError('Invalid enemies');
  if (![1, -1].includes(state.enemyDirection)) throw new TypeError('Invalid enemy direction');
  if (new Set(state.enemies.map((enemy) => enemy.id)).size !== state.enemies.length ||
      state.enemies.some((enemy) => !Number.isInteger(enemy.id) || enemy.id < 0 || enemy.id >= 24)) {
    throw new TypeError('Invalid enemy identity');
  }
  for (const rect of [state.player, ...state.bullets, ...state.enemies]) {
    if (!rect) throw new TypeError('Missing rectangle');
    for (const key of ['x', 'y', 'width', 'height']) finite(rect[key], key);
    if (rect.width <= 0 || rect.height <= 0) throw new RangeError('Invalid rectangle size');
  }
  if (state.player.x < 0 || state.player.x > RULES.width - RULES.playerWidth ||
      state.player.y !== RULES.playerY || state.player.width !== RULES.playerWidth ||
      state.player.height !== RULES.playerHeight) throw new RangeError('Invalid player geometry');
  if (state.enemies.some((enemy) => enemy.x < 0 || enemy.x + enemy.width > RULES.width ||
      enemy.y < 0 || enemy.width !== RULES.enemyWidth || enemy.height !== RULES.enemyHeight)) {
    throw new RangeError('Invalid enemy geometry');
  }
  if (state.bullets.some((bullet) => bullet.width !== RULES.bulletWidth || bullet.height !== RULES.bulletHeight)) {
    throw new RangeError('Invalid bullet geometry');
  }
  finite(state.cooldown, 'cooldown');
  if (state.cooldown < 0) throw new RangeError('Negative cooldown');
  if (!Number.isInteger(state.score) || state.score < 0 || state.score > 240 || state.score % RULES.pointsPerEnemy !== 0) {
    throw new RangeError('Invalid score');
  }
  if (state.score + state.enemies.length * RULES.pointsPerEnemy > 240) throw new RangeError('Inconsistent score and survivors');
  return state;
}

export function transition(state, action) {
  validateState(state);
  if (!['start', 'restart', 'togglePause'].includes(action)) throw new TypeError('Unknown game action');
  if (action === 'togglePause' && ['playing', 'paused'].includes(state.mode)) {
    return { ...state, mode: state.mode === 'playing' ? 'paused' : 'playing' };
  }
  if (action === 'start' && state.mode === 'title') return { ...createState(), mode: 'playing' };
  if (action === 'restart' && ['won', 'lost'].includes(state.mode)) return { ...createState(), mode: 'playing' };
  return state;
}

export function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

function moveFormation(enemies, direction, dt) {
  if (enemies.length === 0 || dt === 0) return { enemies, enemyDirection: direction };
  const edge = direction === 1
    ? Math.max(...enemies.map((enemy) => enemy.x + enemy.width))
    : Math.min(...enemies.map((enemy) => enemy.x));
  const gap = direction === 1 ? RULES.width - edge : edge;
  const travel = RULES.enemySpeed * dt;
  const reached = travel + 1e-10 >= gap;
  const dx = direction * Math.min(travel, gap);
  return {
    enemies: enemies.map((enemy) => ({ ...enemy, x: enemy.x + dx, y: enemy.y + (reached ? RULES.enemyDrop : 0) })),
    enemyDirection: reached ? -direction : direction,
  };
}

export function update(state, input, dt) {
  validateState(state);
  if (!input || Object.keys(input).length !== 3 ||
      !['left', 'right', 'fire'].every((key) => typeof input[key] === 'boolean')) {
    throw new TypeError('Input must contain only boolean left, right and fire');
  }
  finite(dt, 'dt');
  if (dt < 0 || dt > RULES.maxFrame) throw new RangeError('dt must be between 0 and 0.1 seconds');
  if (state.mode !== 'playing') return state;
  const next = {
    ...state,
    player: { ...state.player },
    bullets: state.bullets.map((bullet) => ({ ...bullet })),
    ...moveFormation(state.enemies, state.enemyDirection, dt),
    cooldown: Math.max(0, state.cooldown - dt),
  };
  const direction = Number(input.right) - Number(input.left);
  next.player.x = Math.max(0, Math.min(RULES.width - RULES.playerWidth, next.player.x + direction * RULES.playerSpeed * dt));
  // Tolerate only floating-point subtraction noise at the fixed-step boundary.
  if (input.fire && next.cooldown <= 1e-12) {
    next.bullets.push({
      x: next.player.x + RULES.bulletOffsetX, y: RULES.bulletY,
      width: RULES.bulletWidth, height: RULES.bulletHeight,
    });
    next.cooldown = RULES.fireInterval;
  }
  next.bullets = next.bullets
    .map((bullet) => ({ ...bullet, y: bullet.y - RULES.bulletSpeed * dt }))
    .filter((bullet) => bullet.y + bullet.height > 0);
  // Work on a fresh survivor list, so a consumed enemy can never score twice.
  next.enemies = [...next.enemies];
  next.bullets = next.bullets.filter((bullet) => {
    const hit = next.enemies.findIndex((enemy) => overlaps(bullet, enemy));
    if (hit === -1) return true;
    next.enemies.splice(hit, 1);
    next.score += RULES.pointsPerEnemy;
    return false;
  });
  if (next.enemies.some((enemy) => enemy.y + enemy.height >= RULES.defenseY)) next.mode = 'lost';
  else if (next.enemies.length === 0) next.mode = 'won';
  return next;
}
