import './style.css';
import { RULES, createState, idleInput, transition, update, validateState } from './game.js';
import { createClock } from './clock.js';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const start = document.querySelector('#start');
const restart = document.querySelector('#restart');
const overlay = document.querySelector('#overlay');
const message = document.querySelector('#message');
const detail = document.querySelector('#detail');
const status = document.querySelector('#status');
const score = document.querySelector('#score');
const error = document.querySelector('#error');
let state = createState();
let failed = false;
const held = new Set();
const controls = new Set(['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space', 'Enter', 'KeyR']);
const nativeControl = (target) => target instanceof Element && Boolean(target.closest('button, input, select, textarea, a[href], [contenteditable]:not([contenteditable="false"])'));
const readInput = () => ({
  left: held.has('ArrowLeft') || held.has('KeyA'),
  right: held.has('ArrowRight') || held.has('KeyD'),
  fire: held.has('Space'),
});
const clock = createClock((dt) => {
  const previousMode = state.mode;
  state = update(state, readInput(), dt);
  if (state.mode !== previousMode) clearInput();
});
function clearInput() { held.clear(); clock.reset(); }

function act(action) {
  if (failed) return;
  const next = transition(state, action);
  if (next !== state) {
    state = next;
    clearInput();
    // A clicked game button must not retain Space's native activation behavior.
    if ([start, restart].includes(document.activeElement)) document.activeElement.blur();
    render();
  }
}

start.addEventListener('click', () => act('start'));
restart.addEventListener('click', () => act('restart'));
window.addEventListener('keydown', (event) => {
  if (failed || nativeControl(event.target) || !controls.has(event.code)) return;
  event.preventDefault();
  if (event.code === 'Enter' && !event.repeat) act('start');
  else if (event.code === 'KeyR' && !event.repeat) act('restart');
  else if (state.mode === 'playing' && !event.repeat && !['Enter', 'KeyR'].includes(event.code)) held.add(event.code);
});
window.addEventListener('keyup', (event) => {
  held.delete(event.code);
  if (!nativeControl(event.target) && controls.has(event.code)) event.preventDefault();
});
window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', clearInput);
document.addEventListener('focusin', (event) => {
  if (nativeControl(event.target)) clearInput();
});

function drawSpace() {
  const backdrop = ctx.createLinearGradient(0, 0, 800, 600);
  backdrop.addColorStop(0, '#0c1830');
  backdrop.addColorStop(1, '#080e1e');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, RULES.width, RULES.height);
  for (let i = 0; i < 86; i += 1) {
    ctx.fillStyle = i % 4 === 0 ? '#b7cce4' : '#405573';
    ctx.fillRect((i * 137 + 31) % 800, (i * 83 + 19) % 510, i % 7 === 0 ? 2 : 1, 1);
  }
  ctx.strokeStyle = '#7bf1d63d';
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  ctx.moveTo(20, RULES.defenseY);
  ctx.lineTo(780, RULES.defenseY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#7799ac';
  ctx.font = '10px sans-serif';
  ctx.fillText('DEFENSE LINE', 24, RULES.defenseY - 10);
  ctx.fillStyle = '#122c37';
  ctx.fillRect(0, 521, 800, 79);
}

function render() {
  if (!ctx) throw new Error('Canvas 2D를 사용할 수 없습니다.');
  drawSpace();
  for (const enemy of state.enemies) {
    const { x, y, width, height } = enemy;
    ctx.fillStyle = ['#a9baff', '#80d4ef', '#f5bb90'][Math.floor(enemy.id / RULES.enemyColumns)];
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = '#10203a';
    ctx.fillRect(x + 8, y + 7, 7, 6);
    ctx.fillRect(x + 25, y + 7, 7, 6);
    ctx.fillRect(x + 15, y + 19, 10, 5);
    ctx.fillStyle = '#ffffff70';
    ctx.fillRect(x + 3, y + 2, width - 6, 2);
  }
  const { x, y, width, height } = state.player;
  ctx.fillStyle = '#83f1d4';
  ctx.beginPath();
  ctx.moveTo(x, y + height);
  ctx.lineTo(x + 7, y + 6);
  ctx.lineTo(x + 15, y + 6);
  ctx.lineTo(x + width / 2, y);
  ctx.lineTo(x + 25, y + 6);
  ctx.lineTo(x + 33, y + 6);
  ctx.lineTo(x + width, y + height);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8fffa';
  ctx.fillRect(x + 17, y + 7, 6, 8);
  ctx.fillStyle = '#ffe5a1';
  for (const bullet of state.bullets) ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
  score.value = String(state.score);
  const labels = { title: '출격 대기', playing: '방어 진행 중', won: '승리 · 궤도 방어 성공', lost: '패배 · 방어선 도달' };
  const label = labels[state.mode];
  if (status.textContent !== label) status.textContent = label;
  const ended = ['won', 'lost'].includes(state.mode);
  overlay.hidden = state.mode === 'playing';
  overlay.dataset.outcome = state.mode;
  start.hidden = state.mode !== 'title';
  restart.hidden = !ended;
  if (ended) {
    const title = state.mode === 'won' ? '궤도를 지켜냈습니다' : '방어선이 돌파되었습니다';
    const summary = `최종 점수 ${state.score}점 · R 또는 다시 도전 버튼으로 새 임무를 시작하세요.`;
    if (message.textContent !== title) message.textContent = title;
    if (detail.textContent !== summary) detail.textContent = summary;
  }
}

function fail(reason) {
  failed = true;
  clearInput();
  start.disabled = true;
  restart.disabled = true;
  status.textContent = '실행 오류';
  error.hidden = false;
  error.textContent = `게임을 실행할 수 없습니다: ${reason.message}`;
  console.error(reason);
}

function frame(timestamp) {
  try {
    if (document.hidden || state.mode !== 'playing') clock.reset();
    else clock.advance(timestamp);
    render();
    requestAnimationFrame(frame);
  } catch (reason) { fail(reason); }
}

try {
  render();
  requestAnimationFrame(frame);
} catch (reason) { fail(reason); }

// Deterministic browser inspection / injected fixtures; Vite removes this entire branch in production.
if (import.meta.env.DEV) {
  window.__ORBIT_TEST__ = {
    snapshot: () => structuredClone(state),
    timing: () => clock.inspect(),
    input: () => ({ ...idleInput(), ...readInput() }),
    inject(next) {
      validateState(next);
      state = structuredClone(next);
      clearInput();
      render();
    },
  };
}
