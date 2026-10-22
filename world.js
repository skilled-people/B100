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
// 아래 세 객체는 층을 만들 때마다 값이 바뀐다 (위치 랜덤)
export const ROOM = { minX: 27, maxX: 42, minZ: -7, maxZ: 7 };
export const DOOR = { x: 26.5, z: 0, half: 2 };
export const BOSS_POS = { x: 0, z: -5 };

// 벽 방향: 계단의 '등'이 향하는 쪽
const SIDES = {
  N: { back: [0, -1], rot: 0 },
  S: { back: [0, 1], rot: Math.PI },
  W: { back: [-1, 0], rot: Math.PI / 2 },
  E: { back: [1, 0], rot: -Math.PI / 2 },
};
// 회전된 로컬 좌표 → 월드 좌표 (y축 회전)
const rotXZ = (lx, lz, rot) => [lx * Math.cos(rot) + lz * Math.sin(rot), -lx * Math.sin(rot) + lz * Math.cos(rot)];
// 벽 쪽 한 점: side 벽에서 inset 만큼 안쪽, 벽을 따라 u 위치
function wallPoint(side, u, inset) {
  const b = SIDES[side].back;
  if (b[1] !== 0) return { x: u, z: b[1] * (HW - inset) };
  return { x: b[0] * (HW - inset), z: u };
}

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
  const rnd = mulberry32(floorNum * 7919 + 17 + ((state && state.seed) || 0));
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
  const reserved = []; // 계단·입구·문 앞처럼 비워둘 곳 {x,z,r}
  const free = (x, z, r, extra = []) => {
    if (Math.abs(x) > HW - 1.5 - r || Math.abs(z) > HW - 1.5 - r) return false;
    for (const q of reserved) if (Math.hypot(q.x - x, q.z - z) < q.r + r) return false;
    for (const c of circles) if (Math.hypot(c.x - x, c.z - z) < c.r + r + 1.2) return false;
    for (const b of boxes) if (x + r > b.minX - 1 && x - r < b.maxX + 1 && z + r > b.minZ - 1 && z - r < b.maxZ + 1) return false;
    for (const e of extra) if (Math.hypot(e.x - x, e.z - z) < e.r + r) return false;
    return true;
  };

  const boss = isBossFloor(floorNum);
  const room = hasInfectedRoom(floorNum);

  // ---------------------------------------------------------- 랜덤 배치: 방 → 계단(출구) → 입구 → 보스 자리
  if (room) {
    const cz = Math.round((rnd() * 2 - 1) * 14);
    DOOR.z = cz;
    ROOM.minZ = cz - 7; ROOM.maxZ = cz + 7;
    reserved.push({ x: HW - 2.5, z: cz, r: 5 });
  } else { DOOR.z = 0; ROOM.minZ = -7; ROOM.maxZ = 7; }
  const sideList = room ? ['N', 'S', 'W'] : ['N', 'S', 'W', 'E'];
  const stairSide = sideList[Math.floor(rnd() * sideList.length)];
  const stairU = (rnd() * 2 - 1) * (HW - 7);
  const stairInfo = { side: stairSide, rot: SIDES[stairSide].rot, ...wallPoint(stairSide, stairU, 5.2) };
  const inwardS = [-SIDES[stairSide].back[0], -SIDES[stairSide].back[1]];
  const stairsPos = { x: stairInfo.x + inwardS[0] * 1.4, z: stairInfo.z + inwardS[1] * 1.4 };
  reserved.push({ x: stairInfo.x + inwardS[0] * 0.5, z: stairInfo.z + inwardS[1] * 0.5, r: 5.5 });
  // 입구: 계단에서 충분히 떨어진 벽 쪽
  let entry = null;
  for (let t = 0; t < 60 && !entry; t++) {
    const es = ['N', 'S', 'W', 'E'][Math.floor(rnd() * 4)];
    const eu = (rnd() * 2 - 1) * (HW - 6);
    const ep = wallPoint(es, eu, 2.6);
    if (es === 'E' && room && Math.abs(ep.z - DOOR.z) < 10) continue;
    if (Math.hypot(ep.x - stairsPos.x, ep.z - stairsPos.z) < (t < 40 ? 30 : 22)) continue;
    entry = { side: es, ...ep };
  }
  if (!entry) entry = { side: 'S', ...wallPoint('S', 0, 2.6) };
  const inwardE = [-SIDES[entry.side].back[0], -SIDES[entry.side].back[1]];
  const spawnPt = { x: entry.x + inwardE[0] * 2.4, z: entry.z + inwardE[1] * 2.4 };
  reserved.push({ x: entry.x + inwardE[0] * 1.5, z: entry.z + inwardE[1] * 1.5, r: 4.5 });
  if (boss) {
    for (let t = 0; t < 80; t++) {
      const bx = (rnd() * 2 - 1) * (HW - 12);
      const bz = (rnd() * 2 - 1) * (HW - 12);
      if (Math.hypot(bx - spawnPt.x, bz - spawnPt.z) < 16 || Math.hypot(bx - stairsPos.x, bz - stairsPos.z) < 9) continue;
      BOSS_POS.x = bx; BOSS_POS.z = bz;
      break;
    }
    reserved.push({ x: BOSS_POS.x, z: BOSS_POS.z, r: 7 });
  }

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
    const lo = DOOR.z - DOOR.half, hi = DOOR.z + DOOR.half;
    wall(HW + T / 2, (-HW + lo) / 2, T, lo + HW);
    wall(HW + T / 2, (hi + HW) / 2, T, HW - hi);
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
    rf.position.set((ROOM.minX + ROOM.maxX) / 2, 0.005, DOOR.z);
    group.add(rf);
    wall((ROOM.minX + ROOM.maxX) / 2 + 0.5, ROOM.minZ - T / 2, rw + 1.2, T);
    wall((ROOM.minX + ROOM.maxX) / 2 + 0.5, ROOM.maxZ + T / 2, rw + 1.2, T);
    wall(ROOM.maxX + T / 2, DOOR.z, T, rd + T * 2);
    // 문
    const doorGroup = new THREE.Group();
    const slab = mesh(G.box, M.metal, 0.5, 3.6, DOOR.half * 2, 0, 1.8, 0);
    const stripe = mesh(G.box, new THREE.MeshStandardMaterial({ color: 0x9be38a, emissive: 0x3fa34a, emissiveIntensity: 1.2 }), 0.52, 0.2, DOOR.half * 2 - 0.2, 0, 2.9, 0);
    doorGroup.add(slab, stripe);
    doorGroup.position.set(DOOR.x, 0, DOOR.z);
    group.add(doorGroup);
    const doorBox = addBox(DOOR.x - 0.6, DOOR.x + 0.6, DOOR.z - DOOR.half, DOOR.z + DOOR.half, 'door');
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
    heart.position.set(ROOM.maxX - 3, 0, DOOR.z);
    group.add(heart);
    animated.push({ kind: 'heart', obj: heart });
    const rl = new THREE.PointLight(0xff5a8a, 22, 18, 1.5);
    rl.position.set(ROOM.maxX - 3, 3.5, DOOR.z);
    group.add(rl);
    lights.push(rl);
    roomObj = { door: doorGroup, doorBox, stripe, heart, light: rl };
    minimap.rects.push({ minX: ROOM.minX, maxX: ROOM.maxX, minZ: ROOM.minZ, maxZ: ROOM.maxZ, kind: 'room' });
  }

  // ---------------------------------------------------------- 계단(출구) · 입구
  const stairs = makeStairsUp();
  stairs.position.set(stairInfo.x, 0, stairInfo.z);
  stairs.rotation.y = stairInfo.rot;
  group.add(stairs);
  {
    // 로컬 상자 x[-1.8,1.8] z[-5.2,-0.8] 를 회전시켜 AABB 로
    const cs = [[-1.8, -5.2], [1.8, -5.2], [-1.8, -0.8], [1.8, -0.8]].map(([lx, lz]) => rotXZ(lx, lz, stairInfo.rot));
    const xs = cs.map((c) => c[0] + stairInfo.x), zs = cs.map((c) => c[1] + stairInfo.z);
    addBox(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), 'stairs');
    const [lx, lz] = rotXZ(0, -2.7, stairInfo.rot);
    const stairLight = new THREE.PointLight(0xffd29a, 26, 14, 1.6);
    stairLight.position.set(stairInfo.x + lx, 4.5, stairInfo.z + lz);
    group.add(stairLight);
    lights.push(stairLight);
  }
  let hatch = null;
  if (floorNum < 100) {
    hatch = makeHatch();
    hatch.position.set(entry.x, 0, entry.z);
    group.add(hatch);
  }

  // ---------------------------------------------------------- 조명
  const lampSpots = [];
  for (let t = 0; t < 200 && lampSpots.length < 4; t++) {
    const x = (rnd() * 2 - 1) * (HW - 5), z = (rnd() * 2 - 1) * (HW - 5);
    if (!free(x, z, 1)) continue;
    if (lampSpots.some(([a, b]) => Math.hypot(a - x, b - z) < 16)) continue;
    lampSpots.push([x, z]);
  }
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

  // ---------------------------------------------------------- 시설 (빈 자리에 랜덤 배치, 앞면은 카메라 쪽 +z)
  const special = {};
  const place = (w, d, front = 1.3) => {
    for (let t = 0; t < 300; t++) {
      const x = (rnd() * 2 - 1) * (HW - 3 - w / 2);
      const z = (rnd() * 2 - 1) * (HW - 3 - d / 2);
      if (!free(x, z, Math.max(w, d) / 2 + 0.4)) continue;
      if (!free(x, z + d / 2 + front, 0.8)) continue;
      reserved.push({ x, z: z + d / 2 + front * 0.6, r: 1.6 });
      return { x, z };
    }
    return null;
  };
  if (isStationFloor(floorNum)) {
    const tp = place(1.2, 0.8);
    if (tp) {
      const term = makeTerminal(false);
      term.position.set(tp.x, 0, tp.z);
      group.add(term);
      addBox(tp.x - 0.6, tp.x + 0.6, tp.z - 0.4, tp.z + 0.4, 'terminal');
      special.terminal = { x: tp.x, z: tp.z + 1.3 };
      minimap.circles.push({ x: tp.x, z: tp.z, kind: 'terminal' });
    }
    const forge = hasForge(floorNum);
    const bp = place(forge ? 5.0 : 2.4, 1.1);
    if (bp) {
      const bx = forge ? bp.x - 1.3 : bp.x;
      const wb = makeWorkbench(forge);
      wb.position.set(bx, 0, bp.z);
      group.add(wb);
      addBox(bx - 1.1, bx + 1.1, bp.z - 0.5, bp.z + 0.5, 'bench');
      special.workbench = { x: bx, z: bp.z + 1.4 };
      if (forge) {
        addBox(bx + 1.8, bx + 3.9, bp.z - 0.6, bp.z + 0.6, 'forge');
        special.forge = { x: bx + 2.8, z: bp.z + 1.4 };
        const fl = new THREE.PointLight(0xff7a30, 14, 9, 1.6);
        fl.position.set(bx + 2.4, 1.6, bp.z);
        group.add(fl);
        lights.push(fl);
      }
    }
  }
  if (DISPLAY_SHOP[floorNum]) {
    const dp = place(4.4, 1.0);
    if (dp) {
      const ds = makeTerminal(true);
      ds.position.set(dp.x - 1.4, 0, dp.z);
      group.add(ds);
      addBox(dp.x - 2.0, dp.x - 0.8, dp.z - 0.4, dp.z + 0.4, 'display');
      special.display = { x: dp.x - 1.4, z: dp.z + 1.3 };
      const glass = mesh(G.box, M.glass, 2.2, 1.4, 0.9, dp.x + 1.4, 0.7, dp.z);
      group.add(glass);
      addBox(dp.x + 0.3, dp.x + 2.5, dp.z - 0.5, dp.z + 0.5, 'case');
      minimap.circles.push({ x: dp.x - 1.4, z: dp.z, kind: 'shop' });
    }
  }
  if (recordingByFloor[floorNum]) {
    const rp = place(0.8, 0.6, 1.2);
    if (rp) {
      const rec = makeRecorder();
      rec.position.set(rp.x, 0, rp.z);
      group.add(rec);
      addBox(rp.x - 0.4, rp.x + 0.4, rp.z - 0.3, rp.z + 0.3, 'recorder');
      special.recorder = { x: rp.x, z: rp.z + 1.2 };
      animated.push({ kind: 'led', obj: rec.userData.led });
      minimap.circles.push({ x: rp.x, z: rp.z, kind: 'recorder' });
    }
  }
  if (floorNum === 2) {
    const lp = place(3.2, 1.0, 1.4) || { x: -16, z: -12 };
    const lk = makeLocker();
    lk.position.set(lp.x, 0, lp.z);
    group.add(lk);
    addBox(lp.x - 1.5, lp.x + 1.5, lp.z - 0.5, lp.z + 0.5, 'locker');
    special.warehouse = { x: lp.x, z: lp.z + 1.4 };
  }
  if (isSurvivorFloor(floorNum)) {
    for (let t = 0; t < 200; t++) {
      const x = (rnd() * 2 - 1) * (HW - 5), z = (rnd() * 2 - 1) * (HW - 5);
      if (!free(x, z, 1.2) || Math.hypot(x - spawnPt.x, z - spawnPt.z) < 8) continue;
      special.survivor = { x, z };
      break;
    }
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
    if (Math.hypot(x - spawnPt.x, z - spawnPt.z) < 11) continue;
    if (!free(x, z, 0.6, spots.map((s) => ({ ...s, r: 1.5 })))) continue;
    spots.push({ x, z });
  }

  return {
    floorNum, stage, group, boxes, circles, animated, lights, minimap, disposables, special, spots,
    room: roomObj, hatch, stairs, fogCol, skyCol, rnd,
    spawnFromBelow: new THREE.Vector3(spawnPt.x, 0, spawnPt.z),
    spawnFromAbove: new THREE.Vector3(stairsPos.x + inwardS[0] * 1.4, 0, stairsPos.z + inwardS[1] * 1.4),
    stairsPos,
    stairsSide: stairSide,
    stairsRot: stairInfo.rot,
    hatchPos: { x: entry.x, z: entry.z },
    doorZ: DOOR.z,
    bossPos: { ...BOSS_POS },
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
