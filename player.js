// =====================================================================
//  플레이어 (15살 주인공)
// =====================================================================
import * as THREE from '../lib/three.module.js';
import { buildCharacter, makeWeapon, makeBlobShadow } from './models.js';
import { SPEED, baseballAtk, rangedById } from './data.js';
import { derive, equippedMelee, equippedRanged, rangedAmmo, addItem } from './state.js';
import { resolveCircle } from './world.js';

const BASE_SPEED = 5.4;

export class Player {
  constructor(game) {
    this.game = game;
    this.rig = buildCharacter('player');
    this.root = this.rig.root;
    this.pos = new THREE.Vector3();
    this.radius = 0.42;
    this.facing = Math.PI;
    this.hp = 100;
    this.sta = 100;
    this.meleeCd = 0;
    this.rangedCd = 0;
    this.staIdle = 0;
    this.dash = 0;
    this.dashDir = new THREE.Vector3();
    this.invuln = 0;
    this.swingT = 0;
    this.throwT = 0;
    this.walkT = 0;
    this.lastHurt = 0;
    this.status = { spore: 0, sleep: 0, grab: 0, blind: 0 };
    this.weaponModel = null;
    this.weaponId = null;
    this.shadow = makeBlobShadow(0.5);
    // 주인공이 들고 다니는 랜턴 불빛
    this.lantern = new THREE.PointLight(0xffcf96, 48, 22, 1.5);
    this.lantern.position.set(0, 2.6, 0.4);
    this.root.add(this.lantern);
    game.scene.add(this.root);
    game.scene.add(this.shadow);
  }

  get d() { return derive(this.game.state); }

  resetVitals() {
    const d = this.d;
    this.hp = d.maxHp;
    this.sta = d.maxSta;
    for (const k of Object.keys(this.status)) this.status[k] = 0;
  }

  syncWeapon() {
    const w = equippedMelee(this.game.state);
    if (this.weaponId === w.id) return;
    if (this.weaponModel) this.rig.hand.remove(this.weaponModel);
    this.weaponModel = makeWeapon(w.model);
    this.weaponModel.rotation.x = -0.2;
    this.rig.hand.add(this.weaponModel);
    this.weaponId = w.id;
  }

  applyStatus(kind, dur) {
    const mul = this.d.statusMul;
    this.status[kind] = Math.max(this.status[kind], dur * (kind === 'grab' ? 1 : mul));
    if (kind === 'spore') this.game.audio.sfx('spore', 0.5);
  }

  canAct() { return this.status.sleep <= 0 && this.hp > 0; }

  update(dt, input) {
    const g = this.game;
    const st = g.state;
    const d = this.d;
    this.syncWeapon();
    for (const k of Object.keys(this.status)) if (this.status[k] > 0) this.status[k] -= dt;
    if (this.status.spore > 0) this.hurtRaw(d.maxHp * 0.02 * dt);
    this.meleeCd -= dt;
    this.rangedCd -= dt;
    this.invuln -= dt;
    this.staIdle += dt;
    this.lastHurt += dt;
    this.walkT += dt;

    // 이동
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let mz = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    let speed = BASE_SPEED * d.speedMul;
    const rw = equippedRanged(st);
    if (rw && rw.slow) speed *= 1 - rw.slow;
    if (this.status.grab > 0) speed *= 0.55;
    const zone = g.zoneAt(this.pos.x, this.pos.z);
    if (zone === 'web') speed *= 0.45;
    let sprint = false;
    if (input.sprint && ml > 0 && this.sta > 1 && this.canAct()) {
      sprint = true;
      speed *= 1.5;
      this.useSta(20 * dt);
    }
    if (!this.canAct()) speed = 0;

    if (this.dash > 0) {
      this.dash -= dt;
      this.pos.addScaledVector(this.dashDir, 17 * dt);
    } else {
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
    }
    resolveCircle(this.pos, this.radius, g.floor);
    this.moving = ml > 0 && speed > 0;

    // 조준 방향
    if (g.aim) {
      const fx = g.aim.x - this.pos.x;
      const fz = g.aim.z - this.pos.z;
      if (Math.hypot(fx, fz) > 0.2) this.facing = Math.atan2(fx, fz);
    }

    // 스태미나 회복
    if (this.staIdle > 0.7) this.sta = Math.min(d.maxSta, this.sta + 30 * dt);

    // 행동
    if (this.canAct()) {
      if (input.dodge) { input.dodge = false; this.tryDodge(mx, mz); }
      if (input.attack) this.tryMelee();
      if (input.throw) this.tryThrow();
    }
    this.animate(dt, sprint);
  }

  useSta(n) {
    this.sta = Math.max(0, this.sta - n);
    this.staIdle = 0;
  }

  tryDodge(mx, mz) {
    if (this.sta < 25 || this.dash > 0) return;
    this.useSta(25);
    if (Math.hypot(mx, mz) < 0.1) { mx = Math.sin(this.facing); mz = Math.cos(this.facing); }
    this.dashDir.set(mx, 0, mz).normalize();
    this.dash = 0.22;
    this.invuln = 0.3;
    this.game.audio.sfx('dodge', 0.6);
  }

  attackInterval(w) {
    const st = this.game.state;
    let cd = SPEED[w.spd] / this.d.speedMul;
    if (w.str && st.stats.str < w.str) cd *= 2;
    return cd;
  }

  tryMelee() {
    const st = this.game.state;
    const w = equippedMelee(st);
    if (this.meleeCd > 0 || this.sta < 8) return;
    this.meleeCd = this.attackInterval(w);
    this.useSta(8);
    this.swingT = 0.001;
    this.swingDur = Math.min(0.32, this.meleeCd * 0.85);
    this.game.audio.sfx('swing', 0.5);
    this.game.after(this.swingDur * 0.45, () => this.game.resolveMelee(w));
  }

  tryThrow() {
    const g = this.game;
    const st = g.state;
    const w = equippedRanged(st);
    if (!w || this.rangedCd > 0 || this.sta < 6) return;
    if (rangedAmmo(st, w) <= 0) {
      g.toast(w.gun ? `${w.item}이 없다` : `${w.name}이 없다`);
      this.rangedCd = 0.4;
      return;
    }
    let cd = w.cd / this.d.speedMul;
    if (w.str && st.stats.str < w.str) cd *= 2;
    this.rangedCd = cd;
    this.useSta(w.gun ? 2 : 6);
    if (!w.infinite) addItem(st, w.item, -1);
    let atk = w.scaleThrow ? baseballAtk(st.stats.thr) : w.atk;
    atk *= this.d.rangedMul;
    this.throwT = 0.001;
    g.playerShoot(w, atk);
  }

  hurtRaw(n) {
    this.hp -= n;
    if (this.hp <= 0) { this.hp = 0; this.game.onPlayerDeath(); }
  }

  animate(dt, sprint) {
    const r = this.rig;
    this.root.position.copy(this.pos);
    const target = this.facing;
    const cur = this.root.rotation.y;
    const diff = ((target - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.root.rotation.y = cur + diff * Math.min(1, dt * 16);
    this.shadow.position.set(this.pos.x, 0.02, this.pos.z);
    const w = this.walkT * (sprint ? 13 : 10);
    const amp = this.moving ? (sprint ? 0.8 : 0.6) : 0.04;
    r.legL.rotation.x = Math.sin(w) * amp;
    r.legR.rotation.x = -Math.sin(w) * amp;
    r.armL.rotation.x = -Math.sin(w) * amp * 0.8;
    r.body.position.y = Math.abs(Math.sin(w)) * (this.moving ? 0.06 : 0.0) + (this.status.sleep > 0 ? -0.3 : 0);
    r.body.rotation.x = this.moving ? (sprint ? 0.22 : 0.1) : 0.02;
    if (this.dash > 0) r.body.rotation.x = 0.5;
    // 휘두르기: 들어올렸다가 내려친다
    if (this.swingT > 0) {
      this.swingT += dt;
      const k = Math.min(1, this.swingT / this.swingDur);
      const wpn = equippedMelee(this.game.state);
      if (wpn.pierce || wpn.model === 'pen' || wpn.model === 'shard') {
        r.armR.rotation.set(-1.5 + Math.sin(k * Math.PI) * -0.3, 0, 0);
        r.armR.position.z = Math.sin(k * Math.PI) * 0.35;
      } else {
        const a = k < 0.35 ? -2.6 * (k / 0.35) : -2.6 + (k - 0.35) / 0.65 * 3.4;
        r.armR.rotation.set(a, 0, -0.3 + k * 0.6);
        r.armR.position.z = 0;
      }
      if (k >= 1) { this.swingT = 0; r.armR.rotation.set(0, 0, 0); r.armR.position.z = 0; }
    } else if (this.throwT > 0) {
      this.throwT += dt;
      const k = Math.min(1, this.throwT / 0.25);
      r.armL.rotation.x = -2.8 + k * 3.2;
      if (k >= 1) this.throwT = 0;
    } else {
      r.armR.rotation.x = Math.sin(w) * amp * 0.6 - 0.25;
    }
  }
}
