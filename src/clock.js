import { RULES } from './game.js';

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
