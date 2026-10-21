// =====================================================================
//  시작점 — 타이틀, 로딩, 렌더 루프
// =====================================================================
import * as THREE from './three.module.js';
import { loadTextures, initMaterials } from './models.js';
import { AudioManager } from './audio.js';
import { Game } from './game.js';
import { newState, load, hasSave, clearSave } from './state.js';
import { isTouchDevice, setupTouch, goFullscreenLandscape } from './touch.js';

const TOUCH = isTouchDevice();

const $ = (s) => document.querySelector(s);

// 휴대폰은 화질을 조금 낮춰 부드럽게 돌아가게 한다
const renderer = new THREE.WebGLRenderer({ antialias: !TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(TOUCH ? Math.min(window.devicePixelRatio || 1, 1.25) : Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.domElement.id = 'gl';
$('#app').prepend(renderer.domElement);

const audio = new AudioManager();
let game = null;
let assetsReady = false;

function setLoading(k, label) {
  $('#loading .bar i').style.width = `${Math.round(k * 100)}%`;
  if (label) $('#loading span').textContent = label;
}

async function boot() {
  setLoading(0.05, '텍스처 불러오는 중');
  await loadTextures((k) => setLoading(0.05 + k * 0.85));
  initMaterials();
  game = new Game(renderer, audio);
  game.onQuit = showTitle;
  if (TOUCH) setupTouch(game);
  assetsReady = true;
  setLoading(1, '준비됐다');
  setTimeout(() => $('#loading').classList.add('hidden'), 500);
  $('#fade').style.opacity = '0';
  refreshTitle();
}

function refreshTitle() {
  $('#btn-continue').classList.toggle('hidden', !hasSave());
}

function showTitle() {
  refreshTitle();
  $('#title').classList.remove('hidden');
  $('#fade').style.opacity = '0';
  audio.playBgm('title', 2);
}

let audioStarted = false;
async function ensureAudio() {
  if (audioStarted) { audio.resume(); return; }
  audioStarted = true;
  await audio.init();
  audio.resume();
}

// 첫 클릭에서 오디오를 켜고 타이틀 음악을 튼다
window.addEventListener('pointerdown', async () => {
  if (audioStarted) return;
  await ensureAudio();
  if (!$('#title').classList.contains('hidden')) audio.playBgm('title', 2);
}, { once: false });

async function startGame(isNew) {
  if (!assetsReady) return;
  if (TOUCH) goFullscreenLandscape();
  await ensureAudio();
  audio.sfx('click', 0.5);
  let state = null;
  if (!isNew) state = load();
  if (!state) { isNew = true; clearSave(); state = newState(); }
  $('#fade').style.transition = 'opacity 700ms';
  $('#fade').style.opacity = '1';
  await new Promise((r) => setTimeout(r, 700));
  $('#title').classList.add('hidden');
  await game.start(state, isNew);
}

$('#btn-new').addEventListener('click', () => {
  if (hasSave() && !confirm('저장된 기록이 있습니다. 처음부터 다시 시작할까요?')) return;
  startGame(true);
});
$('#btn-continue').addEventListener('click', () => startGame(false));
$('#btn-howto').addEventListener('click', async () => {
  await ensureAudio();
  if (!game) return;
  game.ui.openHowto();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (game) {
    game.camera.aspect = window.innerWidth / window.innerHeight;
    game.camera.updateProjectionMatrix();
  }
});

let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (game) game.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// 테스트용 훅
window.__u100 = { get game() { return game; }, startGame };

boot().catch((e) => {
  console.error(e);
  setLoading(0, '불러오기에 실패했습니다. 로컬 서버로 실행했는지 확인하세요.');
});
