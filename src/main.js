import './styles.css';
import { RULES, DIFFICULTIES, createState, selectDifficulty, transition, update, createClock } from './game.js';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const start = document.querySelector('#start');
const restart = document.querySelector('#restart');
const retry = document.querySelector('#retry');
const overlay = document.querySelector('#overlay');
const message = document.querySelector('#message');
const detail = document.querySelector('#detail');
const status = document.querySelector('#status');
const score = document.querySelector('#score');
const lives = document.querySelector('#lives');
const error = document.querySelector('#error');
const difficulty = document.querySelector('#difficulty');
const difficultyCurrent = document.querySelector('#difficulty-current');
let state = createState();
let failed = false;
const held = new Set();
const controls = new Set(['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space', 'Enter', 'KeyR', 'KeyP']);
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
    if ([start, restart, retry].includes(document.activeElement)) document.activeElement.blur();
    render();
  }
}

start.addEventListener('click', () => act('start'));
restart.addEventListener('click', () => act('restart'));
retry.addEventListener('click', () => act('retry'));
difficulty.addEventListener('change', () => {
  if (failed) return;
  try {
    state = selectDifficulty(state, difficulty.value);
    render();
  } catch (reason) { fail(reason); }
});
window.addEventListener('keydown', (event) => {
  if (event.target === retry && event.code === 'Enter' && event.repeat) event.preventDefault();
  if (failed || nativeControl(event.target) || !controls.has(event.code)) return;
  event.preventDefault();
  if (event.code === 'Enter' && !event.repeat) act(state.mode === 'retry' ? 'retry' : 'start');
  else if (event.code === 'KeyR' && !event.repeat) act('restart');
  else if (event.code === 'KeyP' && !event.repeat) act('togglePause');
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
  const livesText = `남은 목숨: ${state.lives}`;
  if (lives.textContent !== livesText) lives.textContent = livesText;
  difficulty.value = state.selectedDifficulty;
  difficulty.disabled = !['title', 'won', 'lost'].includes(state.mode);
  const difficultyText = state.mode === 'title'
    ? `선택 난이도: ${DIFFICULTIES[state.selectedDifficulty].label}`
    : `이번 게임 난이도: ${DIFFICULTIES[state.difficulty].label}`;
  if (difficultyCurrent.textContent !== difficultyText) difficultyCurrent.textContent = difficultyText;
  const labels = { title: '출격 대기', playing: '방어 진행 중', paused: '일시정지', retry: '재도전 대기', won: '승리 · 궤도 방어 성공', lost: '패배 · 남은 목숨 없음' };
  const label = labels[state.mode];
  if (status.textContent !== label) status.textContent = label;
  const ended = ['won', 'lost'].includes(state.mode);
  overlay.hidden = state.mode === 'playing';
  overlay.dataset.outcome = state.mode;
  start.hidden = state.mode !== 'title';
  restart.hidden = !ended;
  retry.hidden = state.mode !== 'retry';
  if (state.mode === 'paused') {
    if (message.textContent !== '일시정지') message.textContent = '일시정지';
    const hint = '게임 시간이 멈췄습니다. P를 눌러 같은 상태에서 재개하세요.';
    if (detail.textContent !== hint) detail.textContent = hint;
  } else if (state.mode === 'retry') {
    if (message.textContent !== '다시 방어할 기회가 있습니다') message.textContent = '다시 방어할 기회가 있습니다';
    const hint = `남은 목숨 ${state.lives} · 이번 시도 점수 ${state.score}점. Enter 또는 재도전 버튼으로 같은 난이도에서 점수 0부터 시작하세요.`;
    if (detail.textContent !== hint) detail.textContent = hint;
  } else if (ended) {
    const title = state.mode === 'won' ? '궤도를 지켜냈습니다' : '방어선이 돌파되었습니다';
    const summary = `최종 점수 ${state.score}점 · 남은 목숨 ${state.lives} · R 또는 다시 도전 버튼으로 목숨 3의 새 임무를 시작하세요.`;
    if (message.textContent !== title) message.textContent = title;
    if (detail.textContent !== summary) detail.textContent = summary;
  }
}

function fail(reason) {
  failed = true;
  clearInput();
  start.disabled = true;
  restart.disabled = true;
  retry.disabled = true;
  difficulty.disabled = true;
  status.textContent = '실행 오류';
  error.hidden = false;
  error.textContent = `게임을 실행할 수 없습니다: ${reason.message}`;
  console.error(reason);
}

function frame(timestamp) {
  if (failed) return;
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
