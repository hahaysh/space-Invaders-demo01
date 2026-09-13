export const RULES = Object.freeze({
  width: 800, height: 600,
  playerWidth: 40, playerHeight: 20, playerX: 380, playerY: 550, playerSpeed: 320,
  bulletWidth: 4, bulletHeight: 12, bulletSpeed: 600, bulletOffsetX: 18, bulletY: 538,
  fireInterval: 0.2, fixedStep: 1 / 120, maxFrame: 0.1, defenseY: 520,
});

export const idleInput = () => ({ left: false, right: false, fire: false });

export function createState() {
  return {
    mode: 'title',
    player: { x: RULES.playerX, y: RULES.playerY, width: RULES.playerWidth, height: RULES.playerHeight },
    bullets: [],
    score: 0,
    cooldown: 0,
  };
}

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
}

export function validateState(state) {
  if (!state || !['title', 'playing'].includes(state.mode)) throw new TypeError('Invalid game mode');
  if (!Array.isArray(state.bullets)) throw new TypeError('bullets must be an array');
  for (const rect of [state.player, ...state.bullets]) {
    if (!rect) throw new TypeError('Missing rectangle');
    for (const key of ['x', 'y', 'width', 'height']) finite(rect[key], key);
    if (rect.width <= 0 || rect.height <= 0) throw new RangeError('Invalid rectangle size');
  }
  finite(state.cooldown, 'cooldown');
  if (state.cooldown < 0) throw new RangeError('Negative cooldown');
  if (!Number.isInteger(state.score) || state.score < 0) throw new RangeError('Invalid score');
  return state;
}

export function transition(state, action) {
  validateState(state);
  if (!['start', 'restart'].includes(action)) throw new TypeError('Unknown game action');
  if (action === 'start' && state.mode === 'title') return { ...createState(), mode: 'playing' };
  return state;
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
  return next;
}
