// =====================================================================
//  UI — HUD, 미니맵, 패널, 대화, 엔딩
// =====================================================================
import * as THREE from './three.module.js';
import { MELEE, RANGED, meleeById, RECIPES, STATION_LABEL, SHOP, DISPLAY_SHOP, SPEED_LABEL, JOBS, RES_LABEL, BUILDINGS,
  MAX_RESIDENTS, stageOf, roomTier, MAX_LEVEL, baseballAtk } from './data.js';
import { derive, xpNeed, STAT_LABEL, STAT_DESC, itemCount, rangedAvailable, equippedMelee, equippedRanged, rangedAmmo, townRates } from './state.js';
import { HW, ROOM, DOOR } from './world.js';
import { RECORDINGS, DAMAGED_LOG, decodeRecording } from './story.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

export class UI {
  constructor(game) {
    this.game = game;
    this.hud = $('#hud');
    this.overlay = $('#overlay');
    this.octx = this.overlay.getContext('2d');
    this.mm = $('#minimap');
    this.mctx = this.mm.getContext('2d');
    this.texts = [];
    this.hudT = 0;
    this.panelOpen = false;
    this.dialogOpen = false;
    this.v3 = new THREE.Vector3();
    $('#panel .close').addEventListener('click', () => this.closePanel());
    $('#panel').addEventListener('mousedown', (e) => { if (e.target.id === 'panel') this.closePanel(); });
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.overlay.width = window.innerWidth * dpr;
    this.overlay.height = window.innerHeight * dpr;
    this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  showHud(v) { this.hud.classList.toggle('hidden', !v); }

  // ------------------------------------------------------------ 토스트 · 안내
  toast(text, kind = '') {
    const box = $('#toasts');
    const d = el('div', kind, text);
    box.appendChild(d);
    while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => d.remove(), 3300);
  }
  prompt(html) {
    const p = $('#prompt');
    if (!html) { p.classList.add('hidden'); return; }
    if (this.game.touchMode) html = html.replace('<kbd>E</kbd> ', '');
    if (p.innerHTML !== html) p.innerHTML = html;
    p.classList.remove('hidden');
  }
  floatText(x, y, z, text, color) {
    this.texts.push({ x, y, z, text, color, t: 0 });
    if (this.texts.length > 60) this.texts.shift();
  }

  // ------------------------------------------------------------ HUD
  updateHud(dt) {
    const g = this.game;
    const st = g.state;
    const p = g.player;
    const d = derive(st);
    $('.bar.hp i').style.width = `${(p.hp / d.maxHp) * 100}%`;
    $('.bar.sta i').style.width = `${(p.sta / d.maxSta) * 100}%`;
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.12;
    $('.bar.hp span').textContent = `${fmt(p.hp)} / ${fmt(d.maxHp)}`;
    $('#lv').textContent = st.level;
    $('.bar.xp i').style.width = st.level >= MAX_LEVEL ? '100%' : `${(st.xp / xpNeed(st.level)) * 100}%`;
    const pts = $('#pts');
    pts.classList.toggle('hidden', st.points <= 0);
    pts.textContent = `스탯 +${st.points}`;
    $('#gold').textContent = `${fmt(st.gold)} G`;
    $('#fstats').textContent = `생존력 ${d.survival} · 손기술 ${d.handskill} · 멘탈 ${d.mental}`;
    const stage = stageOf(st.floor);
    $('#floor-num').textContent = `B${st.floor}`;
    $('#floor-stage').innerHTML = `<b>${stage.name}</b> 단계 · ${stage.look}`;
    // 상태이상
    const S = { spore: '포자', sleep: '수면', blind: '시야 흐림', grab: '붙잡힘' };
    const sts = Object.entries(p.status).filter(([, v]) => v > 0).map(([k, v]) => `<span class="${k}">${S[k]} ${v.toFixed(1)}s</span>`);
    if (g.zoneAt(p.pos.x, p.pos.z) === 'web') sts.push('<span class="grab">거미줄</span>');
    $('#statuses').innerHTML = sts.join('');
    // 무기
    const mw = equippedMelee(st);
    $('#slot-melee b').textContent = mw.name;
    $('#slot-melee em').textContent = `공격력 ${mw.atk} · ${SPEED_LABEL[mw.spd]}${mw.str && st.stats.str < mw.str ? ` · 힘 ${mw.str} 필요` : ''}`;
    const rw = equippedRanged(st);
    if (rw) {
      const ammo = rangedAmmo(st, rw);
      const atk = rw.scaleThrow ? baseballAtk(st.stats.thr) : rw.atk;
      $('#slot-ranged b').textContent = rw.name;
      $('#slot-ranged em').textContent = `공격력 ${Math.round(atk)} · ${ammo === Infinity ? '무한' : `${ammo}${rw.gun ? '발' : '개'}`}`;
    }
    const cans = itemCount(st, '통조림');
    const bands = itemCount(st, '붕대');
    $('#slot-heal b').textContent = cans || bands ? (cans ? '통조림' : '붕대') : '없음';
    $('#slot-heal em').textContent = `붕대 ${bands} · 통조림 ${cans}`;
    // 감염된 방 게이지
    const rg = $('#roomgauge');
    const fs = st.floors[st.floor];
    if (g.floor && g.floor.room && fs && fs.room) {
      const tier = roomTier(st.floor);
      const pct = Math.min(100, (fs.room.count / tier.max) * 100);
      const col = pct >= 90 ? 'var(--rust)' : pct >= 60 ? '#e2c046' : 'var(--moss)';
      rg.innerHTML = `감염된 방 · 잔몹 ${Math.floor(fs.room.count)} / ${tier.max} (${Math.floor(pct)}%)<div class="g"><i style="width:${pct}%;background:${col}"></i></div>`;
      rg.classList.remove('hidden');
    } else rg.classList.add('hidden');
    // 도시 자원
    const tb = $('#townbar');
    if (st.town.started) {
      const r = st.town.res;
      tb.innerHTML = Object.keys(RES_LABEL).map((k) => `<span class="${r[k] < 6 ? 'low' : ''}">${RES_LABEL[k]} ${fmt(r[k])}</span>`).join('') + `<span>주민 ${st.residents.length}/${MAX_RESIDENTS}</span>`;
      tb.classList.remove('hidden');
      $('#key-town').classList.remove('hidden');
    } else { tb.classList.add('hidden'); $('#key-town').classList.add('hidden'); }
    // 보스 바
    const bb = $('#bossbar');
    const boss = g.activeBoss();
    if (boss) {
      bb.classList.remove('hidden');
      bb.classList.toggle('shield', !!boss.invulnerable);
      bb.querySelector('.name').textContent = boss.name + (boss.invulnerable ? ' — 벌집을 먼저 부숴라' : '');
      bb.querySelector('.bar i').style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
    } else if (g.roomHeartActive()) {
      const h = g.roomHeart;
      bb.classList.remove('hidden');
      bb.classList.toggle('shield', h.invulnerable);
      bb.querySelector('.name').textContent = h.invulnerable ? `포자 심장 — 웨이브 ${g.roomRun.wave}/${g.roomRun.waves}` : '포자 심장';
      bb.querySelector('.bar i').style.width = `${Math.max(0, h.hp / h.maxHp) * 100}%`;
    } else bb.classList.add('hidden');
    // 제작
    const cb = $('#craftbar');
    if (g.crafting) {
      cb.classList.remove('hidden');
      cb.querySelector('span').textContent = `${g.crafting.recipe.name} 만드는 중`;
      cb.querySelector('.bar i').style.width = `${(g.crafting.t / g.crafting.dur) * 100}%`;
    } else cb.classList.add('hidden');
    // 시야 효과
    $('#blindfx').style.opacity = p.status.blind > 0 ? '1' : '0';
  }

  hurtFlash() {
    const v = $('#vignette');
    v.style.opacity = '1';
    clearTimeout(this.hurtTimer);
    this.hurtTimer = setTimeout(() => { v.style.opacity = '0'; }, 160);
  }

  // ------------------------------------------------------------ 미니맵
  drawMinimap() {
    const g = this.game;
    const f = g.floor;
    if (!f) return;
    const c = this.mctx;
    const W = this.mm.width;
    const minX = -HW - 1, maxX = (f.room ? ROOM.maxX : HW) + 1.5;
    const span = Math.max(maxX - minX, HW * 2 + 2);
    const s = (W - 16) / span;
    const ox = 8 - minX * s + (span - (maxX - minX)) * s / 2;
    const oz = 8 + (HW + 1) * s;
    const X = (x) => ox + x * s;
    const Z = (z) => oz + z * s;
    c.save();
    c.clearRect(0, 0, W, W);
    c.filter = g.player.status.blind > 0 ? 'blur(4px)' : 'none';
    c.fillStyle = 'rgba(70,72,74,.55)';
    c.fillRect(X(-HW), Z(-HW), HW * 2 * s, HW * 2 * s);
    for (const r of f.minimap.rects) {
      if (r.kind === 'room') { c.fillStyle = 'rgba(120,60,80,.45)'; c.fillRect(X(r.minX), Z(r.minZ), (r.maxX - r.minX) * s, (r.maxZ - r.minZ) * s); continue; }
      c.fillStyle = r.kind === 'wall' ? 'rgba(20,20,20,.9)' : 'rgba(150,140,120,.6)';
      c.fillRect(X(r.minX), Z(r.minZ), Math.max(1, (r.maxX - r.minX) * s), Math.max(1, (r.maxZ - r.minZ) * s));
    }
    for (const ci of f.minimap.circles) {
      const col = { pillar: 'rgba(25,25,25,.95)', prop: 'rgba(150,140,120,.6)', terminal: '#5fd0c4', shop: '#f2b33d', recorder: '#e05050' }[ci.kind];
      c.fillStyle = col;
      c.beginPath();
      c.arc(X(ci.x), Z(ci.z), Math.max(2.2, (ci.r || 0.7) * s), 0, Math.PI * 2);
      c.fill();
    }
    // 계단 · 입구
    c.fillStyle = g.stairsLocked() ? '#c4472f' : '#f2b33d';
    c.beginPath();
    c.moveTo(X(0), Z(-HW + 2)); c.lineTo(X(-1.8), Z(-HW + 5)); c.lineTo(X(1.8), Z(-HW + 5)); c.closePath(); c.fill();
    if (f.hatch) { c.strokeStyle = '#7fb0d6'; c.lineWidth = 2; c.beginPath(); c.arc(X(0), Z(HW - 2.6), 1.2 * s, 0, Math.PI * 2); c.stroke(); }
    // 감염된 방 문
    const fs = g.state.floors[g.state.floor];
    if (f.room && fs && fs.room) {
      const pct = fs.room.count / roomTier(g.state.floor).max;
      c.fillStyle = pct >= 0.9 ? '#c4472f' : pct >= 0.6 ? '#e2c046' : '#8fb573';
      c.fillRect(X(DOOR.x) - 3, Z(-DOOR.half), 6, DOOR.half * 2 * s);
    }
    // 생존자 · 줍기
    for (const n of g.npcs) { c.fillStyle = '#8fd0a0'; c.beginPath(); c.arc(X(n.pos.x), Z(n.pos.z), 3.5, 0, Math.PI * 2); c.fill(); }
    for (const pk of g.pickups) { c.fillStyle = '#f2d38a'; c.fillRect(X(pk.pos.x) - 1.5, Z(pk.pos.z) - 1.5, 3, 3); }
    // 적
    for (const e of g.enemies) {
      if (!e.alive || e.state === 'burrowed') continue;
      c.fillStyle = e.isBoss ? '#ff5a7a' : e.flying ? '#ffa0a0' : '#e04040';
      const r = e.isBoss ? 5 : 2.4;
      c.beginPath(); c.arc(X(e.pos.x), Z(e.pos.z), r, 0, Math.PI * 2); c.fill();
    }
    // 플레이어
    const p = g.player;
    c.translate(X(p.pos.x), Z(p.pos.z));
    c.rotate(-p.facing + Math.PI);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(-4.5, 5); c.closePath(); c.fill();
    c.restore();
  }

  // ------------------------------------------------------------ 3D 위 글자 · 체력바
  drawOverlay(dt, camera) {
    const c = this.octx;
    const w = window.innerWidth, h = window.innerHeight;
    c.clearRect(0, 0, w, h);
    const proj = (x, y, z) => {
      this.v3.set(x, y, z).project(camera);
      if (this.v3.z > 1) return null;
      return [(this.v3.x * 0.5 + 0.5) * w, (-this.v3.y * 0.5 + 0.5) * h];
    };
    const g = this.game;
    c.textAlign = 'center';
    for (const e of g.enemies) {
      if (!e.alive || e.isBoss || e.hp >= e.maxHp || e.state === 'burrowed') continue;
      const pt = proj(e.pos.x, e.centerY + e.height * 0.65 + 0.4, e.pos.z);
      if (!pt) continue;
      const bw = 38;
      c.fillStyle = 'rgba(0,0,0,.65)';
      c.fillRect(pt[0] - bw / 2 - 1, pt[1] - 1, bw + 2, 6);
      c.fillStyle = e.tag === 'room' ? '#d0608a' : '#d35a3e';
      c.fillRect(pt[0] - bw / 2, pt[1], bw * Math.max(0, e.hp / e.maxHp), 4);
    }
    // 감염된 방 문 위 게이지 글자
    const fs = g.state.floors[g.state.floor];
    if (g.floor && g.floor.room && fs && fs.room) {
      const pt = proj(DOOR.x - 0.6, 4.4, 0);
      if (pt) {
        const tier = roomTier(g.state.floor);
        const pct = Math.floor(Math.min(100, fs.room.count / tier.max * 100));
        c.font = '600 14px "IBM Plex Sans KR", sans-serif';
        c.fillStyle = pct >= 90 ? '#ff7a5a' : pct >= 60 ? '#f2d060' : '#a8d890';
        c.fillText(`잔몹 ${Math.floor(fs.room.count)} / ${tier.max} (${pct}%)`, pt[0], pt[1]);
      }
    }
    // NPC 이름
    for (const n of g.npcs) {
      const pt = proj(n.pos.x, 2.4, n.pos.z);
      if (!pt) continue;
      c.font = '500 13px "IBM Plex Sans KR", sans-serif';
      c.fillStyle = '#bfe8c8';
      c.fillText(n.label, pt[0], pt[1]);
    }
    // 떠오르는 숫자
    c.font = '700 16px "IBM Plex Sans KR", sans-serif';
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t > 0.9) { this.texts.splice(i, 1); continue; }
      const pt = proj(t.x, t.y + t.t * 1.2, t.z);
      if (!pt) continue;
      c.globalAlpha = 1 - Math.max(0, t.t - 0.5) / 0.4;
      c.fillStyle = 'rgba(0,0,0,.7)';
      c.fillText(t.text, pt[0] + 1, pt[1] + 1);
      c.fillStyle = t.color;
      c.fillText(t.text, pt[0], pt[1]);
    }
    c.globalAlpha = 1;
  }

  // ------------------------------------------------------------ 대화
  playScene(lines) {
    return new Promise((resolve) => {
      const g = this.game;
      g.setPaused(true, 'dialog');
      this.dialogOpen = true;
      const box = $('#dialog');
      const who = box.querySelector('.who');
      const text = box.querySelector('.text');
      const photo = $('#dialog-photo');
      const img = photo.querySelector('img');
      box.classList.remove('hidden');
      let i = -1;
      let typing = null;
      const show = () => {
        i++;
        if (i >= lines.length) {
          box.classList.add('hidden');
          photo.classList.add('hidden');
          cleanup();
          this.dialogOpen = false;
          g.setPaused(false, 'dialog');
          resolve();
          return;
        }
        const L = lines[i];
        who.textContent = L.who || '';
        who.classList.toggle('sys', !!L.sys);
        if (L.photo) {
          const src = `img_photo_${L.photo}.jpg`;
          if (!img.src.endsWith(src)) { img.style.opacity = '0'; img.onload = () => { img.style.opacity = '1'; }; img.src = src; }
          photo.classList.remove('hidden');
        } else photo.classList.add('hidden');
        // 한 글자씩
        let k = 0;
        const full = L.text;
        text.textContent = '';
        clearInterval(typing);
        typing = setInterval(() => {
          k += 1;
          text.textContent = full.slice(0, k);
          if (k >= full.length) { clearInterval(typing); typing = null; }
        }, 28);
        g.audio.sfx('click', 0.25, 0.02);
      };
      const advance = () => {
        if (typing) { clearInterval(typing); typing = null; text.textContent = lines[i].text; return; }
        show();
      };
      const onKey = (e) => { if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') { e.preventDefault(); advance(); } };
      const onClick = () => advance();
      const cleanup = () => { window.removeEventListener('keydown', onKey, true); box.removeEventListener('click', onClick); clearInterval(typing); };
      window.addEventListener('keydown', onKey, true);
      box.addEventListener('click', onClick);
      show();
    });
  }

  // ------------------------------------------------------------ 패널 공통
  openPanel(title, tabs, render, initial) {
    const g = this.game;
    g.setPaused(true, 'panel');
    this.panelOpen = true;
    const panel = $('#panel');
    panel.classList.remove('hidden');
    panel.querySelector('h2').textContent = title;
    const nav = panel.querySelector('.tabs');
    const body = panel.querySelector('.body');
    nav.innerHTML = '';
    this.panelState = { tabs, render, current: initial || (tabs && tabs[0] && tabs[0].id) };
    if (tabs) {
      for (const t of tabs) {
        const b = el('button', '', t.label);
        b.addEventListener('click', () => { this.panelState.current = t.id; this.refreshPanel(); g.audio.sfx('click', 0.3); });
        b.dataset.id = t.id;
        nav.appendChild(b);
      }
    }
    this.refreshPanel();
    body.scrollTop = 0;
  }
  refreshPanel() {
    if (!this.panelOpen) return;
    const panel = $('#panel');
    const body = panel.querySelector('.body');
    const ps = this.panelState;
    panel.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.id === ps.current));
    const scroll = body.scrollTop;
    body.innerHTML = '';
    ps.render(body, ps.current);
    body.scrollTop = scroll;
  }
  closePanel() {
    if (!this.panelOpen) return;
    if (this.panelState && this.panelState.locked) return;
    $('#panel').classList.add('hidden');
    this.panelOpen = false;
    const cb = this.panelState && this.panelState.onClose;
    this.panelState = null;
    this.game.setPaused(false, 'panel');
    cb && cb();
  }

  // ------------------------------------------------------------ 스탯
  openStats() {
    const g = this.game;
    this.openPanel('스탯', null, (body) => {
      const st = g.state;
      const d = derive(st);
      body.appendChild(el('p', 'lead', `레벨이 오를 때마다 2포인트를 원하는 스탯에 나눠 줄 수 있다. 최대 레벨은 ${MAX_LEVEL}.`));
      const head = el('div', 'kv', `<span>레벨</span><span>${st.level}${st.level >= MAX_LEVEL ? ' (최대)' : ` · 다음까지 ${fmt(xpNeed(st.level) - st.xp)} 경험치`}</span><span>남은 포인트</span><span><b style="color:var(--sodium)">${st.points}</b></span>`);
      body.appendChild(head);
      body.appendChild(el('h3', '', '레벨 스탯'));
      for (const k of Object.keys(STAT_LABEL)) {
        const row = el('div', 'stat');
        row.innerHTML = `<span>${STAT_LABEL[k]}</span><b>${st.stats[k]}</b><span class="s">${STAT_DESC[k]}</span>`;
        const b = el('button', 'btn', '+1');
        b.disabled = st.points <= 0;
        b.addEventListener('click', () => { g.allocStat(k); this.refreshPanel(); });
        row.appendChild(b);
        body.appendChild(row);
      }
      body.appendChild(el('h3', '', '층 스탯 · 한 층 올라갈 때마다 자동으로 +1'));
      body.appendChild(el('div', 'kv',
        `<span>생존력 ${d.survival}</span><span>회피 확률 ${(d.evasion * 100).toFixed(1)}%</span>` +
        `<span>손기술 ${d.handskill}</span><span>제작 성공률 ${(d.craftRate * 100).toFixed(0)}% · 제작 시간 ×${d.craftTimeMul.toFixed(2)}</span>` +
        `<span>멘탈 ${d.mental}</span><span>상태이상 지속 ×${d.statusMul.toFixed(2)} · 낮을수록 위층에서 포기하기 쉬워진다</span>`));
      body.appendChild(el('h3', '', '현재 능력치'));
      body.appendChild(el('div', 'kv',
        `<span>최대 HP</span><span>${d.maxHp}</span><span>최대 스태미나</span><span>${d.maxSta}</span>` +
        `<span>근접 공격력</span><span>×${d.meleeMul.toFixed(2)}</span><span>원거리 공격력</span><span>×${d.rangedMul.toFixed(2)}</span>` +
        `<span>속도</span><span>×${d.speedMul.toFixed(3)}</span>`));
    });
  }

  // ------------------------------------------------------------ 가방 · 제작
  openInventory(tab = 'weapons') {
    const g = this.game;
    const tabs = [{ id: 'weapons', label: '무기' }, { id: 'bag', label: '가방' }, { id: 'craft', label: '제작' }];
    this.openPanel('가방', tabs, (body, cur) => {
      const st = g.state;
      if (cur === 'weapons') {
        body.appendChild(el('h3', '', '근접 무기'));
        const list = el('div', 'list');
        for (const w of MELEE) {
          if (!st.melee.includes(w.id)) continue;
          const row = el('div', 'row' + (st.meleeEq === w.id ? ' on' : ''));
          const strNote = w.str ? ` · 힘 ${w.str} 필요${st.stats.str < w.str ? ' (부족: 공격 간격 2배)' : ''}` : '';
          row.innerHTML = `<div><div class="t">${w.name}</div><div class="s">공격력 ${w.atk} · ${SPEED_LABEL[w.spd]} · 리치 ${w.reach}${strNote}${w.note ? ' · ' + w.note : ''}</div></div>`;
          const b = el('button', 'btn', st.meleeEq === w.id ? '사용 중' : '들기');
          b.disabled = st.meleeEq === w.id;
          b.addEventListener('click', () => { g.equipMelee(w.id); this.refreshPanel(); });
          row.appendChild(b);
          list.appendChild(row);
        }
        body.appendChild(list);
        body.appendChild(el('h3', '', '원거리 무기'));
        const list2 = el('div', 'list');
        const cur2 = equippedRanged(st);
        for (const w of rangedAvailable(st)) {
          const ammo = rangedAmmo(st, w);
          const row = el('div', 'row' + (cur2 === w ? ' on' : ''));
          const atk = w.scaleThrow ? baseballAtk(st.stats.thr) : w.atk;
          const tags = [w.retrieve ? '던진 뒤 주워 올 수 있음' : '', w.consume ? '던지면 사라짐' : '', w.aoe ? '범위 폭발' : '', w.pierce ? '관통' : '', w.str ? `힘 ${w.str} 필요` : '', w.note || ''].filter(Boolean).join(' · ');
          row.innerHTML = `<div><div class="t">${w.name} <span class="s">${ammo === Infinity ? '무한' : ammo + (w.gun ? '발' : '개')}</span></div><div class="s">공격력 ${Math.round(atk)}${tags ? ' · ' + tags : ''}</div></div>`;
          const b = el('button', 'btn', cur2 === w ? '사용 중' : '들기');
          b.disabled = cur2 === w;
          b.addEventListener('click', () => { g.equipRanged(w.id); this.refreshPanel(); });
          row.appendChild(b);
          list2.appendChild(row);
        }
        body.appendChild(list2);
      } else if (cur === 'bag') {
        const entries = Object.entries(st.items).filter(([, n]) => n > 0).sort((a, b) => a[0].localeCompare(b[0], 'ko'));
        if (!entries.length) { body.appendChild(el('p', 'lead', '가방이 비어 있다. 몬스터를 쓰러뜨리면 재료가 떨어진다.')); return; }
        const list = el('div', 'list');
        for (const [name, n] of entries) {
          const row = el('div', 'row');
          row.innerHTML = `<div class="t">${name}</div><div class="s">${n}개</div>`;
          list.appendChild(row);
        }
        body.appendChild(list);
        body.appendChild(el('p', 'lead', '죽으면 돈과 아이템의 절반을 잃는다. 감염된 방 안에서는 잃지 않는다.'));
      } else {
        const d = derive(st);
        body.appendChild(el('p', 'lead', `즉석 무기는 어디서나, 나머지는 시설 옆에서 만든다. 성공률 ${(d.craftRate * 100).toFixed(0)}%, 실패하면 재료 절반을 잃는다.`));
        const list = el('div', 'list');
        for (const r of RECIPES) {
          const unlocked = st.maxReached <= r.floor;
          const row = el('div', 'row' + (unlocked ? '' : ' locked'));
          if (!unlocked) {
            row.innerHTML = `<div><div class="t">???</div><div class="s">B${r.floor} 에 도달하면 만드는 법을 알게 된다</div></div>`;
            list.appendChild(row);
            continue;
          }
          const needs = Object.entries(r.need).map(([k, n]) => {
            const have = itemCount(st, k);
            return `<span class="${have >= n ? 'need-ok' : 'need-no'}">${k} ${have}/${n}</span>`;
          }).join(' · ');
          const station = r.station ? STATION_LABEL[r.station] : '맨손';
          const near = g.stationAvailable(r.station);
          const owned = r.out.melee && st.melee.includes(r.out.melee);
          const time = Math.max(1, Math.round(r.time * d.craftTimeMul));
          row.innerHTML = `<div><div class="t">${r.name} <span class="s">${station} · ${time}초 · ${r.gold} G</span></div><div class="s">${needs}</div><div class="s">${r.how}</div></div>`;
          const b = el('button', 'btn primary', owned ? '보유 중' : '만들기');
          const can = g.canCraft(r);
          b.disabled = owned || !can.ok || !!g.crafting;
          b.title = can.reason || '';
          if (!near && r.station) b.textContent = `${station} 필요`;
          b.addEventListener('click', () => { if (g.startCraft(r)) this.closePanel(); });
          row.appendChild(b);
          list.appendChild(row);
        }
        body.appendChild(list);
      }
    }, tab);
  }

  // ------------------------------------------------------------ 상점
  openShop(kind) {
    const g = this.game;
    const title = kind === 'display' ? '전시실 상점' : kind === 'town' ? '주민 상점' : '보급 단말기';
    this.openPanel(title, null, (body) => {
      const st = g.state;
      const disc = g.discount();
      if (kind === 'terminal') {
        const cd = g.restCooldown();
        const row = el('div', 'row');
        row.innerHTML = `<div><div class="t">휴식</div><div class="s">HP를 모두 회복하고 멘탈 +2${cd > 0 ? ` · ${Math.ceil(cd)}초 후 가능` : ''}</div></div>`;
        const b = el('button', 'btn', '쉬기');
        b.disabled = cd > 0;
        b.addEventListener('click', () => { g.rest(); this.refreshPanel(); });
        row.appendChild(b);
        body.appendChild(row);
      }
      body.appendChild(el('p', 'lead', `가진 돈 ${fmt(st.gold)} G${disc > 0 ? ` · 상인 할인 ${Math.round(disc * 100)}%` : ''}`));
      const list = el('div', 'list');
      const items = kind === 'display' ? (DISPLAY_SHOP[st.floor] || []) : SHOP.filter((s) => !s.from || st.maxReached <= s.from);
      for (const it of items) {
        const price = Math.round(it.price * (1 - disc));
        const owned = it.give.melee && st.melee.includes(it.give.melee);
        const row = el('div', 'row');
        const have = it.give.item ? ` · 가진 것 ${itemCount(st, it.give.item)}` : '';
        row.innerHTML = `<div><div class="t">${it.name}</div><div class="s">${it.desc}${have}</div></div>`;
        const b = el('button', 'btn', owned ? '보유 중' : `${fmt(price)} G`);
        b.disabled = owned || st.gold < price;
        b.addEventListener('click', () => { g.buy(it, price); this.refreshPanel(); });
        row.appendChild(b);
        list.appendChild(row);
      }
      body.appendChild(list);
    });
  }

  // ------------------------------------------------------------ 도시
  openTown(tab = 'people') {
    const g = this.game;
    const tabs = [{ id: 'people', label: '주민' }, { id: 'build', label: '시설' }, { id: 'res', label: '자원' }];
    this.openPanel('도시', tabs, (body, cur) => {
      const st = g.state;
      const { out, use } = townRates(st);
      if (cur === 'people') {
        body.appendChild(el('p', 'lead', `주민 ${st.residents.length}/${MAX_RESIDENTS}명. 주민마다 할 수 있는 일이 두 가지씩 있고, 그중 하나만 맡길 수 있다.`));
        const list = el('div', 'list');
        st.residents.forEach((r, idx) => {
          const row = el('div', 'row');
          const chips = r.jobs.map((j) => `<span class="chip ${JOBS[j].freq === 'rare' ? 'rare' : ''}">${JOBS[j].name}</span>`).join('');
          row.innerHTML = `<div><div class="t">${r.name}</div><div class="s">${chips}</div></div>`;
          const sel = el('select');
          for (const j of r.jobs) sel.appendChild(new Option(JOBS[j].name, j, false, r.work === j));
          sel.appendChild(new Option('휴식', 'rest', false, r.work === 'rest'));
          sel.addEventListener('change', () => { g.setJob(idx, sel.value); this.refreshPanel(); });
          row.appendChild(sel);
          list.appendChild(row);
        });
        body.appendChild(list);
        const acts = el('div', 'row');
        const tcd = g.talkCooldown();
        acts.innerHTML = `<div><div class="t">주민과 이야기하기</div><div class="s">멘탈 +1${tcd > 0 ? ` · ${Math.ceil(tcd)}초 후 가능` : ''}</div></div>`;
        const tb = el('button', 'btn', '이야기하기');
        tb.disabled = tcd > 0;
        tb.addEventListener('click', () => { g.talk(); this.refreshPanel(); });
        acts.appendChild(tb);
        body.appendChild(el('h3', '', ''));
        body.appendChild(acts);
        const d = derive(st);
        if (d.merchants > 0) {
          const sh = el('div', 'row');
          sh.innerHTML = `<div><div class="t">주민 상점</div><div class="s">상인이 일하는 동안 어디서든 물건을 살 수 있다${st.town.res.power <= 0 ? ' · 전력이 없어 문을 닫았다' : ''}</div></div>`;
          const sb = el('button', 'btn', '열기');
          sb.disabled = st.town.res.power <= 0;
          sb.addEventListener('click', () => { this.closePanel(); this.openShop('town'); });
          sh.appendChild(sb);
          body.appendChild(sh);
        }
      } else if (cur === 'build') {
        body.appendChild(el('p', 'lead', `업그레이드에는 건축 자원과 돈이 든다. 건축 자원 ${fmt(st.town.res.build)} · 돈 ${fmt(st.gold)} G`));
        const list = el('div', 'list');
        for (const [k, b] of Object.entries(BUILDINGS)) {
          const lvl = st.town.bld[k];
          const cost = g.upgradeCost(k);
          const row = el('div', 'row');
          const desc = b.desc || (b.job ? `${JOBS[b.job].name} 한 명당 생산량 ×${(1 + 0.5 * (Math.max(1, lvl) - 1)).toFixed(1)}` : '');
          row.innerHTML = `<div><div class="t">${b.name} <span class="s">Lv ${lvl}</span></div><div class="s">${desc}</div></div>`;
          const btn = el('button', 'btn', lvl >= 5 ? '최대' : `${lvl === 0 ? '짓기' : '올리기'} · 자원 ${cost.build} · ${fmt(cost.gold)} G`);
          btn.disabled = lvl >= 5 || st.town.res.build < cost.build || st.gold < cost.gold;
          btn.addEventListener('click', () => { g.upgrade(k); this.refreshPanel(); });
          row.appendChild(btn);
          list.appendChild(row);
        }
        body.appendChild(list);
      } else {
        body.appendChild(el('p', 'lead', '8초마다 생산하고 소비한다. 식량·물·산소가 바닥나면 멘탈이 깎이고, 전력이 없으면 층의 조명이 어두워진다.'));
        const list = el('div', 'list');
        for (const k of Object.keys(RES_LABEL)) {
          const net = out[k] - use[k];
          const row = el('div', 'row');
          row.innerHTML = `<div><div class="t">${RES_LABEL[k]} <span class="s">${fmt(st.town.res[k])}</span></div><div class="s">생산 ${out[k].toFixed(1)} · 소비 ${use[k].toFixed(1)}</div></div><div class="s" style="color:${net < 0 ? 'var(--rust)' : 'var(--moss)'}">${net >= 0 ? '+' : ''}${net.toFixed(1)} / 8초</div>`;
          list.appendChild(row);
        }
        body.appendChild(list);
      }
    }, tab);
  }

  openRecruit(cand) {
    const g = this.game;
    this.openPanel('생존자', null, (body) => {
      const st = g.state;
      const chips = cand.jobs.map((j) => `<span class="chip ${JOBS[j].freq === 'rare' ? 'rare' : ''}">${JOBS[j].name}</span>`).join('');
      body.appendChild(el('p', 'lead', `<b>${cand.name}</b> — "나도 여기 갇혀 있었어. 같이 가도 될까?"<br>할 수 있는 일: ${chips}`));
      const full = st.residents.length >= MAX_RESIDENTS;
      if (!full) {
        const row = el('div', 'choice');
        const a = el('button', '', `<b>받아들인다</b><span>${JOBS[cand.jobs[0]].name} 일을 맡긴다</span>`);
        a.addEventListener('click', () => { g.recruit(cand, -1); this.closePanel(); });
        const b = el('button', '', '<b>보낸다</b><span>다른 길로 가라고 한다</span>');
        b.addEventListener('click', () => { g.declineSurvivor(); this.closePanel(); });
        row.append(a, b);
        body.appendChild(row);
      } else {
        body.appendChild(el('p', 'lead', `주민이 ${MAX_RESIDENTS}명으로 가득 찼다. 받아들이려면 한 명을 내보내야 한다.`));
        const list = el('div', 'list');
        st.residents.forEach((r, idx) => {
          const row = el('div', 'row');
          row.innerHTML = `<div><div class="t">${r.name}</div><div class="s">${r.jobs.map((j) => JOBS[j].name).join(' · ')}</div></div>`;
          const b = el('button', 'btn danger', '내보내고 받기');
          b.addEventListener('click', () => { g.recruit(cand, idx); this.closePanel(); });
          row.appendChild(b);
          list.appendChild(row);
        });
        body.appendChild(list);
        const no = el('button', 'btn', '받지 않는다');
        no.style.marginTop = '12px';
        no.addEventListener('click', () => { g.declineSurvivor(); this.closePanel(); });
        body.appendChild(no);
      }
    });
  }

  // ------------------------------------------------------------ 녹음 · 기록
  openRecording(rec, reveal) {
    this.openPanel(rec.title, null, (body) => {
      body.appendChild(el('div', 'rec', decodeRecording(rec, reveal)));
      body.appendChild(el('p', 'lead', '잡음이 심하다. 멘탈이 높을수록, 연구원이 많을수록 더 많이 들린다. 들을 때마다 멘탈이 1 깎인다.'));
    });
  }
  openJournal() {
    const g = this.game;
    const tabs = [{ id: 'rec', label: '녹음' }, { id: 'photo', label: '가족사진' }];
    if (g.state.flags.damagedLog) tabs.push({ id: 'log', label: '연구 일지' });
    this.openPanel('기록', tabs, (body, cur) => {
      const st = g.state;
      if (cur === 'rec') {
        const heard = RECORDINGS.filter((r) => st.heard[r.floor]);
        if (!heard.length) { body.appendChild(el('p', 'lead', '아직 들은 녹음이 없다. 녹음기는 빨간 불빛이 깜박인다.')); return; }
        const list = el('div', 'list');
        for (const r of heard) {
          const row = el('div', 'row');
          row.innerHTML = `<div><div class="t">${r.title} <span class="s">B${r.floor}</span></div><div class="s">${r.lead}</div></div>`;
          const b = el('button', 'btn', '다시 듣기');
          b.addEventListener('click', () => { this.closePanel(); g.playRecording(r); });
          row.appendChild(b);
          list.appendChild(row);
        }
        body.appendChild(list);
      } else if (cur === 'photo') {
        const img = el('img', 'photo-view');
        img.src = st.flags.revealed ? 'img_photo_clear.jpg' : 'img_photo_smudged.jpg';
        img.alt = '가족사진';
        body.appendChild(img);
        const cd = g.photoCooldown();
        const row = el('div', 'row');
        row.style.marginTop = '14px';
        row.innerHTML = `<div><div class="t">사진을 들여다본다</div><div class="s">${st.flags.revealed ? '아빠의 얼굴이 또렷하다.' : 'B100 에서부터 지니고 있던 사진. 한쪽 얼굴이 물에 번져 알아볼 수 없다.'} 멘탈 +2${cd > 0 ? ` · ${Math.ceil(cd)}초 후 가능` : ''}</div></div>`;
        const b = el('button', 'btn', '보기');
        b.disabled = cd > 0;
        b.addEventListener('click', () => { g.viewPhoto(); this.refreshPanel(); });
        row.appendChild(b);
        body.appendChild(row);
      } else {
        body.appendChild(el('div', 'rec', DAMAGED_LOG.text));
      }
    });
  }

  // ------------------------------------------------------------ 메뉴
  openPause() {
    const g = this.game;
    this.openPanel('잠시 멈춤', [{ id: 'menu', label: '메뉴' }, { id: 'keys', label: '조작법' }], (body, cur) => {
      if (cur === 'menu') {
        const v1 = el('div', 'vol', `<span>음악</span><input type="range" min="0" max="1" step="0.05" value="${g.audio.musicVol}">`);
        v1.querySelector('input').addEventListener('input', (e) => g.audio.setMusicVolume(+e.target.value));
        const v2 = el('div', 'vol', `<span>효과음</span><input type="range" min="0" max="1" step="0.05" value="${g.audio.sfxVol}">`);
        v2.querySelector('input').addEventListener('input', (e) => g.audio.setSfxVolume(+e.target.value));
        body.append(v1, v2);
        const row = el('div', 'choice');
        const a = el('button', '', '<b>계속하기</b><span>게임으로 돌아간다</span>');
        a.addEventListener('click', () => this.closePanel());
        const b = el('button', '', '<b>저장하고 타이틀로</b><span>층을 오르내릴 때도 자동으로 저장된다</span>');
        b.addEventListener('click', () => { this.closePanel(); g.quitToTitle(); });
        row.append(a, b);
        body.appendChild(row);
      } else body.appendChild(this.howtoEl());
    });
  }
  howtoEl() {
    if (this.game.touchMode) {
      return el('div', 'howto', [
        ['왼쪽 화면', '손가락을 대고 끌면 이동 · 끝까지 밀면 달리기'], ['공격', '누르고 있으면 계속 휘두른다'],
        ['던지기', '가장 가까운 적을 자동으로 노린다 (공중의 적은 이걸로)'], ['구르기', '잠깐 무적'],
        ['상호작용', '계단·문·단말기·녹음기·생존자 (빛나면 누를 수 있다)'], ['회복', '붕대·통조림 사용'],
        ['위쪽 버튼', '무기 교체 · 가방 · 스탯 · 기록 · 도시 · 메뉴'],
      ].map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join(''));
    }
    return el('div', 'howto', [
      ['WASD', '이동'], ['마우스', '조준'], ['좌클릭', '근접 공격'], ['우클릭', '던지기·쏘기 (공중의 적은 이걸로)'],
      ['Shift', '달리기 (스태미나 소모)'], ['Space', '구르기 (잠깐 무적)'], ['E', '계단·문·단말기·녹음기·생존자'],
      ['F', '회복 아이템 사용'], ['Q / R', '근접 / 원거리 무기 바꾸기'], ['I', '가방·제작'], ['K', '스탯'], ['J', '녹음·가족사진'],
      ['T', '도시 관리 (B68 이후)'], ['Esc', '메뉴'],
    ].map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join(''));
  }
  openHowto() {
    this.openPanel('조작법', null, (body) => {
      body.appendChild(this.howtoEl());
      body.appendChild(el('p', 'lead', 'B100 에서 시작해 B1 까지 올라간다. 5층마다 중간 보스, 3층마다 감염된 방이 있다. 이미 지나온 층으로 내려가면 7.5% 확률로 다시 감염된다.'));
    });
  }

  openEndingChoice() {
    const g = this.game;
    return new Promise((resolve) => {
      this.openPanel('…', null, (body) => {
        body.appendChild(el('p', 'lead', '통제실 너머로 지상으로 가는 문이 열려 있다. 아래에서는 사람들이 기다리고 있다.'));
        const row = el('div', 'choice');
        const a = el('button', '', '<b>밖으로 나간다</b><span>아빠가 막으려던 세상으로</span>');
        const b = el('button', '', '<b>여기 남는다</b><span>아빠가 서 있던 자리에</span>');
        a.addEventListener('click', () => { this.panelState.locked = false; this.closePanel(); resolve('leave'); });
        b.addEventListener('click', () => { this.panelState.locked = false; this.closePanel(); resolve('stay'); });
        row.append(a, b);
        body.appendChild(row);
      });
      this.panelState.locked = true;
      $('#panel .close').classList.add('hidden');
      this.panelState.onClose = () => $('#panel .close').classList.remove('hidden');
    });
  }

  playEnding(ending) {
    return new Promise((resolve) => {
      const box = $('#ending');
      const img = box.querySelector('.img');
      const lines = box.querySelector('.lines');
      const title = box.querySelector('.end-title');
      box.classList.remove('hidden');
      img.style.backgroundImage = `url(img_${ending.image}.jpg)`;
      img.style.opacity = '0';
      title.style.opacity = '0';
      lines.innerHTML = '';
      let i = 0;
      let done = false;
      const timers = [];
      const finish = () => {
        if (done) return;
        done = true;
        timers.forEach(clearTimeout);
        lines.innerHTML = '';
        img.style.opacity = '0.25';
        title.innerHTML = `${ending.title}<small>엔딩 · 플레이해 주셔서 고맙습니다</small>`;
        title.style.opacity = '1';
        setTimeout(() => {
          const back = () => { box.removeEventListener('click', back); box.classList.add('hidden'); resolve(); };
          box.addEventListener('click', back);
        }, 2500);
      };
      box.querySelector('.skip').onclick = (e) => { e.stopPropagation(); finish(); };
      timers.push(setTimeout(() => { img.style.opacity = '0.85'; }, 300));
      const next = () => {
        if (done) return;
        if (i >= ending.lines.length) { timers.push(setTimeout(finish, 2500)); return; }
        lines.innerHTML = '';
        const p = el('p', '', ending.lines[i]);
        lines.appendChild(p);
        requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('on')));
        i++;
        timers.push(setTimeout(next, 4200));
      };
      timers.push(setTimeout(next, 1800));
    });
  }
}
