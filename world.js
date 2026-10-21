// =====================================================================
//  층 생성 — 층 번호를 시드로 같은 층은 언제나 같은 모양이 된다.
// =====================================================================
import * as THREE from './three.module.js';
import { G, M, TEX, mesh, makeCrate, makeBarrel, makeTerminal, makeWorkbench, makeLamp, makeStairsUp, makeHatch,
  makeHeart, makeRecorder, makeLocker, makePipeRun, makeRubble } from './models.js';
import { stageOf, isBossFloor, hasInfectedRoom, isStationFloor, hasForge, DISPLAY_SHOP, isSurvivorFloor } from './data.js';
import { recordingByFloor } from './story.js';

export const HW = 26;          // 홀 반폭
export const WALL_H = 5.2;
export const ROOM = { minX: 27, maxX: 42, minZ: -7, maxZ: 7 };
export const DOOR = { x: 26.5, z: 0, half: 2 };
export const BOSS_POS = { x: 0, z: -5 };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uvScale(geo, sx, sy) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  uv.needsUpdate = true;
  return geo;
}

// 공유 덩굴 지오메트리 (층마다 재생성하지 않음)
let HANG = null;
function hangingVines() {
  if (HANG) return HANG;
  HANG = [];
  for (let v = 0; v < 4; v++) {
    const pts = [];
    const L = 2.4 + v * 0.9;
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      pts.push(new THREE.Vector3(Math.sin(u * 5 + v) * 0.18 * u, -L * u, Math.cos(u * 4 + v * 2) * 0.12 * u));
    }
    HANG.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.06 - v * 0.008, 5));
  }
  return HANG;
}

export function stageColors(stageId) {
  // [안개/배경색, 반구광 하늘색, 포자색]
  const table = {
    1: [0x15110e, 0x5a5048, 0xd8e8c8],
    2: [0x131410, 0x4e5446, 0xc8e8b0],
    3: [0x101510, 0x46584a, 0xb8f0a8],
    4: [0x0e1612, 0x3e5a4a, 0xf0b0d0],
    5: [0x0f1512, 0x3c584c, 0xf0a0c8],
    6: [0x101812, 0x3a6050, 0xffb0d8],
  };
  return table[stageId];
}

export function buildFloor(floorNum, state) {
  const rnd = mulberry32(floorNum * 7919 + 17);
  const stage = stageOf(floorNum);
  const [fogCol, skyCol, sporeCol] = stageColors(stage.id);
  const group = new THREE.Group();
  const disposables = [];
  const boxes = [];   // AABB {minX,maxX,minZ,maxZ}
  const circles = []; // {x,z,r}
  const animated = [];
  const lights = [];
  const minimap = { rects: [], circles: [] };

  const keepGeo = (g) => { disposables.push(g); return g; };
  const addBox = (minX, maxX, minZ, maxZ, tag) => { const b = { minX, maxX, minZ, maxZ, tag }; boxes.push(b); return b; };
  const free = (x, z, r, extra = []) => {
    if (Math.abs(x) < 3 && z < -16) return false;               // 계단
    if (Math.abs(x) < 4 && z > 17) return false;                // 입구
    if (x > 21 && Math.abs(z) < 5) return false;                // 감염된 방 문
    for (const c of circles) if (Math.hypot(c.x - x, c.z - z) < c.r + r + 1.2) return false;
    for (const b of boxes) if (x + r > b.minX - 1 && x - r < b.maxX + 1 && z + r > b.minZ - 1 && z - r < b.maxZ + 1) return false;
    for (const e of extra) if (Math.hypot(e.x - x, e.z - z) < e.r + r) return false;
    return true;
  };

  const boss = isBossFloor(floorNum);
  const room = hasInfectedRoom(floorNum);

  // ---------------------------------------------------------- 바닥 · 벽
  const floorGeo = keepGeo(uvScale(new THREE.PlaneGeometry(HW * 2 + 2, HW * 2 + 2), (HW * 2 + 2) / 5.5, (HW * 2 + 2) / 5.5));
  const floorMesh = new THREE.Mesh(floorGeo, M.floor);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  const wall = (cx, cz, sx, sz) => {
    const geo = keepGeo(uvScale(new THREE.BoxGeometry(sx, WALL_H, sz), Math.max(sx, sz) / 4.5, WALL_H / 4.5));
    const w = new THREE.Mesh(geo, M.rock);
    w.position.set(cx, WALL_H / 2, cz);
    group.add(w);
    addBox(cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2, 'wall');
    minimap.rects.push({ minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2, kind: 'wall' });
  };
  const T = 1.2;
  wall(0, -HW - T / 2, HW * 2 + T * 2, T);
  wall(0, HW + T / 2, HW * 2 + T * 2, T);
  wall(-HW - T / 2, 0, T, HW * 2);
  if (room) {
    wall(HW + T / 2, -(HW + DOOR.half) / 2 - 0, T, HW - DOOR.half);
    wall(HW + T / 2, (HW + DOOR.half) / 2, T, HW - DOOR.half);
    // 경계를 정확히 맞춘다
    boxes[boxes.length - 2].minZ = -HW; boxes[boxes.length - 2].maxZ = -DOOR.half;
    boxes[boxes.length - 1].minZ = DOOR.half; boxes[boxes.length - 1].maxZ = HW;
    group.children[group.children.length - 2].position.z = -(HW + DOOR.half) / 2;
    group.children[group.children.length - 1].position.z = (HW + DOOR.half) / 2;
  } else {
    wall(HW + T / 2, 0, T, HW * 2);
  }

  // ---------------------------------------------------------- 감염된 방
  let roomObj = null;
  if (room) {
    const rw = ROOM.maxX - ROOM.minX + 1;
    const rd = ROOM.maxZ - ROOM.minZ;
    const rf = new THREE.Mesh(keepGeo(uvScale(new THREE.PlaneGeometry(rw, rd), rw / 5.5, rd / 5.5)), M.floor);
    rf.rotation.x = -Math.PI / 2;
    rf.position.set((ROOM.minX + ROOM.maxX) / 2, 0.005, 0);
    group.add(rf);
    wall((ROOM.minX + ROOM.maxX) / 2 + 0.5, ROOM.minZ - T / 2, rw + 1.2, T);
    wall((ROOM.minX + ROOM.maxX) / 2 + 0.5, ROOM.maxZ + T / 2, rw + 1.2, T);
    wall(ROOM.maxX + T / 2, 0, T, rd + T * 2);
    // 문
    const doorGroup = new THREE.Group();
    const slab = mesh(G.box, M.metal, 0.5, 3.6, DOOR.half * 2, 0, 1.8, 0);
    const stripe = mesh(G.box, new THREE.MeshStandardMaterial({ color: 0x9be38a, emissive: 0x3fa34a, emissiveIntensity: 1.2 }), 0.52, 0.2, DOOR.half * 2 - 0.2, 0, 2.9, 0);
    doorGroup.add(slab, stripe);
    doorGroup.position.set(DOOR.x, 0, DOOR.z);
    group.add(doorGroup);
    const doorBox = addBox(DOOR.x - 0.6, DOOR.x + 0.6, -DOOR.half, DOOR.half, 'door');
    // 방 안 장식: 벽을 덮은 덩굴과 붉은 조명
    for (let i = 0; i < 26; i++) {
      const hv = new THREE.Mesh(hangingVines()[i % 4], M.vineDark);
      const side = i % 3;
      if (side === 0) hv.position.set(ROOM.minX + 1 + rnd() * 14, WALL_H, ROOM.minZ + 0.2);
      else if (side === 1) hv.position.set(ROOM.minX + 1 + rnd() * 14, WALL_H, ROOM.maxZ - 0.2);
      else hv.position.set(ROOM.maxX - 0.2, WALL_H, ROOM.minZ + 1 + rnd() * 12);
      group.add(hv);
    }
    const heart = makeHeart();
    heart.position.set(ROOM.maxX - 3, 0, 0);
    group.add(heart);
    animated.push({ kind: 'heart', obj: heart });
    const rl = new THREE.PointLight(0xff5a8a, 22, 18, 1.5);
    rl.position.set(ROOM.maxX - 3, 3.5, 0);
    group.add(rl);
    lights.push(rl);
    roomObj = { door: doorGroup, doorBox, stripe, heart, light: rl };
    minimap.rects.push({ minX: ROOM.minX, maxX: ROOM.maxX, minZ: ROOM.minZ, maxZ: ROOM.maxZ, kind: 'room' });
  }

  // ---------------------------------------------------------- 계단 · 입구
  const stairs = makeStairsUp();
  stairs.position.set(0, 0, -HW + 5.2);
  group.add(stairs);
  addBox(-1.8, 1.8, -HW, -HW + 4.4, 'stairs');
  const stairLight = new THREE.PointLight(0xffd29a, 26, 14, 1.6);
  stairLight.position.set(0, 4.5, -HW + 2.5);
  group.add(stairLight);
  lights.push(stairLight);
  let hatch = null;
  if (floorNum < 100) {
    hatch = makeHatch();
    hatch.position.set(0, 0, HW - 2.6);
    group.add(hatch);
  }

  // ---------------------------------------------------------- 조명
  const lampSpots = [[-18, -14], [18, -14], [-18, 12], [18, 12]];
  for (const [x, z] of lampSpots) {
    const lp = makeLamp();
    lp.position.set(x, 0, z);
    group.add(lp);
    circles.push({ x, z, r: 0.3 });
    const pl = new THREE.PointLight(0xffb45a, 30, 17, 1.6);
    pl.position.set(x, 3.0, z);
    group.add(pl);
    lights.push(pl);
    animated.push({ kind: 'lamp', light: pl, base: 30, t: rnd() * 10 });
  }

  // ---------------------------------------------------------- 시설
  const special = {};
  if (isStationFloor(floorNum)) {
    const term = makeTerminal(false);
    term.position.set(-8, 0, HW - 4.2);
    group.add(term);
    addBox(-8.6, -7.4, HW - 4.6, HW - 3.8, 'terminal');
    special.terminal = { x: -8, z: HW - 2.9 };
    const wb = makeWorkbench(hasForge(floorNum));
    wb.position.set(-15, 0, HW - 6);
    group.add(wb);
    addBox(-16.1, -13.9, HW - 6.5, HW - 5.5, 'bench');
    special.workbench = { x: -15, z: HW - 4.6 };
    if (hasForge(floorNum)) {
      addBox(-13.2, -11.1, HW - 6.6, HW - 5.4, 'forge');
      special.forge = { x: -12.2, z: HW - 4.6 };
      const fl = new THREE.PointLight(0xff7a30, 14, 9, 1.6);
      fl.position.set(-12.6, 1.6, HW - 6);
      group.add(fl);
      lights.push(fl);
    }
    minimap.circles.push({ x: -8, z: HW - 4.2, kind: 'terminal' });
  }
  if (DISPLAY_SHOP[floorNum]) {
    const ds = makeTerminal(true);
    ds.position.set(9, 0, HW - 4.2);
    group.add(ds);
    addBox(8.4, 9.6, HW - 4.6, HW - 3.8, 'display');
    special.display = { x: 9, z: HW - 2.9 };
    // 유리 진열장
    const glass = mesh(G.box, M.glass, 2.2, 1.4, 0.9, 12, 0.7, HW - 4.2);
    group.add(glass);
    addBox(10.9, 13.1, HW - 4.7, HW - 3.7, 'case');
    minimap.circles.push({ x: 9, z: HW - 4.2, kind: 'shop' });
  }
  if (recordingByFloor[floorNum]) {
    const rec = makeRecorder();
    rec.position.set(7, 0, HW - 5);
    group.add(rec);
    addBox(6.6, 7.4, HW - 5.3, HW - 4.7, 'recorder');
    special.recorder = { x: 7, z: HW - 3.8 };
    animated.push({ kind: 'led', obj: rec.userData.led });
    minimap.circles.push({ x: 7, z: HW - 5, kind: 'recorder' });
  }
  if (floorNum === 2) {
    const lk = makeLocker();
    lk.position.set(-16, 0, -12);
    group.add(lk);
    addBox(-17.5, -14.5, -12.5, -11.5, 'locker');
    special.warehouse = { x: -16, z: -10.6 };
  }
  if (isSurvivorFloor(floorNum)) {
    special.survivor = { x: -6 + rnd() * 12, z: -2 + rnd() * 8 };
  }

  // ---------------------------------------------------------- 기둥 · 잡동사니
  const nPillars = boss ? 4 : 7 + Math.floor(rnd() * 4);
  const arena = boss ? [{ x: BOSS_POS.x, z: BOSS_POS.z, r: 12 }] : [];
  for (let i = 0, tries = 0; i < nPillars && tries < 200; tries++) {
    const x = (rnd() * 2 - 1) * (HW - 4);
    const z = (rnd() * 2 - 1) * (HW - 5);
    const r = 0.8 + rnd() * 0.5;
    if (!free(x, z, r + 1.5, arena)) continue;
    const pg = keepGeo(uvScale(new THREE.CylinderGeometry(r, r * 1.08, WALL_H, 14), r * 1.5, WALL_H / 4));
    const p = new THREE.Mesh(pg, M.rock);
    p.position.set(x, WALL_H / 2, z);
    group.add(p);
    circles.push({ x, z, r });
    minimap.circles.push({ x, z, r, kind: 'pillar' });
    // 기둥을 감은 덩굴
    const nv = Math.round(stage.vine * 6);
    for (let k = 0; k < nv; k++) {
      const v = new THREE.Mesh(G.vineArc, k % 2 ? M.vine : M.vineDark);
      v.scale.setScalar(r * 1.04);
      v.position.set(x, 0.6 + k * 0.7 + rnd() * 0.3, z);
      v.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.5, rnd() * 6, 0);
      group.add(v);
    }
    i++;
  }
  const nProps = boss ? 4 : 8 + Math.floor(rnd() * 6);
  for (let i = 0, tries = 0; i < nProps && tries < 300; tries++) {
    const x = (rnd() * 2 - 1) * (HW - 3);
    const z = (rnd() * 2 - 1) * (HW - 4);
    const kind = rnd();
    const r = kind < 0.4 ? 0.8 : kind < 0.7 ? 0.5 : 0.9;
    if (!free(x, z, r + 0.6, arena)) continue;
    let o;
    if (kind < 0.4) {
      o = makeCrate(0.8 + rnd() * 0.4);
      const half = 0.55 * o.children[0].scale.x / 1.1 + 0.05;
      addBox(x - half, x + half, z - half, z + half, 'crate');
      minimap.rects.push({ minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half, kind: 'prop' });
    } else if (kind < 0.7) {
      o = makeBarrel();
      circles.push({ x, z, r: 0.45 });
      minimap.circles.push({ x, z, r: 0.45, kind: 'prop' });
    } else {
      o = makeRubble(Math.floor(rnd() * 99999) + 1);
      circles.push({ x, z, r: 0.7 });
      minimap.circles.push({ x, z, r: 0.7, kind: 'prop' });
    }
    o.position.set(x, 0, z);
    o.rotation.y = rnd() * Math.PI;
    group.add(o);
    i++;
  }
  // 벽을 따라 흐르는 배관
  for (const z of [-HW + 0.3, HW - 0.3]) {
    const pr = makePipeRun(HW * 2 - 2);
    pr.position.set(0, 3.6 + rnd() * 0.6, z);
    group.add(pr);
  }

  // ---------------------------------------------------------- 감염 장식
  const nHang = Math.round(8 + stage.vine * 40);
  const hv = hangingVines();
  for (let i = 0; i < nHang; i++) {
    const v = new THREE.Mesh(hv[i % 4], i % 3 ? M.vineDark : M.vine);
    const side = Math.floor(rnd() * 4);
    const u = (rnd() * 2 - 1) * (HW - 1);
    if (side === 0) v.position.set(u, WALL_H, -HW + 0.15);
    else if (side === 1) v.position.set(u, WALL_H, HW - 0.15);
    else if (side === 2) v.position.set(-HW + 0.15, WALL_H, u);
    else v.position.set(HW - 0.15, WALL_H, u);
    v.scale.y = 0.7 + rnd() * 0.8;
    group.add(v);
  }
  const mossMat = new THREE.MeshStandardMaterial({ map: TEX.moss, transparent: true, depthWrite: false, roughness: 0.9 });
  disposables.push(mossMat);
  const nMoss = Math.round(6 + stage.vine * 30);
  for (let i = 0; i < nMoss; i++) {
    const m = new THREE.Mesh(G.plane, mossMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rnd() * 6;
    const s = 1.5 + rnd() * 4;
    m.scale.set(s, s, 1);
    m.position.set((rnd() * 2 - 1) * (HW - 1), 0.012 + i * 0.0004, (rnd() * 2 - 1) * (HW - 1));
    group.add(m);
  }
  const nFlower = Math.round(stage.flower * 26);
  for (let i = 0; i < nFlower; i++) {
    const f = mesh(G.sphereLo, rnd() < 0.6 ? M.flowerPink : M.glowGreen, 0.12, 0.08, 0.12);
    const side = Math.floor(rnd() * 2);
    const u = (rnd() * 2 - 1) * (HW - 1);
    f.position.set(side ? u : -HW + 0.4, 0.5 + rnd() * 3.5, side ? -HW + 0.4 : u);
    group.add(f);
  }

  // ---------------------------------------------------------- 포자 입자
  const N = 420;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rnd() * 2 - 1) * HW;
    pos[i * 3 + 1] = rnd() * WALL_H;
    pos[i * 3 + 2] = (rnd() * 2 - 1) * HW;
    vel[i] = 0.08 + rnd() * 0.25;
  }
  const pgeo = keepGeo(new THREE.BufferGeometry());
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pmat = new THREE.PointsMaterial({ map: TEX.spore, color: sporeCol, size: 0.14 + stage.id * 0.012, transparent: true, opacity: 0.55 + stage.id * 0.05,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  disposables.push(pmat);
  const points = new THREE.Points(pgeo, pmat);
  group.add(points);
  animated.push({ kind: 'spores', geo: pgeo, vel });

  // ---------------------------------------------------------- 몬스터 · 줍기 위치
  const spots = [];
  for (let tries = 0; tries < 400 && spots.length < 40; tries++) {
    const x = (rnd() * 2 - 1) * (HW - 3);
    const z = (rnd() * 2 - 1) * (HW - 4);
    if (z > 12) continue;
    if (!free(x, z, 0.6, spots.map((s) => ({ ...s, r: 1.5 })))) continue;
    spots.push({ x, z });
  }

  return {
    floorNum, stage, group, boxes, circles, animated, lights, minimap, disposables, special, spots,
    room: roomObj, hatch, stairs, fogCol, skyCol, rnd,
    spawnFromBelow: new THREE.Vector3(0, 0, HW - 5),
    spawnFromAbove: new THREE.Vector3(0, 0, -HW + 7.8),
    stairsPos: { x: 0, z: -HW + 6.6 },
    hatchPos: { x: 0, z: HW - 2.6 },
  };
}

export function disposeFloor(f) {
  f.group.parent && f.group.parent.remove(f.group);
  for (const d of f.disposables) d.dispose && d.dispose();
}

// ---------------------------------------------------------- 충돌
export function resolveCircle(p, r, floor, ignoreDoor = false) {
  for (let iter = 0; iter < 2; iter++) {
    for (const b of floor.boxes) {
      if (ignoreDoor && b.tag === 'door') continue;
      if (b.tag === 'door' && b.open) continue;
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      let dx = p.x - cx;
      let dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (r - d);
          p.z += (dz / d) * (r - d);
        } else {
          // 상자 안에 들어간 경우: 가장 가까운 면으로
          const pl = p.x - b.minX, pr = b.maxX - p.x, pb = p.z - b.minZ, pt = b.maxZ - p.z;
          const m = Math.min(pl, pr, pb, pt);
          if (m === pl) p.x = b.minX - r; else if (m === pr) p.x = b.maxX + r; else if (m === pb) p.z = b.minZ - r; else p.z = b.maxZ + r;
        }
      }
    }
    for (const c of floor.circles) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const rr = c.r + r;
      if (d < rr && d > 1e-6) {
        p.x = c.x + (dx / d) * rr;
        p.z = c.z + (dz / d) * rr;
      }
    }
  }
  // 바깥으로 새는 일 방지
  const maxX = floor.room ? ROOM.maxX - r : HW - r;
  p.x = Math.max(-HW + r, Math.min(maxX, p.x));
  if (floor.room && p.x > HW + 0.2) {
    p.z = Math.max(ROOM.minZ + r, Math.min(ROOM.maxZ - r, p.z));
  } else {
    p.z = Math.max(-HW + r, Math.min(HW - r, p.z));
  }
}

export function pointBlocked(x, z, floor) {
  for (const b of floor.boxes) {
    if (b.tag === 'door' && b.open) continue;
    if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
  }
  for (const c of floor.circles) if (Math.hypot(x - c.x, z - c.z) < c.r) return true;
  if (x < -HW || z < -HW || z > HW) return true;
  if (x > HW && !(floor.room && z > ROOM.minZ && z < ROOM.maxZ && x < ROOM.maxX)) return true;
  return false;
}

export const inRoomArea = (p) => p.x > HW + 0.6 && p.z > ROOM.minZ && p.z < ROOM.maxZ;
