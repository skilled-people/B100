// =====================================================================
//  몬스터와 보스
// =====================================================================
import * as THREE from './three.module.js';
import { MONSTERS, BALANCE, floorCoef, stageOf, bossEaseOf } from './data.js';
import { buildCharacter, makeBlobShadow, makeDecal } from './models.js';
import { resolveCircle, HW, ROOM } from './world.js';

let NEXT_ID = 1;
const tmp = new THREE.Vector3();

export class Enemy {
  constructor(game, type, x, z, opts = {}) {
    this.game = game;
    this.id = NEXT_ID++;
    this.type = type;
    this.isBoss = !!opts.boss;
    this.tag = opts.tag || 'floor';          // floor | room | minion | overflow | hive | heart | clone
    const f = game.state.floor;
    const coef = floorCoef(f);
    const stage = stageOf(f);
    if (this.isBoss) {
      const b = opts.boss;
      this.def = { name: b.name, shape: b.shape, speed: b.air ? 4.2 : 2.6, size: b.scale, flying: !!b.air, ai: 'boss' };
      this.bossDef = b;
      const ease = bossEaseOf(f);
      this.maxHp = Math.round(b.hp * BALANCE.bossHp * ease.hp);
      this.atk = b.atk * BALANCE.bossAtk * ease.atk;
      this.pace = ease.pace;
      this.name = b.name;
      this.xp = Math.round(b.hp / 9);
      this.gold = Math.round(b.hp / 8);
    } else if (opts.def) {
      this.def = opts.def;
      this.maxHp = opts.hp;
      this.atk = opts.atk || 0;
      this.name = opts.def.name;
      this.xp = opts.xp || 0;
      this.gold = opts.gold || 0;
    } else {
      this.def = MONSTERS[type];
      this.maxHp = Math.round(this.def.hp * coef * BALANCE.enemyHp);
      this.atk = this.def.atk * coef * BALANCE.enemyAtk;
      this.name = this.def.name;
      this.xp = Math.max(1, Math.round(this.def.xp * coef * BALANCE.xp));
      this.gold = Math.round((2 + this.def.hp / 30) * coef * BALANCE.gold * (0.7 + Math.random() * 0.6));
    }
    if (opts.hpMul) this.maxHp = Math.round(this.maxHp * opts.hpMul);
    this.hp = this.maxHp;
    this.speed = (this.def.speed || 2) * (opts.speedMul || 1);
    this.flying = !!this.def.flying;
    this.alive = true;
    this.dying = 0;
    this.pos = new THREE.Vector3(x, 0, z);
    this.facing = Math.random() * Math.PI * 2;
    this.attackCd = 0.6 + Math.random();
    this.state = 'idle';
    this.stateT = 0;
    this.status = { stun: 0, root: 0, bleed: 0, bleedDmg: 0, pulled: 0 };
    this.walkT = Math.random() * 10;
    this.hitPop = 0;
    this.invulnerable = false;

    if (opts.rigObject) {
      this.rig = { root: opts.rigObject, body: opts.rigObject, height: opts.height || 2, radius: opts.radius || 1, shape: 'static' };
      this.root = opts.rigObject;
      this.external = true;
      this.ownsRig = !!opts.ownsRig;
      if (this.ownsRig) game.scene.add(this.root);
    } else {
      const inf = this.isBoss ? Math.min(1, stage.vine + 0.25) : stage.vine;
      const isFather = this.def.shape === 'father';
      this.rig = buildCharacter(this.def.shape, {
        infection: isFather ? 1.0 : inf * (this.isBoss ? 1 : 0.8),
        flower: isFather ? 1.0 : stage.flower,
        scale: this.isBoss ? this.def.size : (this.def.size || 1),
        tool: (this.bossDef && this.bossDef.tool) || this.def.tool,
        coat: this.bossDef && this.bossDef.coat,
        bloom: this.def.bloom,
        seed: this.id,
      });
      this.root = this.rig.root;
      this.shadow = makeBlobShadow(this.rig.radius);
      game.scene.add(this.shadow);
      if (this.def.flying) {
        // 공중의 적이 어디 있는지 바닥에 표시
        this.marker = makeDecal(this.isBoss ? 0xff5a7a : 0xff9a6a, Math.max(0.6, this.rig.radius * 0.9));
        this.marker.material.opacity = 0.45;
        game.scene.add(this.marker);
      }
      game.scene.add(this.root);
    }
    this.radius = this.rig.radius;
    this.height = this.rig.height;
    this.altitude = this.flying ? (this.isBoss ? 3.6 : 2.8) : 0;
    this.targetAlt = this.altitude;
    this.pos.y = this.altitude;
    this.root.position.copy(this.pos);
  }

  get centerY() {
    if (this.rig.shape === 'flyer' || this.rig.shape === 'swarm') return this.pos.y;
    return this.pos.y + this.height * 0.5;
  }
  get hittableByMelee() {
    return this.pos.y < 2.3 && this.state !== 'burrowed';
  }

  distToPlayer() {
    const p = this.game.player.pos;
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  takeDamage(amount, opts = {}) {
    if (!this.alive || this.invulnerable) {
      if (this.invulnerable && this.alive) this.game.floatText(this.pos.x, this.centerY + 1, '막힘', '#9be38a', this.pos.z);
      return 0;
    }
    let dmg = amount;
    if (this.def.armor && !opts.ranged) dmg *= 1 - this.def.armor;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.hitPop = 1;
    if (opts.knock && !this.isBoss) {
      tmp.set(this.pos.x - this.game.player.pos.x, 0, this.pos.z - this.game.player.pos.z).normalize();
      this.pos.x += tmp.x * opts.knock;
      this.pos.z += tmp.z * opts.knock;
    }
    if (opts.stun) this.status.stun = Math.max(this.status.stun, this.isBoss ? opts.stun * 0.3 : opts.stun);
    if (opts.root) this.status.root = Math.max(this.status.root, this.isBoss ? opts.root * 0.3 : opts.root);
    if (opts.bleed) { this.status.bleed = 3; this.status.bleedDmg = dmg * 0.2 / 3; }
    if (opts.pull && this.flying) this.status.pulled = 1.6;
    if (this.def.reflect && !opts.ranged && !opts.reflected) {
      this.game.damagePlayer(dmg * this.def.reflect, this, { reflected: true });
    }
    this.game.floatText(this.pos.x, this.centerY + 0.6, String(dmg), opts.ranged ? '#f2d38a' : '#ffffff', this.pos.z);
    if (this.hp <= 0) this.die();
    return dmg;
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.dying = 0.001;
    this.game.onEnemyKilled(this);
  }

  remove() {
    if (!this.external || this.ownsRig) this.game.scene.remove(this.root);
    if (this.shadow) this.game.scene.remove(this.shadow);
    if (this.marker) { this.game.scene.remove(this.marker); this.marker.material.dispose(); }
  }

  // ------------------------------------------------------------ 갱신
  update(dt) {
    const g = this.game;
    if (!this.alive) {
      this.dying += dt;
      const k = Math.min(1, this.dying / 0.6);
      if (this.bossDef && this.bossDef.final) {
        // 쓰러진 채로 남는다
        const kk = Math.min(1, this.dying / 1.2);
        this.root.rotation.x = -kk * Math.PI * 0.46;
        this.root.position.y = this.pos.y + kk * 0.25;
        return false;
      }
      if (!this.external || this.ownsRig) {
        this.root.scale.setScalar((this.isBoss ? this.def.size : (this.def.size || 1)) * (1 - k * 0.6));
        this.root.position.y = this.pos.y - k * 0.6;
        this.root.rotation.z = k * 1.2;
      }
      return k >= 1;
    }
    this.walkT += dt;
    if (this.hitPop > 0) this.hitPop = Math.max(0, this.hitPop - dt * 6);
    if (this.status.bleed > 0) {
      this.status.bleed -= dt;
      this.hp -= this.status.bleedDmg * dt;
      if (this.hp <= 0) { this.die(); return false; }
    }
    if (this.status.root > 0) this.status.root -= dt;
    if (this.status.pulled > 0) this.status.pulled -= dt;
    this.attackCd -= dt;
    this.stateT += dt;
    if (this.status.stun > 0) {
      this.status.stun -= dt;
    } else if (this.def.ai === 'boss') {
      this.updateBoss(dt);
    } else {
      this.updateAI(dt);
    }
    // 고도
    if (this.flying) {
      const tgt = this.status.pulled > 0 ? 1.2 : this.targetAlt;
      this.pos.y += (tgt - this.pos.y) * Math.min(1, dt * 4);
    }
    if (!this.flying && !this.def.stationary && this.state !== 'burrowed' && this.def.ai !== 'static') {
      resolveCircle(this.pos, this.radius * 0.8, g.floor, false);
    } else if (this.flying || this.state === 'burrowed') {
      if (this.tag === 'room') {
        this.pos.x = Math.max(ROOM.minX + 1, Math.min(ROOM.maxX - 1, this.pos.x));
        this.pos.z = Math.max(ROOM.minZ + 1, Math.min(ROOM.maxZ - 1, this.pos.z));
      } else {
        this.pos.x = Math.max(-HW + 1, Math.min(HW - 1, this.pos.x));
        this.pos.z = Math.max(-HW + 1, Math.min(HW - 1, this.pos.z));
      }
    }
    this.animate(dt);
    return false;
  }

  moveToward(tx, tz, speed, dt) {
    if (this.status.root > 0) return;
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const s = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * s;
    this.pos.z += (dz / d) * s;
    this.facing = Math.atan2(dx, dz);
    this.moving = true;
  }

  faceTo(tx, tz) { this.facing = Math.atan2(tx - this.pos.x, tz - this.pos.z); }

  meleeHit(mult = 1, range = 0.6) {
    const d = this.distToPlayer();
    if (d < this.radius + this.game.player.radius + range) {
      this.game.damagePlayer(this.atk * mult, this);
      return true;
    }
    return false;
  }

  updateAI(dt) {
    const g = this.game;
    const p = g.player.pos;
    const d = this.distToPlayer();
    const ai = this.def.ai;
    this.moving = false;
    const aggro = d < 20 || this.tag !== 'floor' || this.hp < this.maxHp;
    if (!aggro) {
      // 배회
      if (this.stateT > 3) { this.stateT = 0; this.wander = { x: this.pos.x + (Math.random() - 0.5) * 6, z: this.pos.z + (Math.random() - 0.5) * 6 }; }
      if (this.wander) this.moveToward(this.wander.x, this.wander.z, this.speed * 0.35, dt);
      return;
    }
    switch (ai) {
      case 'chase':
      case 'grabber':
      case 'brute':
      case 'bloomer':
      case 'splitter': {
        const reach = this.radius + g.player.radius + 0.5;
        if (d > reach) this.moveToward(p.x, p.z, this.speed, dt);
        else this.faceTo(p.x, p.z);
        if (d <= reach + 0.1 && this.attackCd <= 0) {
          this.attackCd = ai === 'brute' ? 1.4 : 1.05;
          this.swing = 0.3;
          if (this.meleeHit(1, 0.7) && ai === 'grabber') g.player.applyStatus('grab', 0.9);
        }
        break;
      }
      case 'charger': {
        if (this.state === 'windup') {
          this.faceTo(p.x, p.z);
          if (this.stateT > 0.45) { this.state = 'dash'; this.stateT = 0; this.dashDir = { x: Math.sin(this.facing), z: Math.cos(this.facing) }; this.hitDone = false; }
        } else if (this.state === 'dash') {
          this.pos.x += this.dashDir.x * this.speed * 2.6 * dt;
          this.pos.z += this.dashDir.z * this.speed * 2.6 * dt;
          this.moving = true;
          if (!this.hitDone && this.meleeHit(1.1, 0.4)) {
            this.hitDone = true;
            if (this.def.spore) g.player.applyStatus('spore', 3);
          }
          if (this.stateT > 0.55) { this.state = 'idle'; this.stateT = 0; this.attackCd = 1.4; }
        } else {
          if (d > 3.5 && d < 9 && this.attackCd <= 0) { this.state = 'windup'; this.stateT = 0; }
          else if (d > 1.6) this.moveToward(p.x, p.z, this.speed * 0.8, dt);
          else if (this.attackCd <= 0) { this.attackCd = 1.0; this.swing = 0.3; if (this.meleeHit(0.8, 0.6) && this.def.spore) g.player.applyStatus('spore', 2); }
        }
        break;
      }
      case 'spitter': {
        if (d < 5.5) this.moveToward(this.pos.x - (p.x - this.pos.x), this.pos.z - (p.z - this.pos.z), this.speed * 0.8, dt);
        else if (d > 9) this.moveToward(p.x, p.z, this.speed, dt);
        else this.faceTo(p.x, p.z);
        if (this.attackCd <= 0 && d < 14) {
          this.attackCd = 2.2;
          this.swing = 0.4;
          g.enemyShoot(this, p, { speed: 8, dmg: this.atk, model: 'spore', status: 'spore' });
        }
        break;
      }
      case 'diver': {
        if (this.state === 'dive') {
          this.targetAlt = 1.0;
          this.moveToward(this.diveT.x, this.diveT.z, this.speed * 2.3, dt);
          if (!this.hitDone && this.pos.y < 1.8 && this.meleeHit(1, 0.5)) this.hitDone = true;
          if (this.stateT > 1.1 || Math.hypot(this.diveT.x - this.pos.x, this.diveT.z - this.pos.z) < 0.3) { this.state = 'idle'; this.stateT = 0; this.targetAlt = 2.8; this.attackCd = 2 + Math.random() * 1.5; }
        } else {
          const a = this.walkT * 0.9 + this.id;
          const r = 4.5;
          this.moveToward(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, this.speed, dt);
          this.targetAlt = 2.8 + Math.sin(this.walkT * 2) * 0.3;
          if (this.attackCd <= 0 && d < 9) { this.state = 'dive'; this.stateT = 0; this.diveT = { x: p.x, z: p.z }; this.hitDone = false; }
        }
        break;
      }
      case 'moth': {
        const a = this.walkT * 1.6 + this.id * 2;
        this.moveToward(p.x + Math.cos(a) * 2.2, p.z + Math.sin(a * 1.3) * 2.2, this.speed, dt);
        this.targetAlt = 1.5 + Math.sin(this.walkT * 3) * 0.5;
        if (this.attackCd <= 0 && d < 2.4) {
          this.attackCd = 1.6;
          if (this.meleeHit(1, 1.2) && this.def.blind) g.player.applyStatus('blind', 3);
        }
        break;
      }
      case 'burrower': {
        if (this.state === 'burrowed') {
          this.moveToward(p.x, p.z, this.speed * 1.8, dt);
          if (d < 1.6 || this.stateT > 4) {
            this.state = 'emerge'; this.stateT = 0;
            g.telegraph(this.pos.x, this.pos.z, 1.8, 0.5, 0xff8040, () => {
              if (Math.hypot(g.player.pos.x - this.pos.x, g.player.pos.z - this.pos.z) < 1.8 + g.player.radius) g.damagePlayer(this.atk * 1.2, this);
            });
          }
        } else if (this.state === 'emerge') {
          if (this.stateT > 0.5) { this.state = 'idle'; this.stateT = 0; }
        } else {
          if (d > 4 && this.stateT > 2.5) { this.state = 'burrowed'; this.stateT = 0; }
          else {
            if (d > 1.8) this.moveToward(p.x, p.z, this.speed * 0.7, dt);
            if (d < 2.0 && this.attackCd <= 0) { this.attackCd = 1.2; this.swing = 0.3; this.meleeHit(1, 0.6); }
          }
        }
        break;
      }
      case 'static':
      default:
        break;
    }
  }

  // ------------------------------------------------------------ 보스
  updateBoss(dt) {
    const g = this.game;
    const p = g.player.pos;
    const d = this.distToPlayer();
    const b = this.bossDef;
    const hpFrac = this.hp / this.maxHp;
    this.moving = false;
    const finalWeak = b.final && hpFrac <= 0.25;
    const spMul = finalWeak ? 0.6 : 1;

    // 진행 중인 행동
    if (this.action) {
      this.action.t += dt;
      const done = this.action.tick(dt, this.action.t);
      if (done) { this.action = null; this.patternCd = (finalWeak ? 4.6 : 2.4 + Math.random() * 1.6) * (0.75 + hpFrac * 0.35) * (this.pace || 1); }
      return;
    }
    // 기본 이동
    if (b.stationary) {
      this.faceTo(p.x, p.z);
    } else if (this.flying) {
      const a = this.walkT * 0.5;
      this.moveToward(p.x + Math.cos(a) * 6, p.z + Math.sin(a) * 6, this.speed, dt);
      this.targetAlt = 3.6 + Math.sin(this.walkT * 1.7) * 0.4;
    } else {
      const reach = this.radius + g.player.radius + 0.8;
      if (d > reach) this.moveToward(p.x, p.z, this.speed * spMul, dt);
      else this.faceTo(p.x, p.z);
      if (d <= reach + 0.2 && this.attackCd <= 0) {
        this.attackCd = (finalWeak ? 2.2 : 1.3) * (this.pace || 1);
        this.swing = 0.35;
        const miss = finalWeak && Math.random() < 0.4;
        if (!miss) this.meleeHit(1, 0.9);
        else g.floatText(this.pos.x, this.centerY + 1.2, '빗나감', '#c0c0c0', this.pos.z);
      }
    }
    this.patternCd = (this.patternCd ?? 2.5) - dt;
    if (this.patternCd <= 0) this.startPattern();
  }

  startPattern() {
    const b = this.bossDef;
    const list = b.patterns;
    this.patIdx = ((this.patIdx ?? -1) + 1 + (Math.random() < 0.3 ? 1 : 0)) % list.length;
    const pat = list[this.patIdx];
    const g = this.game;
    const self = this;
    const p = () => g.player.pos;
    const finalWeak = b.final && this.hp / this.maxHp <= 0.25;
    const aimOff = () => finalWeak && Math.random() < 0.4 ? (Math.random() - 0.5) * 7 : 0;
    const act = (tick) => { this.action = { t: 0, tick }; };

    if (pat.startsWith('summon:')) {
      const type = pat.split(':')[1];
      const n = Math.min(4, g.countMinions(this) < 10 ? 3 + Math.floor(Math.random() * 2) : 0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        g.spawnEnemy(type, this.pos.x + Math.cos(a) * 2.5, this.pos.z + Math.sin(a) * 2.5, { tag: 'minion', owner: this.id });
      }
      if (n) g.audio.sfx('boss_roar', 0.6);
      act((dt, t) => t > 0.6);
      return;
    }
    switch (pat) {
      case 'charge': {
        let phase = 0; let dir = null; let hit = false;
        const tgt = { x: p().x + aimOff(), z: p().z + aimOff() };
        g.telegraph(tgt.x, tgt.z, 1.6, 0.75, 0xff5030);
        act((dt, t) => {
          if (phase === 0) { self.faceTo(tgt.x, tgt.z); if (t > 0.75) { phase = 1; dir = { x: Math.sin(self.facing), z: Math.cos(self.facing) }; } return false; }
          self.pos.x += dir.x * 13 * dt; self.pos.z += dir.z * 13 * dt; self.moving = true;
          if (!hit && self.meleeHit(1.25, 0.4)) hit = true;
          return t > 1.55;
        });
        break;
      }
      case 'slam': {
        const r = 4.2 * Math.max(1, self.def.size / 2.2);
        self.swing = 0.9;
        g.telegraph(self.pos.x, self.pos.z, r, 0.95, 0xff3030, () => {
          g.audio.sfx('hit_heavy', 0.8); g.shake(0.4);
          if (Math.hypot(p().x - self.pos.x, p().z - self.pos.z) < r + g.player.radius) g.damagePlayer(self.atk * 1.5, self);
        });
        act((dt, t) => t > 1.2);
        break;
      }
      case 'rockfall':
      case 'roots': {
        const n = pat === 'roots' ? 6 : 5;
        for (let i = 0; i < n; i++) {
          g.after(i * 0.22, () => {
            if (!self.alive) return;
            const x = p().x + (Math.random() - 0.5) * (i === 0 ? 0.5 : 6) + aimOff();
            const z = p().z + (Math.random() - 0.5) * (i === 0 ? 0.5 : 6) + aimOff();
            g.telegraph(x, z, 1.6, 0.9, pat === 'roots' ? 0x7fd060 : 0xffa040, () => {
              g.spawnBurst(x, z, pat === 'roots' ? 'root' : 'rock');
              if (Math.hypot(p().x - x, p().z - z) < 1.6 + g.player.radius) g.damagePlayer(self.atk, self);
            });
          });
        }
        act((dt, t) => t > 1.6);
        break;
      }
      case 'burrow': {
        self.state = 'burrowed';
        act((dt, t) => {
          self.moveToward(p().x, p().z, 9, dt);
          if (t > 1.8) {
            self.state = 'idle';
            g.telegraph(self.pos.x, self.pos.z, 3.4, 0.55, 0xff6020, () => {
              g.shake(0.5);
              if (Math.hypot(p().x - self.pos.x, p().z - self.pos.z) < 3.4 + g.player.radius) g.damagePlayer(self.atk * 1.4, self);
            });
            return true;
          }
          return false;
        });
        break;
      }
      case 'dive': {
        const tgt = { x: p().x, z: p().z };
        g.telegraph(tgt.x, tgt.z, 2.2, 0.8, 0xff4060);
        let hit = false;
        act((dt, t) => {
          if (t < 0.6) { self.targetAlt = 4.6; self.faceTo(tgt.x, tgt.z); return false; }
          self.targetAlt = 1.0;
          self.moveToward(tgt.x, tgt.z, 15, dt);
          if (!hit && self.pos.y < 2.0 && self.meleeHit(1.3, 0.8)) hit = true;
          if (t > 2.4) { self.targetAlt = 3.6; return true; } // 낮게 머무는 동안 근접 공격 기회
          return false;
        });
        break;
      }
      case 'blur': {
        g.player.applyStatus('blind', 4);
        g.audio.sfx('spore', 0.7);
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * Math.PI * 2;
          g.enemyShootDir(self, { x: Math.cos(a), z: Math.sin(a) }, { speed: 6, dmg: self.atk * 0.6, model: 'spore', status: 'spore' });
        }
        act((dt, t) => t > 0.8);
        break;
      }
      case 'barrage': {
        const model = self.def.shape === 'bee' ? 'sting' : self.def.shape === 'tree' || self.def.shape === 'boar' ? 'thorn' : 'spore';
        let shots = 0;
        act((dt, t) => {
          const want = Math.floor(t / 0.12);
          while (shots < want && shots < 12) {
            const base = Math.atan2(p().x - self.pos.x, p().z - self.pos.z);
            const a = base + (shots - 5.5) * 0.12 + (finalWeak ? (Math.random() - 0.5) * 0.8 : 0);
            g.enemyShootDir(self, { x: Math.sin(a), z: Math.cos(a) }, { speed: 11, dmg: self.atk * 0.55, model });
            shots++;
          }
          return t > 1.6;
        });
        break;
      }
      case 'heal': {
        self.hp = Math.min(self.maxHp, self.hp + self.maxHp * 0.03);
        g.healMinions(self, 0.2);
        g.floatText(self.pos.x, self.centerY + 1.4, '회복', '#9be38a', self.pos.z);
        g.audio.sfx('heal', 0.7);
        act((dt, t) => t > 0.8);
        break;
      }
      case 'web': {
        for (let i = 0; i < 4; i++) {
          const x = p().x + (Math.random() - 0.5) * 8;
          const z = p().z + (Math.random() - 0.5) * 8;
          g.addZone(x, z, 2.0, 8, 'web');
        }
        act((dt, t) => t > 0.6);
        break;
      }
      case 'sleep': {
        const tgt = { x: p().x, z: p().z };
        g.telegraph(tgt.x, tgt.z, 3.0, 1.0, 0xc89ae0, () => {
          if (Math.hypot(p().x - tgt.x, p().z - tgt.z) < 3.0 + g.player.radius) g.player.applyStatus('sleep', 2.2);
        });
        act((dt, t) => t > 1.2);
        break;
      }
      case 'poisonfield': {
        for (let i = 0; i < 3; i++) g.addZone(p().x + (Math.random() - 0.5) * 7, p().z + (Math.random() - 0.5) * 7, 2.4, 6, 'poison', self.atk * 0.25);
        act((dt, t) => t > 0.6);
        break;
      }
      case 'clone': {
        if (g.countTag('clone') < 2) {
          for (let i = 0; i < 2; i++) {
            const e = g.spawnEnemy('clone', self.pos.x + (i ? 3 : -3), self.pos.z, { tag: 'clone', owner: self.id,
              def: { name: '분신', shape: self.def.shape, speed: 4.2, size: self.def.size * 0.8, flying: true, ai: 'diver' },
              hp: Math.round(self.maxHp * 0.06), atk: self.atk * 0.3, xp: 0, gold: 0 });
            if (e) e.isClone = true;
          }
        }
        act((dt, t) => t > 0.6);
        break;
      }
      case 'split': {
        const frac = self.hp / self.maxHp;
        self.splits = self.splits || 0;
        if ((frac < 0.66 && self.splits === 0) || (frac < 0.33 && self.splits === 1)) {
          self.splits++;
          for (let i = 0; i < 3; i++) g.spawnEnemy('host', self.pos.x + (i - 1) * 2.4, self.pos.z + 2, { tag: 'minion', owner: self.id });
          g.audio.sfx('boss_roar', 0.7);
        }
        act((dt, t) => t > 0.4);
        break;
      }
      case 'hive': {
        if (g.countTag('hive') === 0 && !self.hiveDone) {
          self.hiveDone = true; // 벌집은 한 번만
        }
        g.spawnEnemy('bee', self.pos.x, self.pos.z, { tag: 'minion', owner: self.id });
        act((dt, t) => t > 0.4);
        break;
      }
      default:
        act((dt, t) => t > 0.3);
    }
  }

  // ------------------------------------------------------------ 애니메이션
  animate(dt) {
    const r = this.rig;
    const root = this.root;
    const baseScale = this.isBoss ? this.def.size : (this.def.size || 1);
    if (this.external) return;
    root.position.set(this.pos.x, this.pos.y, this.pos.z);
    if (this.state === 'burrowed') root.position.y = -this.height * 0.85;
    root.rotation.y += ((this.facing - root.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 10);
    const pop = 1 + this.hitPop * 0.12;
    root.scale.set(baseScale * pop, baseScale * (2 - pop), baseScale * pop);
    if (this.shadow) {
      this.shadow.position.set(this.pos.x, 0.02, this.pos.z);
      this.shadow.visible = this.state !== 'burrowed';
    }
    if (this.marker) {
      this.marker.position.set(this.pos.x, 0.05, this.pos.z);
      this.marker.material.opacity = this.pos.y < 2.3 ? 0.85 : 0.4;
    }
    const w = this.walkT * (this.moving ? 9 : 2);
    if (this.swing > 0) this.swing -= dt;
    if (r.shape === 'human') {
      const amp = this.moving ? 0.6 : 0.05;
      r.legL.rotation.x = Math.sin(w) * amp;
      r.legR.rotation.x = -Math.sin(w) * amp;
      r.armL.rotation.x = -Math.sin(w) * amp * 0.7 - (this.def.shape === 'father' ? 0.3 : 0.5);
      r.armR.rotation.x = this.swing > 0 ? -2.2 + (0.35 - this.swing) * 8 : Math.sin(w) * amp * 0.7 - 0.5;
      r.body.position.y = Math.abs(Math.sin(w)) * (this.moving ? 0.05 : 0.01);
      r.body.rotation.x = 0.12;
    } else if (r.shape === 'quad') {
      const amp = this.moving ? 0.7 : 0.05;
      r.legs.forEach((l, i) => { l.rotation.x = Math.sin(w + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * amp; });
      r.body.position.y = Math.abs(Math.sin(w * 2)) * (this.moving ? 0.04 : 0.01);
      r.head.rotation.x = this.swing > 0 ? 0.4 : 0;
    } else if (r.shape === 'flyer') {
      const f = Math.sin(this.walkT * 22) * 0.9;
      r.wings[0].rotation.z = f;
      r.wings[1].rotation.z = -f;
      r.body.position.y = Math.sin(this.walkT * 4) * 0.08;
    } else if (r.shape === 'spider') {
      r.legs.forEach((l, i) => { l.rotation.x = Math.sin(w * 1.4 + i) * (this.moving ? 0.35 : 0.05); });
    } else if (r.shape === 'blob') {
      const s = 1 + Math.sin(this.walkT * 3) * 0.04;
      r.body.scale.set(s, 2 - s, s);
    } else if (r.shape === 'tree') {
      r.body.rotation.z = Math.sin(this.walkT * 0.8) * 0.03;
    } else if (r.shape === 'swarm') {
      const alive = Math.max(0.15, this.hp / this.maxHp);
      r.flies.forEach((f, i) => {
        const u = f.userData;
        f.visible = i / r.flies.length < alive;
        u.a += dt * u.s;
        f.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(u.a * 2) * 0.3, Math.sin(u.a) * u.r);
        f.rotation.y = -u.a;
        const fl = Math.sin(this.walkT * 18 + i) * 1.0;
        u.wl.rotation.y = fl; u.wr.rotation.y = -fl;
      });
    }
  }
}
