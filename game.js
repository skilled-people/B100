// =====================================================================
//  《지하 100층》 게임 본체 — 모든 시스템을 연결한다
// =====================================================================
import * as THREE from './three.module.js';
import {
  BOSSES, BOSS_MINIONS, MONSTERS, MELEE, meleeById, rangedById, FLOOR_PICKUPS, RECIPES, MATERIALS, materialTable,
  monstersForFloor, floorCoef, progressOf, stageOf, isBossFloor, roomTier, ROOM_OVERFLOW_OUT, ROOM_AFTER_OVERFLOW,
  JOBS, START_RESIDENTS, RESIDENT_NAMES, MAX_RESIDENTS, MENTAL, REINFECT_CHANCE, BALANCE,
} from './data.js';
import {
  newState, floorState, derive, addXp, itemCount, addItem, rangedAvailable, equippedMelee, equippedRanged, townRates, save,
} from './state.js';
import { buildFloor, disposeFloor, resolveCircle, pointBlocked, inRoomArea, HW, ROOM, DOOR, BOSS_POS, mulberry32, stageColors } from './world.js';
import { M, G, mesh, makeProjectile, makeWeapon, makeDecal, makeHive, makePickupGlint, buildCharacter, makeBlobShadow } from './models.js';
import { Enemy } from './enemies.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { SCENES, FATHER_LINES, recordingByFloor, ENDINGS, OBSTRUCT_LINES, DAMAGED_LOG } from './story.js';

const DEV = new URLSearchParams(location.search).has('dev');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const v3 = new THREE.Vector3();

export class Game {
  constructor(renderer, audio) {
    this.renderer = renderer;
    this.audio = audio;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 160);
    this.camera.position.set(0, 16, 12);
    this.hemi = new THREE.HemisphereLight(0x5a5048, 0x1a120c, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xbfc8d0, 0.35);
    this.sun.position.set(-8, 20, 6);
    this.scene.add(this.sun);
    this.ui = new UI(this);
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.telegraphs = [];
    this.zones = [];
    this.npcs = [];
    this.timers = [];
    this.bursts = [];
    this.tweens = [];
    this.pauseReasons = new Set();
    this.paused = false;
    this.running = false;
    this.cinematic = false;
    this.input = { up: false, down: false, left: false, right: false, sprint: false, attack: false, throw: false, dodge: false };
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.aim = new THREE.Vector3();
    this.shakeT = 0;
    this.mmT = 0;
    this.saveT = 0;
    this.player = null;
    this.floor = null;
    this.roomPhase = 'idle';
    this.roomRun = null;
    this.roomHeart = null;
    this.god = false;
    this.bindInput();
  }

  // ============================================================ 입력
  bindInput() {
    const keymap = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'sprint', ShiftRight: 'sprint' };
    window.addEventListener('keydown', (e) => {
      if (!this.running) return;
      if (this.ui.dialogOpen) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.ui.panelOpen) this.ui.closePanel();
        else if (!this.cinematic) this.ui.openPause();
        return;
      }
      if (this.ui.panelOpen) {
        const toggles = { KeyI: 1, KeyK: 1, KeyJ: 1, KeyT: 1 };
        if (toggles[e.code]) this.ui.closePanel();
        return;
      }
      if (this.cinematic) return;
      if (keymap[e.code]) { this.input[keymap[e.code]] = true; e.preventDefault(); return; }
      if (e.repeat) return;
      switch (e.code) {
        case 'Space': this.input.dodge = true; e.preventDefault(); break;
        case 'KeyE': this.interact(); break;
        case 'KeyF': this.useHeal(); break;
        case 'KeyQ': this.cycleMelee(); break;
        case 'KeyR': this.cycleRanged(); break;
        case 'KeyI': this.clearInput(); this.ui.openInventory(); break;
        case 'KeyK': this.clearInput(); this.ui.openStats(); break;
        case 'KeyJ': this.clearInput(); this.ui.openJournal(); break;
        case 'KeyT': if (this.state.town.started) { this.clearInput(); this.ui.openTown(); } break;
        default:
          if (DEV) this.devKey(e.code);
      }
    });
    window.addEventListener('keyup', (e) => { if (keymap[e.code]) this.input[keymap[e.code]] = false; });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.running || this.paused || this.cinematic || this.touchMode) return;
      if (e.target.closest && e.target.closest('#panel, #dialog, #title, #ending')) return;
      if (e.button === 0) this.input.attack = true;
      if (e.button === 2) this.input.throw = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.attack = false;
      if (e.button === 2) this.input.throw = false;
    });
    window.addEventListener('contextmenu', (e) => { if (this.running) e.preventDefault(); });
    window.addEventListener('blur', () => {
      this.clearInput();
      if (this.running && !this.paused && !this.cinematic) this.ui.openPause();
    });
  }
  clearInput() { for (const k of Object.keys(this.input)) this.input[k] = (k === 'ax' || k === 'az') ? 0 : false; }

  setPaused(v, reason) {
    if (v) this.pauseReasons.add(reason); else this.pauseReasons.delete(reason);
    this.paused = this.pauseReasons.size > 0;
    if (this.paused) this.clearInput();
  }

  // ============================================================ 시작 · 종료
  async start(state, isNew) {
    this.state = state || newState();
    if (!this.player) this.player = new Player(this);
    this.player.root.visible = true;
    this.player.shadow.visible = true;
    this.running = true;
    this.cinematic = false;
    this.pauseReasons.clear();
    this.paused = false;
    this.ui.showHud(true);
    this.player.resetVitals();
    await this.enterFloor(this.state.floor, isNew ? 'new' : 'load');
    if (isNew) {
      await this.ui.playScene(SCENES.intro);
      this.ui.toast('위로 가는 계단은 북쪽에 있다. 미니맵의 노란 삼각형.', 'gold');
      this.ui.toast(this.touchMode ? '기록 버튼으로 들고 있던 가족사진을 볼 수 있다.' : 'J 키로 들고 있던 가족사진을 볼 수 있다.');
    }
  }

  async quitToTitle() {
    save(this.state);
    this.running = false;
    this.cinematic = false;
    await this.fadeTo(1);
    this.clearFloorEntities();
    if (this.floor) { disposeFloor(this.floor); this.floor = null; }
    this.ui.showHud(false);
    this.ui.prompt(null);
    document.getElementById('bossbar').classList.add('hidden');
    this.onQuit && this.onQuit();
  }

  fadeTo(v, ms = 600) {
    const f = document.getElementById('fade');
    f.style.transition = `opacity ${ms}ms`;
    f.style.opacity = String(v);
    return sleep(ms);
  }

  after(t, fn) { this.timers.push({ t, fn }); }
  tween(dur, fn, done) { this.tweens.push({ t: 0, dur, fn, done }); }

  // ============================================================ 층
  clearFloorEntities() {
    for (const e of this.enemies) e.remove();
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const p of this.pickups) this.scene.remove(p.mesh);
    for (const t of this.telegraphs) this.scene.remove(t.mesh);
    for (const z of this.zones) this.scene.remove(z.mesh);
    for (const n of this.npcs) { this.scene.remove(n.rig.root); this.scene.remove(n.shadow); }
    for (const b of this.bursts) this.scene.remove(b.obj);
    this.enemies = []; this.projectiles = []; this.pickups = []; this.telegraphs = []; this.zones = []; this.npcs = []; this.bursts = [];
    this.timers = [];
    this.roomRun = null;
    this.roomHeart = null;
    this.roomPhase = 'idle';
    this.bossPending = false;
    this.crafting = null;
    this.twinTimer = null;
  }

  async enterFloor(f, from) {
    await this.fadeTo(1, from === 'new' || from === 'load' ? 10 : 450);
    const st = this.state;
    this.clearFloorEntities();
    if (this.floor) disposeFloor(this.floor);
    st.floor = f;
    const fs = floorState(st, f);
    const firstVisit = !fs.visited;
    fs.visited = true;
    this.floor = buildFloor(f, st);
    this.scene.add(this.floor.group);
    const [fogCol, skyCol] = stageColors(this.floor.stage.id);
    this.scene.background = new THREE.Color(fogCol);
    this.scene.fog = new THREE.FogExp2(fogCol, 0.024);
    this.hemi.color.setHex(skyCol);

    // 위치
    const p = this.player;
    const sp = from === 'above' ? this.floor.spawnFromAbove : this.floor.spawnFromBelow;
    p.pos.copy(sp);
    p.facing = from === 'above' ? 0 : Math.PI;
    p.dash = 0;
    if (from === 'load' || from === 'new') p.resetVitals();
    this.camera.position.set(p.pos.x, 16, p.pos.z + 12);

    // 감염된 방
    if (this.floor.room) {
      const tier = roomTier(f);
      if (!fs.room) fs.room = { count: tier.max * (0.2 + this.floor.rnd() * 0.3), pending: 0 };
      this.floor.room.doorBox.open = false;
    }
    // 몬스터
    if (!fs.cleared || fs.reinfected) this.spawnFloorMonsters();
    if (fs.room && fs.room.pending > 0) {
      this.spawnOverflow(Math.round(fs.room.pending));
      fs.room.pending = 0;
    }
    // 보스
    if (isBossFloor(f) && !fs.bossDefeated) this.bossPending = true;
    // 줍기
    const list = FLOOR_PICKUPS[f] || [];
    list.forEach((pk, i) => {
      const key = 'p' + i;
      if (fs.taken.includes(key)) return;
      const spot = this.floor.spots[this.floor.spots.length - 1 - i] || { x: 4 + i * 2, z: 4 };
      this.spawnPickup({ ...pk, key }, spot.x, spot.z);
    });
    // 생존자
    if (this.floor.special.survivor && st.town.started && !fs.survivorDone) this.spawnSurvivor();
    this.updateBgm();
    save(st);
    await this.fadeTo(0, 500);

    // 이야기
    if (firstVisit && f === 68 && !st.flags.meet) await this.meetResidents();
    if (f === 1 && !st.flags.b1enter) {
      st.flags.b1enter = true;
      await this.ui.playScene(SCENES.b1enter);
    }
  }

  spawnFloorMonsters() {
    const f = this.state.floor;
    const types = monstersForFloor(f);
    if (!types.length) return;
    const stage = stageOf(f);
    const n = isBossFloor(f) ? 3 : 5 + stage.id;
    const rnd = mulberry32(f * 31 + (this.state.floors[f].reinfected ? 7 : 0) + Math.floor(this.state.playTime));
    for (let i = 0; i < n && i < this.floor.spots.length - 4; i++) {
      const s = this.floor.spots[i];
      const t = types[Math.floor(rnd() * types.length)];
      this.spawnEnemy(t, s.x, s.z, { tag: 'floor' });
    }
  }

  spawnOverflow(n) {
    const types = monstersForFloor(this.state.floor);
    if (!types.length) return;
    const d = derive(this.state);
    const guardF = this.state.town.started && this.state.floor <= 68 ? 1 - Math.min(0.5, d.guards * 0.1) : 1;
    const count = Math.min(30, Math.round(n * guardF));
    for (let i = 0; i < count; i++) {
      const t = types[Math.floor(Math.random() * types.length)];
      this.spawnEnemy(t, 18 + Math.random() * 6, Math.max(-HW + 2, Math.min(HW - 2, DOOR.z + (Math.random() - 0.5) * 9)), { tag: 'overflow' });
    }
    if (count > 0) this.state.floors[this.state.floor].cleared = false;
    return count;
  }

  spawnEnemy(type, x, z, opts = {}) {
    if (this.enemies.length > 90) return null;
    if (!opts.boss && !opts.def && !MONSTERS[type]) return null;
    const e = new Enemy(this, type, x, z, opts);
    e.owner = opts.owner;
    this.enemies.push(e);
    return e;
  }

  // ============================================================ 메인 루프
  frame(dt) {
    dt = Math.min(dt, 0.05);
    // 연출 트윈은 멈춤과 상관없이 진행
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) { this.tweens.splice(i, 1); tw.done && tw.done(); }
    }
    if (this.running && this.floor) {
      if (!this.paused) this.update(dt);
      this.ui.updateHud(this.paused ? 0.2 : dt);
      this.updateCamera(dt);
      this.renderer.render(this.scene, this.camera);
      this.ui.drawOverlay(this.paused ? 0 : dt, this.camera);
    }
  }

  update(dt) {
    const st = this.state;
    st.playTime += dt;
    // 예약 실행
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    // 조준
    if (this.touchMode) this.updateTouchAim();
    else {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      this.raycaster.ray.intersectPlane(this.ground, this.aim);
    }

    if (!this.cinematic) this.player.update(dt, this.input);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (this.cinematic && e.alive) { e.animate(dt); continue; }
      if (e.update(dt)) { e.remove(); this.enemies.splice(i, 1); }
    }
    this.separateEnemies();
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateTelegraphs(dt);
    this.updateZones(dt);
    this.updateBursts(dt);
    this.updateNpcs(dt);
    this.updateRooms(dt);
    this.updateBoss(dt);
    this.updateTown(dt);
    this.updateCrafting(dt);
    this.updateAnimated(dt);
    this.updateRegen(dt);
    this.checkCleared();
    if (!this.cinematic) this.updatePrompt();
    this.mmT -= dt;
    if (this.mmT <= 0) { this.mmT = 1 / 20; this.ui.drawMinimap(); }
    this.saveT += dt;
    if (this.saveT > 60) { this.saveT = 0; save(st); }
  }

  // 터치: 가까운 적을 자동으로 조준, 없으면 움직이는 방향
  updateTouchAim() {
    const p = this.player.pos;
    let best = null, bd = 11;
    const inRoom = inRoomArea(p);
    for (const e of this.enemies) {
      if (!e.alive || e.state === 'burrowed' || e.isClone) continue;
      if (e.tag === 'heart' && (!inRoom || e.invulnerable)) continue;
      if ((e.tag === 'room') !== inRoom && e.tag !== 'heart') continue;
      let d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (e.isBoss) d -= 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { this.aim.set(best.pos.x, 0, best.pos.z); return; }
    const ax = this.input.ax || 0, az = this.input.az || 0;
    if (Math.hypot(ax, az) > 0.1) this.aim.set(p.x + ax * 4, 0, p.z + az * 4);
    else this.aim.set(p.x + Math.sin(this.player.facing) * 4, 0, p.z + Math.cos(this.player.facing) * 4);
  }

  updateCamera(dt) {
    const p = this.player.pos;
    // 보스가 있으면 둘 다 화면에 들어오도록 중심을 옮기고 조금 더 멀리서 본다
    let cx = p.x, cz = p.z, extra = 0;
    const boss = this.running ? this.activeBoss() : null;
    if (boss) {
      const d = Math.hypot(boss.pos.x - p.x, boss.pos.z - p.z);
      if (d < 22) { const k = 0.38; cx += (boss.pos.x - p.x) * k; cz += (boss.pos.z - p.z) * k; extra = Math.min(7, d * 0.3) + (boss.flying ? 2 : 0); }
    }
    let tx = cx, ty = 17 + extra, tz = cz + 11 + extra * 0.55, lx = cx, ly = 0.8, lz = cz - 2.6;
    if (this.camFocus) {
      const f = this.camFocus;
      tx = f.x; ty = f.y + 3.2; tz = f.z + 4.6; lx = f.x; ly = f.y + 0.6; lz = f.z;
    }
    const k = Math.min(1, dt * (this.camFocus ? 1.6 : 6));
    this.camera.position.x += (tx - this.camera.position.x) * k;
    this.camera.position.y += (ty - this.camera.position.y) * k;
    this.camera.position.z += (tz - this.camera.position.z) * k;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = this.shakeT * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camLook = this.camLook || new THREE.Vector3(lx, ly, lz);
    this.camLook.x += (lx - this.camLook.x) * k;
    this.camLook.y += (ly - this.camLook.y) * k;
    this.camLook.z += (lz - this.camLook.z) * k;
    this.camera.lookAt(this.camLook);
  }
  shake(v) { this.shakeT = Math.max(this.shakeT, v); }

  separateEnemies() {
    const list = this.enemies.filter((e) => e.alive && !e.flying && !e.external && e.state !== 'burrowed');
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const rr = (a.radius + b.radius) * 0.75;
        if (d < rr && d > 1e-4) {
          const push = (rr - d) * 0.5;
          const ma = a.isBoss ? 0.1 : 1, mb = b.isBoss ? 0.1 : 1;
          a.pos.x -= (dx / d) * push * ma; a.pos.z -= (dz / d) * push * ma;
          b.pos.x += (dx / d) * push * mb; b.pos.z += (dz / d) * push * mb;
        }
      }
      // 플레이어와 겹치지 않게
      const p = this.player.pos;
      const dx = a.pos.x - p.x, dz = a.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      const rr = a.radius * 0.8 + this.player.radius;
      if (d < rr && d > 1e-4 && !a.def.stationary) { a.pos.x = p.x + (dx / d) * rr; a.pos.z = p.z + (dz / d) * rr; }
    }
  }

  // ============================================================ 전투
  resolveMelee(w) {
    const p = this.player;
    if (p.hp <= 0) return;
    const d = derive(this.state);
    const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
    const hits = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (!(e.hittableByMelee || w.hitsAir)) continue;
      if (e.tag === 'heart' && !inRoomArea(p.pos)) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > w.reach + e.radius * 0.8) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / Math.max(dist, 1e-4)))) * 180 / Math.PI;
      if (ang > w.arc / 2 + 12 && dist > e.radius + 0.6) continue;
      hits.push({ e, dist });
    }
    hits.sort((a, b) => a.dist - b.dist);
    const maxT = w.pierce || w.arc >= 200 ? 99 : 3;
    let any = false;
    for (const { e } of hits.slice(0, maxT)) {
      const dmg = w.atk * d.meleeMul * (0.9 + Math.random() * 0.2);
      e.takeDamage(dmg, { knock: w.knock || (e.isBoss ? 0 : 0.35), stun: w.stun, root: w.root, bleed: w.bleed, pull: w.hitsAir });
      any = true;
    }
    if (any) {
      this.audio.sfx(w.atk >= 120 ? 'hit_heavy' : 'hit', 0.7);
      this.shake(0.12);
    }
    if (w.clearSpore) {
      p.status.spore = 0;
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const pr = this.projectiles[i];
        if (pr.owner === 'enemy' && pr.model === 'spore' && pr.mesh.position.distanceTo(p.pos) < w.reach + 1.5) this.killProjectile(i, false);
      }
      for (let i = this.zones.length - 1; i >= 0; i--) {
        const z = this.zones[i];
        if (z.kind === 'poison' && Math.hypot(z.x - p.pos.x, z.z - p.pos.z) < z.r + w.reach) z.t = z.dur;
      }
      this.spawnBurst(p.pos.x + fx * 1.5, p.pos.z + fz * 1.5, 'foam');
    }
  }

  playerShoot(w, atk) {
    const p = this.player;
    const from = new THREE.Vector3(p.pos.x + Math.sin(p.facing) * 0.5, 1.35, p.pos.z + Math.cos(p.facing) * 0.5);
    // 조준점 근처의 적에게 자동으로 높이를 맞춘다 (공중의 적용)
    let target = new THREE.Vector3(this.aim.x, 1.0, this.aim.z);
    let best = 3.4;
    for (const e of this.enemies) {
      if (!e.alive || e.state === 'burrowed') continue;
      if (e.tag === 'heart' && !inRoomArea(p.pos)) continue;
      const d = Math.hypot(e.pos.x - this.aim.x, e.pos.z - this.aim.z);
      if (d < best) { best = d; target = new THREE.Vector3(e.pos.x, e.centerY, e.pos.z); }
    }
    const dir = target.sub(from).normalize();
    const mesh = makeProjectile(w.model);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.projectiles.push({ owner: 'player', w, mesh, vel: dir.multiplyScalar(w.speed), dmg: atk, life: 26 / w.speed + 0.2, hitSet: new Set(), model: w.model, spin: !w.gun });
    if (w.gun) {
      this.audio.sfx('gun', 0.8);
      const flash = new THREE.PointLight(0xffd080, 30, 8, 2);
      flash.position.copy(from);
      this.scene.add(flash);
      this.after(0.06, () => this.scene.remove(flash));
    } else this.audio.sfx('throw', 0.6);
  }

  enemyShoot(enemy, target, opts) {
    const from = new THREE.Vector3(enemy.pos.x, enemy.flying ? enemy.pos.y : 1.3 * Math.max(1, enemy.def.size || 1), enemy.pos.z);
    const to = new THREE.Vector3(target.x, 1.1, target.z);
    const dir = to.sub(from).normalize();
    this.addEnemyProjectile(from, dir.multiplyScalar(opts.speed), opts);
  }
  enemyShootDir(enemy, d2, opts) {
    const y0 = enemy.flying ? enemy.pos.y : 1.3;
    const from = new THREE.Vector3(enemy.pos.x, y0, enemy.pos.z);
    const vy = (1.1 - y0) / (7 / opts.speed);
    const vel = new THREE.Vector3(d2.x * opts.speed, vy, d2.z * opts.speed);
    this.addEnemyProjectile(from, vel, opts);
  }
  addEnemyProjectile(from, vel, opts) {
    const mesh = makeProjectile(opts.model || 'spore');
    mesh.position.copy(from);
    if (opts.model !== 'spore') mesh.lookAt(from.clone().add(vel));
    this.scene.add(mesh);
    this.projectiles.push({ owner: 'enemy', mesh, vel, dmg: opts.dmg, life: 4, status: opts.status, model: opts.model || 'spore' });
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const m = pr.mesh;
      const prev = m.position.clone();
      m.position.addScaledVector(pr.vel, dt);
      pr.life -= dt;
      if (pr.spin) { m.rotation.x += dt * 12; m.rotation.z += dt * 7; }
      if (pr.owner === 'enemy' && pr.model !== 'spore') m.lookAt(m.position.clone().add(pr.vel));
      const pos = m.position;
      if (pr.owner === 'player') {
        let stop = false;
        for (const e of this.enemies) {
          if (!e.alive || pr.hitSet.has(e) || e.state === 'burrowed') continue;
          const dy = pos.y - e.centerY;
          const dist = Math.hypot(pos.x - e.pos.x, pos.z - e.pos.z, dy * 0.7);
          if (dist < e.radius * 0.95 + 0.35) {
            if (pr.w.aoe) { this.explode(pos.x, pos.z, pr.w.aoe, pr.dmg); stop = true; break; }
            e.takeDamage(pr.dmg, { ranged: true, knock: e.isBoss ? 0 : 0.25 });
            this.audio.sfx('enemy_hit', 0.5);
            pr.hitSet.add(e);
            if (!pr.w.pierce) { stop = true; break; }
          }
        }
        if (!stop && (pointBlocked(pos.x, pos.z, this.floor) || pos.y < 0.05)) {
          if (pr.w.aoe) this.explode(pos.x, pos.z, pr.w.aoe, pr.dmg);
          m.position.copy(prev);
          stop = true;
        }
        if (stop || pr.life <= 0) this.killProjectile(i, true);
      } else {
        const p = this.player;
        if (Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) < p.radius + 0.3 && pos.y < 2.2 && pos.y > 0) {
          this.damagePlayer(pr.dmg, null);
          if (pr.status) p.applyStatus(pr.status, 2.5);
          this.killProjectile(i, false);
          continue;
        }
        if (pointBlocked(pos.x, pos.z, this.floor) || pos.y < 0.05 || pr.life <= 0) this.killProjectile(i, false);
      }
    }
  }

  killProjectile(i, drop) {
    const pr = this.projectiles[i];
    this.scene.remove(pr.mesh);
    this.projectiles.splice(i, 1);
    if (drop && pr.owner === 'player' && pr.w.retrieve) {
      const pos = pr.mesh.position.clone();
      // 벽 안쪽으로 떨어지지 않게 조금씩 되돌린다
      const back = pr.vel.clone().setY(0).normalize().multiplyScalar(-0.3);
      for (let k = 0; k < 12 && pointBlocked(pos.x, pos.z, this.floor); k++) pos.add(back);
      if (!pointBlocked(pos.x, pos.z, this.floor)) this.spawnPickup({ item: pr.w.item, n: 1, label: pr.w.item, thrown: true }, pos.x, pos.z);
    }
  }

  explode(x, z, r, dmg) {
    this.audio.sfx('explode', 0.8);
    this.shake(0.35);
    this.spawnBurst(x, z, 'blast', r);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.pos.x - x, e.pos.z - z) < r + e.radius * 0.6 && e.pos.y < 4) e.takeDamage(dmg, { ranged: true, knock: 0.6 });
    }
  }

  damagePlayer(amount, src, opts = {}) {
    const p = this.player;
    if (p.hp <= 0 || this.cinematic || this.god) return;
    if (p.invuln > 0 && !opts.reflected) return;
    const d = derive(this.state);
    if (!opts.reflected && Math.random() < d.evasion) {
      this.floatText(p.pos.x, 2.4, '회피', '#bfe8c8', p.pos.z);
      return;
    }
    const dmg = Math.max(1, Math.round(amount));
    p.hp -= dmg;
    p.lastHurt = 0;
    this.floatText(p.pos.x, 2.3, '-' + dmg, '#ff8a6a', p.pos.z);
    this.audio.sfx('hurt', 0.6);
    this.ui.hurtFlash();
    this.shake(0.18);
    if (this.crafting && this.crafting.recipe.station) this.cancelCraft('공격을 받아 제작이 멈췄다');
    if (p.hp <= 0) { p.hp = 0; this.onPlayerDeath(); }
  }

  floatText(x, y, text, color, z) {
    // z 를 생략하면 플레이어나 적의 z 를 추정하지 않고 x 만 쓰면 안 되므로, 호출부에서 z 가 없을 때는 플레이어 위치 사용
    this.ui.floatText(x, y, z ?? this._ftz(x), text, color);
  }
  _ftz(x) {
    // 가장 가까운 개체의 z 를 찾는다 (x 만 받은 호출 보정)
    let best = this.player.pos.z, bd = Math.abs(this.player.pos.x - x);
    for (const e of this.enemies) { const d = Math.abs(e.pos.x - x); if (d < bd) { bd = d; best = e.pos.z; } }
    return best;
  }

  // ============================================================ 처치 · 보상
  onEnemyKilled(e) {
    const st = this.state;
    const coef = floorCoef(st.floor);
    if (e.tag === 'heart') { this.roomCleared(); return; }
    if (e.tag === 'hive') { this.ui.toast('벌집이 무너졌다', 'good'); this.audio.sfx('heart_break', 0.7); }
    if (e.tag === 'room' && this.roomRun) this.roomRun.killed++;
    const d = derive(st);
    if (e.xp > 0) {
      const ups = addXp(st, Math.round(e.xp * (1 + d.researchers * 0.05)));
      if (ups > 0) {
        this.audio.sfx('levelup', 0.8);
        this.ui.toast(`레벨 ${st.level}! 스탯 포인트 +${ups * 2} · K 키`, 'gold');
        this.player.hp = Math.min(derive(st).maxHp, this.player.hp + derive(st).maxHp * 0.3);
      }
    }
    if (e.gold > 0) {
      st.gold += e.gold;
      this.ui.floatText(e.pos.x, e.centerY + 1.2, e.pos.z, `+${e.gold} G`, '#f2b33d');
    }
    if (!e.isBoss && !e.isClone && e.tag !== 'hive' && Math.random() < 0.38) {
      const table = materialTable(st.floor);
      const m = table[Math.floor(Math.random() * table.length)];
      addItem(st, m, 1);
      this.ui.floatText(e.pos.x, e.centerY + 0.4, e.pos.z, `+ ${m}`, '#c8e0b0');
    }
    this.audio.sfx('enemy_hit', 0.6);
    // 특수 처치 효과
    if (e.def.bloom) {
      const x = e.pos.x, z = e.pos.z, atk = e.atk;
      this.telegraph(x, z, 2.6, 0.6, 0xe07aa8, () => {
        this.spawnBurst(x, z, 'pollen', 2.6);
        if (Math.hypot(this.player.pos.x - x, this.player.pos.z - z) < 2.6 + this.player.radius) {
          this.damagePlayer(atk * 1.2, null);
          this.player.applyStatus('spore', 2);
        }
      });
    }
    if (e.def.ai === 'splitter' && e.type === 'host') {
      for (let i = 0; i < 2; i++) this.spawnEnemy('hostling', e.pos.x + (i ? 1 : -1), e.pos.z, { tag: e.tag === 'minion' ? 'minion' : e.tag, owner: e.owner });
    }
    if (e.isBoss) this.onBossKilled(e);
  }

  async onPlayerDeath() {
    if (this.dyingNow) return;
    this.dyingNow = true;
    const st = this.state;
    st.deaths++;
    this.audio.sfx('death', 0.9);
    this.clearInput();
    this.setPaused(true, 'death');
    await sleep(700);
    await this.fadeTo(1, 600);
    const fs = st.floors[st.floor];
    if (this.roomRun) {
      // 감염된 방: 잃는 것 없음
      const left = Math.max(0, this.roomRun.total - this.roomRun.killed);
      this.endRoomRun();
      fs.room.count = left;
      this.player.pos.set(HW - 3, 0, DOOR.z);
      this.ui.toast('감염된 방에서 쓰러졌다. 잃은 것은 없다.', 'warn');
    } else {
      const lostGold = Math.floor(st.gold * 0.5);
      st.gold -= lostGold;
      let lostItems = 0;
      for (const k of Object.keys(st.items)) {
        const lose = Math.floor(st.items[k] * 0.5);
        lostItems += lose;
        addItem(st, k, -lose);
      }
      const boss = this.activeBoss();
      if (boss || this.bossActive) {
        st.mentalDelta += MENTAL.bossLose;
        for (const e of this.enemies) if (e.isBoss || e.tag === 'minion' || e.tag === 'hive' || e.tag === 'clone') { e.alive = false; e.remove(); }
        this.enemies = this.enemies.filter((e) => e.alive);
        this.bossPending = true;
        this.bossActive = false;
        this.twinTimer = null;
        this.ui.toast('보스에게 졌다. 멘탈 −3', 'warn');
      }
      this.player.pos.copy(this.floor.spawnFromBelow);
      this.ui.toast(`쓰러졌다. 돈 ${lostGold} G와 아이템 ${lostItems}개를 잃었다.`, 'warn');
    }
    for (const pr of this.projectiles) this.scene.remove(pr.mesh);
    this.projectiles = [];
    for (const t of this.telegraphs) this.scene.remove(t.mesh);
    this.telegraphs = [];
    for (const z of this.zones) this.scene.remove(z.mesh);
    this.zones = [];
    this.timers = [];
    this.crafting = null;
    this.player.resetVitals();
    this.player.invuln = 2;
    this.updateBgm();
    save(st);
    await this.fadeTo(0, 500);
    this.setPaused(false, 'death');
    this.dyingNow = false;
  }

  // ============================================================ 보스
  activeBoss() { return this.enemies.find((e) => e.isBoss && e.alive); }
  countMinions(boss) { return this.enemies.filter((e) => e.alive && e.owner === boss.id).length; }
  countTag(tag) { return this.enemies.filter((e) => e.alive && e.tag === tag).length; }
  healMinions(boss, frac) {
    for (const e of this.enemies) if (e.alive && e.owner === boss.id) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * frac);
  }

  updateBoss(dt) {
    const st = this.state;
    const f = st.floor;
    if (this.bossPending && !this.cinematic) {
      const p = this.player.pos;
      if (Math.hypot(p.x - BOSS_POS.x, p.z - BOSS_POS.z) < 15 || f === 1) this.activateBoss();
    }
    const boss = this.activeBoss();
    if (!boss) return;
    if (boss.bossDef.patterns.includes('hive')) boss.invulnerable = this.countTag('hive') > 0;
    // 쌍둥이 되살아남
    if (this.twinTimer) {
      this.twinTimer.t -= dt;
      if (this.twinTimer.t <= 0) {
        const t = this.twinTimer;
        this.twinTimer = null;
        if (this.activeBoss()) {
          const e = this.spawnEnemy('boss', t.x, t.z, { boss: BOSSES[f], tag: 'boss' });
          if (e) { e.hp = Math.round(e.maxHp * 0.5); e.isTwin = true; }
          this.ui.toast('쌍둥이가 덩굴로 다시 이어졌다. 둘을 함께 쓰러뜨려야 한다!', 'warn');
        }
      }
    }
    // 아버지의 말
    if (boss.bossDef.final && boss.hp / boss.maxHp <= 0.25) {
      this.fatherT = (this.fatherT ?? 1) - dt;
      if (this.fatherT <= 0) {
        this.fatherT = 6;
        const line = FATHER_LINES[(this.fatherIdx = ((this.fatherIdx ?? -1) + 1) % FATHER_LINES.length)];
        this.ui.toast(line, 'big');
        if (!st.flags.fatherVoice) { st.flags.fatherVoice = true; this.after(2.2, () => this.ui.toast('…이 목소리, 어디서…?', '')); }
      }
    }
  }

  activateBoss() {
    const st = this.state;
    const f = st.floor;
    const def = BOSSES[f];
    this.bossPending = false;
    this.bossActive = true;
    const b = this.spawnEnemy('boss', BOSS_POS.x, BOSS_POS.z, { boss: def, tag: 'boss' });
    if (def.twin) {
      b.pos.x -= 3;
      const b2 = this.spawnEnemy('boss', BOSS_POS.x + 3, BOSS_POS.z, { boss: def, tag: 'boss' });
      if (b2) b2.isTwin = true;
      b.isTwin = true;
    }
    if (def.patterns.includes('hive')) {
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2 + 0.5;
        const x = BOSS_POS.x + Math.cos(a) * 9, z = BOSS_POS.z + Math.sin(a) * 7;
        const hive = makeHive();
        hive.position.set(x, 0, z);
        this.spawnEnemy('hive', x, z, { tag: 'hive', rigObject: hive, ownsRig: true, height: 2, radius: 0.8,
          def: { name: '벌집', ai: 'static', speed: 0, size: 1 }, hp: Math.round(def.hp * 0.06), xp: 40, gold: 30 });
      }
    }
    this.audio.sfx('boss_roar', 0.9);
    this.ui.toast(def.final ? '…' : def.name, 'big');
    this.updateBgm();
    if (f === 90 && !st.flags.airHint) { st.flags.airHint = true; this.ui.playScene(SCENES.airHint); }
  }

  onBossKilled(e) {
    const st = this.state;
    const f = st.floor;
    const def = e.bossDef;
    if (def.twin) {
      const other = this.enemies.find((x) => x !== e && x.isBoss && x.alive);
      if (other) { this.twinTimer = { t: 6, x: e.pos.x, z: e.pos.z }; this.ui.toast('6초 안에 나머지 하나도 쓰러뜨려라!', 'warn'); return; }
      this.twinTimer = null;
    }
    const fs = st.floors[f];
    fs.bossDefeated = true;
    this.bossActive = false;
    st.mentalDelta += MENTAL.bossKill;
    for (const m of this.enemies) if (m.alive && (m.tag === 'minion' || m.tag === 'clone' || m.tag === 'hive')) m.die();
    if (def.final) { this.finalSequence(e); return; }
    this.ui.toast(`${def.name} 처치 · 계단이 열렸다 · 멘탈 +3`, 'good');
    if (BOSS_MINIONS[f]) {
      const bm = BOSS_MINIONS[f];
      this.after(0.8, () => {
        this.audio.sfx('alarm', 0.6);
        this.ui.toast(`잔몹 ${bm.n}마리가 몰려나온다!`, 'warn');
        for (let i = 0; i < bm.n; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 6 + Math.random() * 6;
          this.spawnEnemy(bm.list[i % bm.list.length], BOSS_POS.x + Math.cos(a) * r, BOSS_POS.z + Math.sin(a) * r, { tag: 'floor' });
        }
      });
    }
    if (f === 70 && !st.flags.b70after) { st.flags.b70after = true; this.after(1.2, () => this.ui.playScene(SCENES.b70after)); }
    if (f === 5 && !st.flags.damagedLog) {
      st.flags.damagedLog = true;
      this.after(1.0, () => {
        this.ui.toast('손상된 연구 일지를 주웠다 · J 키', 'gold');
        this.ui.openPanel(DAMAGED_LOG.title, null, (body) => {
          const d = document.createElement('div'); d.className = 'rec'; d.textContent = DAMAGED_LOG.text; body.appendChild(d);
        });
      });
    }
    this.updateBgm();
    save(st);
  }

  async finalSequence(father) {
    const st = this.state;
    this.cinematic = true;
    this.clearInput();
    this.ui.prompt(null);
    this.ui.showHud(false);
    for (const pr of this.projectiles) this.scene.remove(pr.mesh);
    this.projectiles = [];
    this.audio.stopBgm(2.5);
    this.camFocus = { x: father.pos.x, y: 1.0, z: father.pos.z };
    const spot = new THREE.PointLight(0xffe2b8, 40, 12, 1.6);
    spot.position.set(father.pos.x, 3.2, father.pos.z + 2.5);
    this.scene.add(spot);
    await sleep(1800);
    // 덩굴이 시든다
    const inf = father.rig.infection;
    if (inf) await new Promise((res) => this.tween(2.4, (k) => { inf.scale.setScalar(1 - k); inf.position.y = -k * 0.4; }, res));
    await sleep(600);
    await this.ui.playScene(SCENES.reveal);
    st.flags.revealed = true;
    const choice = await this.ui.openEndingChoice();
    this.audio.playBgm('ending', 2.5);
    this.ui.showHud(false);
    await this.ui.playEnding(ENDINGS[choice]);
    st.endings.push(choice);
    st.flags.cleared = true;
    this.camFocus = null;
    this.scene.remove(spot);
    this.ui.showHud(true);
    await this.quitToTitle();
  }

  // ============================================================ 감염된 방
  updateRooms(dt) {
    const st = this.state;
    const seal = st.town.started ? st.town.bld.seal : 0;
    const fillMul = 1 - Math.min(0.6, 0.15 * seal);
    for (const [fk, fs] of Object.entries(st.floors)) {
      if (!fs.room) continue;
      const f = +fk;
      if (f === st.floor && this.roomRun) continue;
      const tier = roomTier(f);
      fs.room.count += (dt / tier.interval) * fillMul;
      if (fs.room.count >= tier.max) this.roomOverflow(f, fs, tier);
    }
    if (!this.floor.room) return;
    const p = this.player.pos;
    const door = this.floor.room.doorBox;
    if (this.roomPhase === 'open' && p.x > HW + 1.2) this.startRoomFight();
    if (this.roomPhase === 'cleared' && p.x < HW - 1.2) { door.open = false; this.roomPhase = 'idle'; this.audio.sfx('door', 0.6); }
    if (this.roomRun) this.updateRoomFight(dt);
  }

  roomOverflow(f, fs, tier) {
    const out = tier.max * ROOM_OVERFLOW_OUT;
    fs.room.count = tier.max * ROOM_AFTER_OVERFLOW;
    fs.cleared = false;
    if (f === this.state.floor) {
      const n = this.spawnOverflow(out);
      this.audio.sfx('alarm', 0.8);
      this.ui.toast(`감염된 방이 넘쳤다! 잔몹 ${n}마리가 쏟아져 나온다`, 'warn');
    } else {
      fs.room.pending = Math.min(tier.max, (fs.room.pending || 0) + out);
      const now = this.state.playTime;
      if (Math.abs(f - this.state.floor) <= 6 && (!this.lastFarToast || now - this.lastFarToast > 25)) {
        this.lastFarToast = now;
        this.ui.toast(`B${f} 감염된 방이 넘쳐 잔몹이 층에 쏟아졌다`, 'warn');
      }
    }
  }

  enterRoomDoor() {
    const st = this.state;
    const tier = roomTier(st.floor);
    if (this.roomPhase !== 'idle') return;
    if (st.gold < tier.fee) { this.ui.toast(`입장료 ${tier.fee} G가 필요하다`, 'warn'); return; }
    st.gold -= tier.fee;
    this.floor.room.doorBox.open = true;
    this.roomPhase = 'open';
    this.audio.sfx('door', 0.8);
    this.ui.toast(`입장료 ${tier.fee} G · 안에 들어가면 문이 잠긴다`, 'gold');
  }

  startRoomFight() {
    const st = this.state;
    const fs = st.floors[st.floor];
    const tier = roomTier(st.floor);
    this.roomPhase = 'fight';
    this.floor.room.doorBox.open = false;
    this.audio.sfx('door', 0.9);
    const total = Math.floor(fs.room.count);
    const sizes = [];
    for (let i = 0; i < tier.waves; i++) sizes.push(Math.floor(total / tier.waves) + (i < total % tier.waves ? 1 : 0));
    this.roomRun = { total, killed: 0, wave: 0, waves: tier.waves, sizes, wait: 1.2 };
    const hp = Math.round(220 * floorCoef(st.floor));
    const heartObj = this.floor.room.heart;
    this.roomHeart = this.spawnEnemy('heart', heartObj.position.x, heartObj.position.z, {
      tag: 'heart', rigObject: heartObj, height: 2.6, radius: 1.0, def: { name: '포자 심장', ai: 'static', speed: 0, size: 1 }, hp, xp: 0, gold: 0,
    });
    this.roomHeart.invulnerable = true;
    this.ui.toast(`잔몹 ${total}마리 · 웨이브 ${tier.waves}개`, 'warn');
    this.updateBgm();
  }

  updateRoomFight(dt) {
    const run = this.roomRun;
    const alive = this.enemies.filter((e) => e.alive && e.tag === 'room').length;
    if (alive > 0) return;
    if (run.wave < run.waves) {
      run.wait -= dt;
      if (run.wait > 0) return;
      run.wait = 1.0;
      const n = run.sizes[run.wave];
      run.wave++;
      const types = monstersForFloor(this.state.floor);
      for (let i = 0; i < n; i++) {
        const t = types[Math.floor(Math.random() * types.length)];
        this.spawnEnemy(t, ROOM.minX + 3 + Math.random() * (ROOM.maxX - ROOM.minX - 6), ROOM.minZ + 1.5 + Math.random() * (ROOM.maxZ - ROOM.minZ - 3), { tag: 'room' });
      }
      if (n > 0) this.ui.toast(`웨이브 ${run.wave} / ${run.waves}`, '');
    } else if (this.roomHeart && this.roomHeart.invulnerable) {
      this.roomHeart.invulnerable = false;
      this.ui.toast('포자 심장이 드러났다. 부숴라!', 'gold');
    }
  }

  roomCleared() {
    const st = this.state;
    const fs = st.floors[st.floor];
    const run = this.roomRun;
    const coef = floorCoef(st.floor);
    const gold = Math.round((run.killed * 3 + 20) * coef * BALANCE.gold);
    const xp = Math.round(run.killed * 2 * coef);
    st.gold += gold;
    const ups = addXp(st, xp);
    if (ups) { this.audio.sfx('levelup', 0.8); this.ui.toast(`레벨 ${st.level}! 스탯 포인트 +${ups * 2}`, 'gold'); }
    fs.room.count = 0;
    this.audio.sfx('heart_break', 0.9);
    this.shake(0.4);
    this.spawnBurst(this.floor.room.heart.position.x, 0, 'pollen', 3);
    this.ui.toast(`포자 심장을 부쉈다 · ${gold} G · 경험치 ${xp}`, 'good');
    this.roomRun = null;
    this.roomHeart = null;
    this.roomPhase = 'cleared';
    this.floor.room.doorBox.open = true;
    this.audio.sfx('door', 0.6);
    this.updateBgm();
    save(st);
  }

  endRoomRun() {
    for (const e of this.enemies) if (e.tag === 'room' || e.tag === 'heart') { if (e.tag !== 'heart') e.remove(); e.alive = false; }
    this.enemies = this.enemies.filter((e) => e.alive);
    this.roomRun = null;
    this.roomHeart = null;
    this.roomPhase = 'idle';
    if (this.floor.room) this.floor.room.doorBox.open = false;
  }

  roomHeartActive() { return !!(this.roomRun && this.roomHeart && inRoomArea(this.player.pos)); }

  // ============================================================ 층 이동
  stairsLocked() {
    const st = this.state;
    const fs = st.floors[st.floor];
    if (isBossFloor(st.floor) && fs && !fs.bossDefeated) return '보스를 쓰러뜨려야 계단이 열린다';
    if (this.blockUntil && st.playTime < this.blockUntil) return this.blockReason + ` (${Math.ceil(this.blockUntil - st.playTime)}초)`;
    if (this.roomRun) return '감염된 방이 잠겨 있다';
    return null;
  }

  async ascend(skipChecks = false) {
    const st = this.state;
    if (st.floor <= 1 && !st.floors[1]?.bossDefeated) return;
    const lock = this.stairsLocked();
    if (lock && !skipChecks) { this.ui.toast(lock, 'warn'); return; }
    if (st.floor === 1) return;
    if (!skipChecks) {
      // 주민의 '다정한 방해'
      if (st.town.started && st.floor <= 67 && st.residents.length) {
        const avg = st.residents.reduce((a, r) => a + r.loyalty, 0) / st.residents.length;
        if (Math.random() < 0.12 * avg) {
          const [who, text] = OBSTRUCT_LINES[Math.floor(Math.random() * OBSTRUCT_LINES.length)];
          const speaker = st.residents.find((r) => r.name === who) ? who : st.residents[Math.floor(Math.random() * st.residents.length)].name;
          this.blockUntil = st.playTime + 12;
          this.blockReason = '주민이 길을 막고 있다';
          await this.ui.playScene([{ who: speaker, text }]);
          return;
        }
      }
      // 포기 판정
      const d = derive(st);
      const prob = 0.0001 + 0.0099 * progressOf(st.floor) * (1 - d.mental / 99);
      if (Math.random() < prob) { await this.giveUp(); return; }
    }
    const nf = st.floor - 1;
    let newReach = false;
    if (nf < st.maxReached) { st.maxReached = nf; newReach = true; }
    await this.enterFloor(nf, 'below');
    if (newReach) this.ui.toast('새로운 층 · 생존력·손기술·멘탈 +1', 'good');
  }

  async descend() {
    const st = this.state;
    if (st.floor >= 100) return;
    if (this.roomRun) return;
    const nf = st.floor + 1;
    const fs = floorState(st, nf);
    let reinf = false;
    if (fs.cleared && Math.random() < REINFECT_CHANCE) {
      fs.reinfected = true;
      fs.cleared = false;
      st.mentalDelta += MENTAL.reinfect;
      reinf = true;
    }
    await this.enterFloor(nf, 'above');
    if (reinf) { this.audio.sfx('alarm', 0.7); this.ui.toast(`B${nf}이 다시 감염됐다! 멘탈 −2`, 'warn'); }
  }

  async giveUp() {
    const st = this.state;
    const d = derive(st);
    const prog = progressOf(st.floor);
    const vault = st.town.started ? Math.min(0.5, st.town.bld.vault * 0.1) : 0;
    const lostGold = Math.round(st.gold * (0.1 + prog * 0.2) * (1 - vault));
    st.gold -= lostGold;
    const mats = MATERIALS.filter((m) => itemCount(st, m) > 0).sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2));
    const lostMats = {};
    for (const m of mats) {
      const n = Math.max(1, Math.ceil(itemCount(st, m) * 0.15));
      addItem(st, m, -n);
      lostMats[m] = n;
    }
    this.audio.sfx('giveup', 0.9);
    this.blockUntil = st.playTime + 30;
    this.blockReason = '주저앉아 있다';
    const townEra = st.town.started && st.floor <= 68;
    if (townEra) {
      st.warehouse.gold += lostGold;
      for (const [k, n] of Object.entries(lostMats)) st.warehouse.items[k] = (st.warehouse.items[k] || 0) + n;
      await this.ui.playScene([{ who: '나', text: '…더는 못 하겠어. 다리가 안 움직인다.' }, ...SCENES.giveupTown]);
      this.ui.toast(`주민들이 돈 ${lostGold} G와 재료를 가져갔다`, 'warn');
    } else {
      await this.ui.playScene([{ who: '나', text: '…더는 못 하겠어. 다리가 안 움직인다.' }]);
      this.ui.toast(`도망치다 돈 ${lostGold} G와 재료를 떨어뜨렸다`, 'warn');
    }
    this.ui.toast('30초 뒤에 다시 올라갈 수 있다', '');
    void d;
  }

  // ============================================================ 상호작용
  updatePrompt() {
    const it = this.nearestInteract();
    this.currentInteract = it;
    this.ui.prompt(it ? `<kbd>E</kbd> ${it.label}` : null);
    if (it && it.kind === 'door' && !this.state.flags.firstRoom) {
      this.state.flags.firstRoom = true;
      this.ui.playScene(SCENES.firstRoom);
    }
  }

  nearestInteract() {
    const st = this.state;
    const p = this.player.pos;
    const f = this.floor;
    const cands = [];
    const near = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
    if (near(f.stairsPos.x, f.stairsPos.z, 2.8)) {
      const lock = this.stairsLocked();
      if (st.floor === 1) cands.push({ kind: 'none', label: '계단 위는 무너져 있다', x: f.stairsPos.x, z: f.stairsPos.z });
      else cands.push({ kind: 'up', label: lock ? lock : `위층으로 · B${st.floor - 1}`, x: f.stairsPos.x, z: f.stairsPos.z });
    }
    if (f.hatch && near(f.hatchPos.x, f.hatchPos.z, 2.2)) cands.push({ kind: 'down', label: `아래층으로 · B${st.floor + 1} (지나온 층은 7.5% 확률로 다시 감염)`, ...f.hatchPos });
    const sp = f.special;
    if (sp.terminal && near(sp.terminal.x, sp.terminal.z, 2.2)) cands.push({ kind: 'terminal', label: '보급 단말기 · 상점과 휴식', ...sp.terminal });
    if (sp.workbench && near(sp.workbench.x, sp.workbench.z, 2.4)) cands.push({ kind: 'bench', label: '작업대 · 제작', ...sp.workbench });
    if (sp.forge && near(sp.forge.x, sp.forge.z, 2.4)) cands.push({ kind: 'bench', label: '화로와 모루 · 제작', ...sp.forge });
    if (sp.display && near(sp.display.x, sp.display.z, 2.2)) cands.push({ kind: 'display', label: '전시실 상점', ...sp.display });
    if (sp.recorder && near(sp.recorder.x, sp.recorder.z, 2.2)) cands.push({ kind: 'rec', label: st.heard[st.floor] ? '녹음 다시 듣기 (멘탈 −1)' : '녹음 듣기 (멘탈 −1)', ...sp.recorder });
    if (sp.warehouse && near(sp.warehouse.x, sp.warehouse.z, 2.4) && !st.flags.warehouse) cands.push({ kind: 'warehouse', label: '창고 열기', ...sp.warehouse });
    if (f.room && this.roomPhase === 'idle' && near(HW - 1.2, DOOR.z, 3.2)) {
      const tier = roomTier(st.floor);
      cands.push({ kind: 'door', label: `감염된 방 입장 · 입장료 ${tier.fee} G · 웨이브 ${tier.waves}개`, x: HW - 1, z: DOOR.z });
    }
    for (const n of this.npcs) if (near(n.pos.x, n.pos.z, 2.4)) cands.push({ kind: 'npc', label: '생존자와 이야기하기', npc: n, x: n.pos.x, z: n.pos.z });
    if (!cands.length) return null;
    cands.sort((a, b) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(p.x - b.x, p.z - b.z));
    return cands[0];
  }

  interact() {
    const it = this.currentInteract;
    if (!it || this.paused) return;
    const st = this.state;
    switch (it.kind) {
      case 'up': this.ascend(); break;
      case 'down': this.descend(); break;
      case 'terminal':
        if (!st.flags.firstTerminal) {
          st.flags.firstTerminal = true;
          this.ui.playScene(SCENES.firstTerminal).then(() => this.ui.openShop('terminal'));
        } else this.ui.openShop('terminal');
        break;
      case 'bench': this.ui.openInventory('craft'); break;
      case 'display': this.ui.openShop('display'); break;
      case 'rec': this.playRecording(recordingByFloor[st.floor]); break;
      case 'warehouse': this.openWarehouse(); break;
      case 'door': this.enterRoomDoor(); break;
      case 'npc': this.ui.openRecruit(it.npc.cand); break;
      default: break;
    }
  }

  playRecording(rec) {
    const st = this.state;
    st.mentalDelta += MENTAL.recording;
    st.heard[rec.floor] = true;
    const d = derive(st);
    const reveal = Math.max(0, Math.min(0.98, 0.15 + (d.mental / 99) * 0.7 + d.researchers * 0.06));
    this.audio.sfx('rec_static', 0.8);
    this.ui.openRecording(rec, reveal);
  }

  async openWarehouse() {
    const st = this.state;
    st.flags.warehouse = true;
    const w = st.warehouse;
    const hasAny = w.gold > 0 || Object.keys(w.items).length > 0;
    if (hasAny) {
      await this.ui.playScene(SCENES.warehouse);
      st.gold += w.gold;
      for (const [k, n] of Object.entries(w.items)) addItem(st, k, n);
      this.ui.toast(`돌려받았다 · ${w.gold} G와 재료 ${Object.values(w.items).reduce((a, b) => a + b, 0)}개`, 'gold');
      st.warehouse = { gold: 0, items: {} };
    } else {
      await this.ui.playScene([
        { who: '나', text: '창고 문에… 내 이름이 적혀 있다.' },
        { who: '나', text: '안에는 붕대와 복숭아 통조림이 가지런히 쌓여 있다. 누군가 나를 위해 남겨둔 것처럼.' },
        { who: '나', text: '어쩌면 이 사람들은 적이 아니었을지도.' },
        { who: '나', text: '그래도, 날 가둔 놈은 저 위에 있다.' },
      ]);
    }
    addItem(st, '붕대', 3);
    addItem(st, '통조림', 3);
    save(st);
  }

  // ============================================================ 줍기 · NPC
  spawnPickup(pk, x, z) {
    const g = new THREE.Group();
    let item;
    if (pk.melee) {
      item = makeWeapon(meleeById[pk.melee].model);
      item.rotation.z = Math.PI / 2;
      item.position.y = 0.25;
    } else if (pk.gun) {
      item = new THREE.Group();
      item.add(mesh(G.box, M.metalDark, 0.12, 0.14, pk.gun === 'rifle' ? 1.1 : 0.4, 0, 0.25, 0));
      item.add(mesh(G.box, M.wood, 0.1, 0.22, 0.12, 0, 0.12, -0.1));
    } else {
      const r = Object.values(rangedById).find((w) => w.item === pk.item);
      item = makeProjectile(r ? r.model : 'stone');
      item.position.y = 0.3;
    }
    g.add(item);
    if (!pk.thrown) g.add(makePickupGlint());
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.pickups.push({ ...pk, pos: new THREE.Vector3(x, 0, z), mesh: g, item, t: Math.random() * 6 });
  }

  updatePickups(dt) {
    const st = this.state;
    const p = this.player.pos;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.t += dt;
      pk.item.rotation.y += dt * 1.4;
      if (!pk.thrown) pk.item.position.y = 0.3 + Math.sin(pk.t * 2.5) * 0.08;
      if (Math.hypot(pk.pos.x - p.x, pk.pos.z - p.z) > 1.3) continue;
      this.scene.remove(pk.mesh);
      this.pickups.splice(i, 1);
      this.audio.sfx('pickup', 0.7);
      if (pk.key) st.floors[st.floor].taken.push(pk.key);
      if (pk.melee) {
        if (!st.melee.includes(pk.melee)) st.melee.push(pk.melee);
        const w = meleeById[pk.melee];
        if (w.atk > equippedMelee(st).atk && !(w.str && st.stats.str < w.str)) st.meleeEq = w.id;
        this.ui.toast(`새 무기 · ${w.name} (공격력 ${w.atk})`, 'gold');
        if (pk.melee === 'tumbler') this.ui.playScene(SCENES.tumbler);
      } else if (pk.gun) {
        if (!st.guns.includes(pk.gun)) st.guns.push(pk.gun);
        st.rangedEq = pk.gun;
        this.ui.toast(`새 무기 · ${rangedById[pk.gun].name}`, 'gold');
      } else {
        addItem(st, pk.item, pk.n || 1);
        if (!pk.thrown) this.ui.toast(`${pk.label} ${pk.n}개를 주웠다`, 'gold');
        if (pk.item === '야구공' && !st.flags.baseball) { st.flags.baseball = true; this.ui.playScene(SCENES.baseball); }
      }
    }
  }

  spawnSurvivor() {
    const st = this.state;
    const sp = this.floor.special.survivor;
    const cand = this.makeCandidate(st.floor);
    const rig = buildCharacter('survivor', { color: [0x6a7a5a, 0x5a6a7a, 0x7a6a5a, 0x6a5a7a][st.floor % 4] });
    rig.root.position.set(sp.x, 0, sp.z);
    this.scene.add(rig.root);
    const shadow = makeBlobShadow(0.5);
    shadow.position.set(sp.x, 0.02, sp.z);
    this.scene.add(shadow);
    circlesPush(this.floor, sp.x, sp.z);
    this.npcs.push({ pos: new THREE.Vector3(sp.x, 0, sp.z), rig, shadow, cand, label: cand.name, t: 0 });
  }

  makeCandidate(f) {
    const st = this.state;
    const rnd = mulberry32(f * 131 + 7);
    const used = new Set(st.residents.map((r) => r.name));
    const pool = RESIDENT_NAMES.filter((n) => !used.has(n));
    const name = pool[Math.floor(rnd() * pool.length)] || '이름 모를 사람';
    const byFreq = (fr) => Object.keys(JOBS).filter((k) => JOBS[k].freq === fr);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const roll = rnd();
    const first = roll < 0.18 ? pick(byFreq('rare')) : roll < 0.55 ? pick(byFreq('normal')) : pick(byFreq('common'));
    let second;
    if (JOBS[first].freq === 'rare') second = pick(byFreq('common'));
    else do { second = pick(Object.keys(JOBS).filter((k) => JOBS[k].freq !== 'rare')); } while (second === first);
    return { name, jobs: [first, second] };
  }

  updateNpcs(dt) {
    for (const n of this.npcs) {
      n.t += dt;
      const p = this.player.pos;
      n.rig.root.rotation.y = Math.atan2(p.x - n.pos.x, p.z - n.pos.z);
      n.rig.armR.rotation.x = Math.sin(n.t * 2) * 0.3 - 0.4;
      n.rig.body.position.y = Math.sin(n.t * 1.6) * 0.02;
    }
  }
  removeNpc() {
    for (const n of this.npcs) { this.scene.remove(n.rig.root); this.scene.remove(n.shadow); }
    this.npcs = [];
    const sp = this.floor.special.survivor;
    if (sp) this.floor.circles = this.floor.circles.filter((c) => !(c.x === sp.x && c.z === sp.z));
  }

  recruit(cand, replaceIdx) {
    const st = this.state;
    if (replaceIdx >= 0) {
      const gone = st.residents.splice(replaceIdx, 1)[0];
      this.ui.toast(`${gone.name}이(가) 다른 길로 떠났다`, '');
    }
    st.residents.push({ name: cand.name, jobs: cand.jobs, work: cand.jobs[0], loyalty: 0.5 + Math.random() * 0.5 });
    st.floors[st.floor].survivorDone = true;
    this.removeNpc();
    this.ui.toast(`${cand.name}이(가) 함께하게 됐다 · ${JOBS[cand.jobs[0]].name}`, 'good');
    save(st);
  }
  declineSurvivor() {
    this.state.floors[this.state.floor].survivorDone = true;
    this.removeNpc();
  }

  async meetResidents() {
    const st = this.state;
    st.flags.meet = true;
    await this.ui.playScene(SCENES.meet);
    st.town.started = true;
    st.residents = START_RESIDENTS.map((r) => ({ ...r, jobs: [...r.jobs], loyalty: 0.55 + Math.random() * 0.45 }));
    this.ui.toast('주민 5명이 함께하게 됐다 · T 키로 도시를 관리한다', 'good');
    this.ui.toast('산소를 만드는 사람이 없다. 서유진에게 환기공 일을 맡겨볼까?', '');
    save(st);
  }

  // ============================================================ 도시
  updateTown(dt) {
    const st = this.state;
    if (!st.town.started) return;
    this.townT = (this.townT || 0) + dt;
    if (this.townT < 8) return;
    this.townT = 0;
    const { out, use } = townRates(st);
    let short = [];
    for (const k of Object.keys(out)) {
      st.town.res[k] = Math.max(0, Math.min(999, st.town.res[k] + out[k] - use[k]));
      if (st.town.res[k] <= 0 && ['food', 'water', 'oxygen'].includes(k)) short.push(k);
    }
    if (short.length) {
      st.mentalDelta -= 1;
      if (!this.lastShortToast || st.playTime - this.lastShortToast > 30) {
        this.lastShortToast = st.playTime;
        const L = { food: '식량', water: '물', oxygen: '산소' };
        this.ui.toast(`${short.map((k) => L[k]).join('·')}이 바닥났다 · 멘탈 −1`, 'warn');
      }
    }
  }
  setJob(idx, job) { this.state.residents[idx].work = job; }
  upgradeCost(k) { const L = this.state.town.bld[k] + 1; return { build: 15 * L, gold: 60 * L }; }
  upgrade(k) {
    const st = this.state;
    const c = this.upgradeCost(k);
    if (st.town.bld[k] >= 5 || st.town.res.build < c.build || st.gold < c.gold) return;
    st.town.res.build -= c.build;
    st.gold -= c.gold;
    st.town.bld[k]++;
    this.audio.sfx('craft', 0.7);
  }
  talkCooldown() { return 60 - (this.state.playTime - this.state.cd.talk); }
  talk() {
    const st = this.state;
    if (this.talkCooldown() > 0 || !st.residents.length) return;
    st.cd.talk = st.playTime;
    st.mentalDelta += MENTAL.talk;
    const r = st.residents[Math.floor(Math.random() * st.residents.length)];
    r.loyalty = Math.max(0.1, r.loyalty - 0.03);
    const lines = ['너, 처음 봤을 때보다 얼굴이 좋아졌다.', '밥은 먹었어? 오늘은 조금 넉넉해.', '위에 뭐가 있을 것 같냐고? …글쎄. 여기도 나쁘지 않잖아.', '네 아버지 같은 사람이 있었으면 좋았을 텐데. 아, 아무것도 아냐.', '무리하지 마. 넌 아직 어려.'];
    this.ui.toast(`${r.name} · "${lines[Math.floor(Math.random() * lines.length)]}"`, 'good');
  }
  discount() {
    const st = this.state;
    if (!st.town.started || st.town.res.power <= 0) return 0;
    return Math.min(0.3, derive(st).merchants * 0.1);
  }

  // ============================================================ 상점 · 회복
  buy(it, price) {
    const st = this.state;
    if (st.gold < price) return;
    st.gold -= price;
    if (it.give.melee) {
      if (!st.melee.includes(it.give.melee)) st.melee.push(it.give.melee);
      st.meleeEq = it.give.melee;
    } else addItem(st, it.give.item, it.give.n);
    this.audio.sfx('pickup', 0.6);
    this.ui.toast(`${it.name} 구입`, 'gold');
  }
  restCooldown() { return 120 - (this.state.playTime - this.state.cd.rest); }
  rest() {
    const st = this.state;
    if (this.restCooldown() > 0) return;
    st.cd.rest = st.playTime;
    st.mentalDelta += MENTAL.rest;
    this.player.hp = derive(st).maxHp;
    this.player.sta = derive(st).maxSta;
    this.audio.sfx('heal', 0.7);
    this.ui.toast('잠깐 눈을 붙였다 · HP 회복 · 멘탈 +2', 'good');
  }
  photoCooldown() { return 180 - (this.state.playTime - this.state.cd.photo); }
  viewPhoto() {
    const st = this.state;
    if (this.photoCooldown() > 0) return;
    st.cd.photo = st.playTime;
    st.mentalDelta += MENTAL.photo;
    this.ui.toast('사진을 들여다봤다 · 멘탈 +2', 'good');
  }
  useHeal() {
    const st = this.state;
    const p = this.player;
    const d = derive(st);
    if (p.hp >= d.maxHp) { this.ui.toast('다친 곳이 없다'); return; }
    const can = itemCount(st, '통조림'), band = itemCount(st, '붕대');
    let use = null;
    if (can && (p.hp < d.maxHp * 0.5 || !band)) use = '통조림';
    else if (band) use = '붕대';
    if (!use) { this.ui.toast('회복 아이템이 없다', 'warn'); return; }
    addItem(st, use, -1);
    if (use === '통조림') { p.hp = Math.min(d.maxHp, p.hp + d.maxHp * 0.6); p.sta = d.maxSta; }
    else p.hp = Math.min(d.maxHp, p.hp + d.maxHp * 0.3);
    this.audio.sfx('heal', 0.7);
    this.floatText(p.pos.x, 2.4, use === '통조림' ? '+60%' : '+30%', '#9be38a', p.pos.z);
  }

  updateRegen(dt) {
    const st = this.state;
    const p = this.player;
    if (!st.town.started || st.town.bld.clinic < 1 || p.lastHurt < 4) return;
    if (derive(st).doctors < 1) return;
    p.hp = Math.min(derive(st).maxHp, p.hp + derive(st).maxHp * 0.015 * dt);
  }

  // ============================================================ 무기 · 스탯
  allocStat(k) {
    const st = this.state;
    if (st.points <= 0) return;
    const before = derive(st);
    st.stats[k]++;
    st.points--;
    const after = derive(st);
    this.player.hp += after.maxHp - before.maxHp;
    this.player.sta += after.maxSta - before.maxSta;
    this.audio.sfx('click', 0.4);
  }
  equipMelee(id) { if (this.state.melee.includes(id)) { this.state.meleeEq = id; this.audio.sfx('click', 0.4); } }
  equipRanged(id) { this.state.rangedEq = id; this.audio.sfx('click', 0.4); }
  cycleMelee() {
    const st = this.state;
    const owned = MELEE.filter((w) => st.melee.includes(w.id));
    const i = owned.findIndex((w) => w.id === st.meleeEq);
    st.meleeEq = owned[(i + 1) % owned.length].id;
    this.ui.toast(`근접 · ${meleeById[st.meleeEq].name}`);
  }
  cycleRanged() {
    const st = this.state;
    const av = rangedAvailable(st);
    const cur = equippedRanged(st);
    const i = av.indexOf(cur);
    st.rangedEq = av[(i + 1) % av.length].id;
    this.ui.toast(`원거리 · ${rangedById[st.rangedEq].name}`);
  }

  // ============================================================ 제작
  stationAvailable(station) {
    if (!station) return true;
    const st = this.state;
    const sp = this.floor ? this.floor.special : {};
    const p = this.player.pos;
    const near = (o) => o && Math.hypot(p.x - o.x, p.z - o.z) < 4.5;
    if (station === 'workbench') return near(sp.workbench) || near(sp.forge);
    if (station === 'forge') return near(sp.forge);
    if (station === 'smithy') return st.town.started && st.town.bld.smithy >= 1 && derive(st).smiths >= 1 && st.town.res.power > 0;
    return false;
  }
  canCraft(r) {
    const st = this.state;
    if (st.maxReached > r.floor) return { ok: false, reason: '아직 모른다' };
    for (const [k, n] of Object.entries(r.need)) if (itemCount(st, k) < n) return { ok: false, reason: `${k} 부족` };
    if (st.gold < r.gold) return { ok: false, reason: '돈 부족' };
    if (!this.stationAvailable(r.station)) {
      if (r.station === 'smithy') return { ok: false, reason: '도시에 대장간을 짓고 대장장이에게 일을 맡겨야 한다' };
      return { ok: false, reason: '시설 옆에서 만들어야 한다' };
    }
    return { ok: true };
  }
  startCraft(r) {
    const st = this.state;
    if (this.crafting || !this.canCraft(r).ok) return false;
    st.gold -= r.gold;
    for (const [k, n] of Object.entries(r.need)) addItem(st, k, -n);
    const d = derive(st);
    const dur = Math.max(1, r.time * d.craftTimeMul);
    const sp = this.floor.special;
    const anchor = r.station === 'workbench' ? (sp.workbench || sp.forge) : r.station === 'forge' ? sp.forge : null;
    this.crafting = { recipe: r, t: 0, dur, anchor };
    this.audio.sfx('craft', 0.7);
    this.ui.toast(`${r.name} 만들기 시작 · ${Math.round(dur)}초${anchor ? ' · 자리를 뜨면 멈춘다' : ''}`, '');
    return true;
  }
  cancelCraft(msg) {
    const c = this.crafting;
    if (!c) return;
    const st = this.state;
    st.gold += c.recipe.gold;
    for (const [k, n] of Object.entries(c.recipe.need)) addItem(st, k, n);
    this.crafting = null;
    this.ui.toast(msg + ' · 재료를 돌려받았다', 'warn');
  }
  updateCrafting(dt) {
    const c = this.crafting;
    if (!c) return;
    const p = this.player.pos;
    if (c.anchor && Math.hypot(p.x - c.anchor.x, p.z - c.anchor.z) > 5.5) { this.cancelCraft('작업대에서 멀어져 제작이 멈췄다'); return; }
    c.t += dt;
    if (c.t < c.dur) return;
    this.crafting = null;
    const st = this.state;
    const d = derive(st);
    if (Math.random() < d.craftRate) {
      const r = c.recipe;
      if (r.out.melee) {
        if (!st.melee.includes(r.out.melee)) st.melee.push(r.out.melee);
        const w = meleeById[r.out.melee];
        if (w.atk > equippedMelee(st).atk && !(w.str && st.stats.str < w.str)) st.meleeEq = w.id;
      } else addItem(st, r.out.item, r.out.n);
      this.audio.sfx('levelup', 0.6);
      this.ui.toast(`${r.name} 완성!`, 'good');
    } else {
      for (const [k, n] of Object.entries(c.recipe.need)) addItem(st, k, Math.floor(n / 2));
      this.audio.sfx('hurt', 0.4);
      this.ui.toast(`${c.recipe.name} 제작 실패 · 재료 절반을 잃었다`, 'warn');
    }
  }

  // ============================================================ 장판 · 효과
  telegraph(x, z, r, delay, color, onFire) {
    const m = makeDecal(color, r);
    m.position.set(x, 0.06, z);
    this.scene.add(m);
    this.telegraphs.push({ mesh: m, t: 0, delay, onFire, fired: false });
  }
  updateTelegraphs(dt) {
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      t.t += dt;
      if (!t.fired) {
        const k = Math.min(1, t.t / t.delay);
        t.mesh.material.opacity = 0.25 + k * 0.65;
        if (k >= 1) { t.fired = true; t.fireAt = t.t; t.onFire && t.onFire(); }
      } else {
        const k = (t.t - t.fireAt) / 0.3;
        t.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
        if (k >= 1) { this.scene.remove(t.mesh); t.mesh.material.dispose(); this.telegraphs.splice(i, 1); }
      }
    }
  }
  addZone(x, z, r, dur, kind, dps = 0) {
    const m = makeDecal(kind === 'web' ? 0xe8e8e8 : 0x7fd060, r);
    m.material.blending = THREE.NormalBlending;
    m.position.set(x, 0.04, z);
    this.scene.add(m);
    this.zones.push({ x, z, r, dur, kind, dps, t: 0, mesh: m });
  }
  zoneAt(x, z) {
    for (const zn of this.zones) if (Math.hypot(zn.x - x, zn.z - z) < zn.r) return zn.kind;
    return null;
  }
  updateZones(dt) {
    const p = this.player;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t += dt;
      const fade = Math.min(1, z.t / 0.4) * Math.min(1, (z.dur - z.t) / 0.6);
      z.mesh.material.opacity = Math.max(0, fade) * (z.kind === 'web' ? 0.55 : 0.6);
      if (z.kind === 'poison' && Math.hypot(z.x - p.pos.x, z.z - p.pos.z) < z.r && !this.cinematic) {
        p.hurtRaw(z.dps * dt);
        p.lastHurt = 0;
      }
      if (z.t >= z.dur) { this.scene.remove(z.mesh); z.mesh.material.dispose(); this.zones.splice(i, 1); }
    }
  }
  spawnBurst(x, z, kind, r = 1.6) {
    const g = new THREE.Group();
    const n = kind === 'blast' ? 14 : 9;
    const m = kind === 'root' ? M.vineDark : kind === 'rock' ? M.rock : kind === 'pollen' ? M.flowerPink : kind === 'foam' ? M.white : M.flowerGold;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r * 0.8;
      const o = kind === 'root' ? mesh(G.cone, m, 0.18, 1.6, 0.18, Math.cos(a) * d, 0, Math.sin(a) * d) : mesh(G.sphereLo, m, 0.18, 0.18, 0.18, Math.cos(a) * d, kind === 'rock' ? 6 : 0.3, Math.sin(a) * d);
      o.userData = { vx: Math.cos(a) * (kind === 'blast' ? 6 : 2), vz: Math.sin(a) * (kind === 'blast' ? 6 : 2), vy: kind === 'rock' ? -14 : 3 + Math.random() * 3 };
      g.add(o);
    }
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.bursts.push({ obj: g, t: 0, kind });
  }
  updateBursts(dt) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      for (const o of b.obj.children) {
        const u = o.userData;
        if (b.kind === 'root') { o.position.y = Math.sin(Math.min(1, b.t / 0.5) * Math.PI) * 0.8; continue; }
        o.position.x += u.vx * dt; o.position.z += u.vz * dt; o.position.y = Math.max(0.1, o.position.y + u.vy * dt);
        u.vy -= 18 * dt;
        o.scale.multiplyScalar(1 - dt * 1.4);
      }
      if (b.t > 0.7) { this.scene.remove(b.obj); this.bursts.splice(i, 1); }
    }
  }

  // ============================================================ 환경 애니메이션
  updateAnimated(dt) {
    const st = this.state;
    const t = st.playTime;
    const dim = st.town.started && st.floor <= 68 && st.town.res.power <= 0;
    for (const a of this.floor.animated) {
      if (a.kind === 'spores') {
        const pos = a.geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          let y = pos.getY(i) + a.vel[i] * dt;
          if (y > 5.2) y = 0;
          pos.setY(i, y);
          pos.setX(i, pos.getX(i) + Math.sin(t * 0.6 + i) * 0.004);
        }
        pos.needsUpdate = true;
      } else if (a.kind === 'lamp') {
        a.t += dt;
        const flick = Math.sin(a.t * 37) > 0.995 || (Math.sin(a.t * 0.7) > 0.97 && Math.random() < 0.3) ? 0.2 : 1;
        a.light.intensity = a.base * flick * (dim ? 0.25 : 1);
      } else if (a.kind === 'heart') {
        const fs = st.floors[st.floor];
        const tier = roomTier(st.floor);
        const fill = fs && fs.room ? fs.room.count / tier.max : 0.5;
        const pulse = 1 + Math.sin(t * (3 + fill * 4)) * 0.06;
        const s = (this.roomRun ? 1 : 0.35 + 0.65 * fill) * pulse;
        a.obj.userData.core.scale.set(0.9 * s, 1.0 * s, 0.9 * s);
        a.obj.userData.shield.visible = !!(this.roomHeart && this.roomHeart.invulnerable);
      } else if (a.kind === 'led') {
        a.obj.visible = Math.sin(t * 5) > 0;
      }
    }
    // 문과 계단 신호등
    if (this.floor.room) {
      const door = this.floor.room.door;
      const target = this.floor.room.doorBox.open ? 3.9 : 0;
      door.position.y += (target - door.position.y) * Math.min(1, dt * 6);
      const col = this.roomPhase === 'fight' ? 0xff4040 : 0x9be38a;
      this.floor.room.stripe.material.emissive.setHex(col);
      this.floor.room.stripe.material.color.setHex(col);
    }
    const sig = this.floor.stairs.userData.signal;
    const locked = !!this.stairsLocked();
    sig.material.emissive.setHex(locked ? 0xff2a1a : 0xffb54a);
  }

  checkCleared() {
    const st = this.state;
    const fs = st.floors[st.floor];
    if (!fs || fs.cleared) return;
    if (this.enemies.some((e) => e.alive && (e.tag === 'floor' || e.tag === 'overflow'))) return;
    if (isBossFloor(st.floor) && !fs.bossDefeated) return;
    if (this.bossPending) return;
    fs.cleared = true;
    if (fs.reinfected) { fs.reinfected = false; this.ui.toast(`B${st.floor} 정화 완료`, 'good'); }
  }

  updateBgm() {
    const st = this.state;
    let name;
    if (this.roomRun) name = 'tension';
    else if (this.bossActive) name = st.floor === 1 ? 'father' : 'boss';
    else if (st.town.started && st.floor <= 68) name = 'town';
    else name = 'explore';
    this.audio.playBgm(name);
  }

  // ============================================================ 개발자 키 (?dev)
  devKey(code) {
    const st = this.state;
    if (code === 'F1' || code === 'PageUp') { const fs = st.floors[st.floor]; if (fs) fs.bossDefeated = true; this.bossPending = false; this.blockUntil = 0; this.ascend(true); }
    if (code === 'F2') { st.gold += 5000; for (const m of MATERIALS) addItem(st, m, 5); this.ui.toast('개발: 돈 5000 · 재료 5개씩'); }
    if (code === 'F3') { addXp(st, require0(st)); this.ui.toast('개발: 레벨 업'); }
    if (code === 'F4') { this.god = !this.god; this.ui.toast('개발: 무적 ' + (this.god ? '켬' : '끔')); }
    if (code === 'F6') { const target = Math.max(1, st.floor - 10); for (let f = st.floor; f > target; f--) floorState(st, f).bossDefeated = true; st.maxReached = Math.min(st.maxReached, target); this.enterFloor(target, 'below'); }
    if (code === 'F7') { const fs = st.floors[st.floor]; if (fs && fs.room) fs.room.count = roomTier(st.floor).max - 1; }
  }
}

function require0(st) {
  // 다음 레벨까지 필요한 경험치
  return Math.round(28 * Math.pow(st.level, 1.62)) - st.xp;
}

function circlesPush(floor, x, z) {
  floor.circles.push({ x, z, r: 0.45 });
}
