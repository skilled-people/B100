// =====================================================================
//  모바일 터치 조작 — 왼쪽 조이스틱, 오른쪽 행동 버튼
// =====================================================================
import { equippedMelee, equippedRanged, rangedAmmo, itemCount } from './state.js';

export const isTouchDevice = () =>
  (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;

export function setupTouch(game) {
  document.body.classList.add('touch');
  game.touchMode = true;
  document.querySelector('#dialog .next').textContent = '화면을 눌러 계속';

  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div id="stick-zone"><div id="stick-base"><div id="stick-knob"></div></div></div>
    <div class="tbtns">
      <button data-act="throw" class="tb throw"><b>던지기</b><span></span></button>
      <button data-act="attack" class="tb attack"><b>공격</b><span></span></button>
      <button data-act="dodge" class="tb dodge"><b>구르기</b></button>
      <button data-act="interact" class="tb use"><b>상호작용</b></button>
      <button data-act="heal" class="tb heal"><b>회복</b><span></span></button>
    </div>
    <div class="tmenu">
      <button data-act="melee">근접 교체</button>
      <button data-act="ranged">원거리 교체</button>
      <button data-act="bag">가방</button>
      <button data-act="stats">스탯</button>
      <button data-act="journal">기록</button>
      <button data-act="town" class="town">도시</button>
      <button data-act="menu">메뉴</button>
    </div>`;
  document.getElementById('hud').appendChild(root);

  const input = game.input;
  const base = root.querySelector('#stick-base');
  const knob = root.querySelector('#stick-knob');
  const zone = root.querySelector('#stick-zone');
  const R = 56;
  let stickId = null;
  let cx = 0, cy = 0;

  const setStick = (dx, dy) => {
    const d = Math.hypot(dx, dy);
    const k = d > R ? R / d : 1;
    dx *= k; dy *= k;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, d / R);
    input.ax = m > 0.12 ? (dx / R) : 0;
    input.az = m > 0.12 ? (dy / R) : 0;
    input.sprint = m > 0.94;
  };
  const endStick = () => {
    stickId = null;
    input.ax = 0; input.az = 0; input.sprint = false;
    knob.style.transform = 'translate(0,0)';
    base.classList.remove('on');
  };

  zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (stickId !== null) return;
    const t = e.changedTouches[0];
    stickId = t.identifier;
    const zr = zone.getBoundingClientRect();
    cx = t.clientX; cy = t.clientY;
    base.style.left = `${t.clientX - zr.left}px`;
    base.style.top = `${t.clientY - zr.top}px`;
    base.classList.add('on');
    setStick(0, 0);
  }, { passive: false });
  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === stickId) setStick(t.clientX - cx, t.clientY - cy);
  }, { passive: false });
  const stickEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === stickId) endStick(); };
  zone.addEventListener('touchend', stickEnd);
  zone.addEventListener('touchcancel', stickEnd);

  const act = (name, down) => {
    if (!game.running) return;
    if (game.paused && down && !['menu'].includes(name)) return;
    switch (name) {
      case 'attack': input.attack = down; break;
      case 'throw': input.throw = down; break;
      case 'dodge': if (down) input.dodge = true; break;
      case 'interact': if (down) game.interact(); break;
      case 'heal': if (down) game.useHeal(); break;
      case 'melee': if (down) game.cycleMelee(); break;
      case 'ranged': if (down) game.cycleRanged(); break;
      case 'bag': if (down) { game.clearInput(); game.ui.openInventory(); } break;
      case 'stats': if (down) { game.clearInput(); game.ui.openStats(); } break;
      case 'journal': if (down) { game.clearInput(); game.ui.openJournal(); } break;
      case 'town': if (down && game.state.town.started) { game.clearInput(); game.ui.openTown(); } break;
      case 'menu': if (down && !game.ui.panelOpen && !game.cinematic) game.ui.openPause(); break;
      default: break;
    }
  };
  root.querySelectorAll('button[data-act]').forEach((b) => {
    const name = b.dataset.act;
    b.addEventListener('touchstart', (e) => { e.preventDefault(); b.classList.add('down'); act(name, true); }, { passive: false });
    const up = (e) => { e.preventDefault(); b.classList.remove('down'); act(name, false); };
    b.addEventListener('touchend', up, { passive: false });
    b.addEventListener('touchcancel', up, { passive: false });
    // 터치가 아닌 포인터(태블릿 마우스 등)도 받는다
    b.addEventListener('mousedown', (e) => { e.stopPropagation(); act(name, true); });
    b.addEventListener('mouseup', (e) => { e.stopPropagation(); act(name, false); });
  });

  // 화면 밖으로 손가락이 빠지거나 앱이 가려지면 입력을 풀어준다
  window.addEventListener('blur', endStick);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { endStick(); game.clearInput(); } });

  // 버튼에 현재 무기 표시
  const meleeLbl = root.querySelector('.attack span');
  const rangedLbl = root.querySelector('.throw span');
  const healLbl = root.querySelector('.heal span');
  const useBtn = root.querySelector('.use');
  const townBtn = root.querySelector('.town');
  setInterval(() => {
    if (!game.running || !game.state) return;
    const st = game.state;
    meleeLbl.textContent = equippedMelee(st).name;
    const rw = equippedRanged(st);
    if (rw) {
      const a = rangedAmmo(st, rw);
      rangedLbl.textContent = `${rw.name} ${a === Infinity ? '∞' : a}`;
    }
    healLbl.textContent = `${itemCount(st, '붕대') + itemCount(st, '통조림')}개`;
    useBtn.classList.toggle('ready', !!game.currentInteract && game.currentInteract.kind !== 'none');
    townBtn.classList.toggle('hidden', !st.town.started);
  }, 150);
}

// 전체 화면 + 가로 고정 (지원하는 브라우저에서만)
export async function goFullscreenLandscape() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
  } catch (e) { /* 지원 안 함 */ }
  try {
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (e) { /* 지원 안 함 (아이폰 등) */ }
}
