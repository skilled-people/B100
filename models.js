// =====================================================================
//  3D 모델 빌더 — 외부 모델 파일 없이 기본 도형으로 조립한다.
// =====================================================================
import * as THREE from '../lib/three.module.js';

export const TEX = {};
const loader = new THREE.TextureLoader();

const TEX_LIST = {
  rock: 'rock_wall.png', rockN: 'rock_wall_n.png', floor: 'floor_concrete.png', floorN: 'floor_concrete_n.png',
  metal: 'metal_plate.png', metalN: 'metal_plate_n.png', vine: 'vine.png', moss: 'moss_patch.png',
  spore: 'spore.png', ring: 'decal_ring.png', shadow: 'blob_shadow.png',
};

export function loadTextures(onProgress) {
  const keys = Object.keys(TEX_LIST);
  let done = 0;
  return Promise.all(keys.map((k) => new Promise((resolve) => {
    loader.load('assets/textures/' + TEX_LIST[k], (t) => {
      if (!k.endsWith('N') && k !== 'spore' && k !== 'ring' && k !== 'shadow') t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      TEX[k] = t;
      done++;
      onProgress && onProgress(done / keys.length);
      resolve();
    }, undefined, () => { done++; resolve(); });
  })));
}

// ------------------------------------------------------------- 공용 지오메트리
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 18, 14),
  sphereLo: new THREE.SphereGeometry(1, 10, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 7),
  cone: new THREE.ConeGeometry(1, 1, 10),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 6, 12),
  plane: new THREE.PlaneGeometry(1, 1),
  vineArc: new THREE.TorusGeometry(1, 0.075, 6, 18, Math.PI * 1.35),
  vineArc2: new THREE.TorusGeometry(1, 0.06, 6, 14, Math.PI * 0.9),
  leaf: new THREE.ConeGeometry(0.5, 1.4, 4),
  petal: new THREE.SphereGeometry(1, 8, 6),
  wing: (() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.quadraticCurveTo(0.6, 0.55, 1.2, 0.25); s.quadraticCurveTo(0.9, -0.05, 1.0, -0.35); s.quadraticCurveTo(0.45, -0.2, 0, 0);
    const g = new THREE.ShapeGeometry(s, 8);
    return g;
  })(),
  batWing: (() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(0.5, 0.3); s.lineTo(1.1, 0.15); s.lineTo(0.95, -0.15); s.lineTo(0.7, -0.05); s.lineTo(0.5, -0.25); s.lineTo(0.3, -0.05); s.lineTo(0, -0.1);
    return new THREE.ShapeGeometry(s);
  })(),
};

// ------------------------------------------------------------- 공용 재질
const std = (o) => new THREE.MeshStandardMaterial(o);
export const M = {};
export function initMaterials() {
  M.rock = std({ map: TEX.rock, normalMap: TEX.rockN, roughness: 0.95, metalness: 0.0 });
  M.floor = std({ map: TEX.floor, normalMap: TEX.floorN, roughness: 0.88, metalness: 0.02 });
  M.metal = std({ map: TEX.metal, normalMap: TEX.metalN, roughness: 0.55, metalness: 0.6 });
  M.metalDark = std({ color: 0x3a3e42, roughness: 0.5, metalness: 0.7 });
  M.rust = std({ color: 0x6b3a22, roughness: 0.8, metalness: 0.3 });
  M.wood = std({ color: 0x6b4a30, roughness: 0.85 });
  M.woodLight = std({ color: 0x9a7650, roughness: 0.8 });
  M.vine = std({ map: TEX.vine, color: 0x9fbf7c, roughness: 0.8 });
  M.vineDark = std({ map: TEX.vine, color: 0x5d7a46, roughness: 0.85 });
  M.leaf = std({ color: 0x4e7d3a, roughness: 0.7, side: THREE.DoubleSide });
  M.flowerPink = std({ color: 0xe07aa8, emissive: 0xb0306a, emissiveIntensity: 0.9, roughness: 0.5 });
  M.flowerGold = std({ color: 0xf2c35a, emissive: 0xa06a10, emissiveIntensity: 0.9, roughness: 0.5 });
  M.glowGreen = std({ color: 0x9be38a, emissive: 0x3fa34a, emissiveIntensity: 1.4, roughness: 0.6 });
  M.lamp = std({ color: 0xffe2a8, emissive: 0xffb54a, emissiveIntensity: 2.2 });
  M.screen = std({ color: 0x1a3a3a, emissive: 0x2aa39a, emissiveIntensity: 1.0, roughness: 0.3 });
  M.screenAmber = std({ color: 0x3a2a10, emissive: 0xf2b33d, emissiveIntensity: 1.0, roughness: 0.3 });
  M.red = std({ color: 0xaa2222, emissive: 0xff2222, emissiveIntensity: 1.5 });
  M.heart = std({ color: 0xc0406a, emissive: 0x801030, emissiveIntensity: 1.2, roughness: 0.4 });
  M.heartShield = new THREE.MeshBasicMaterial({ color: 0x9be38a, transparent: true, opacity: 0.18, depthWrite: false });
  M.glass = std({ color: 0xbfe0e8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.6 });
  M.black = std({ color: 0x111111, roughness: 0.6 });
  M.white = std({ color: 0xdedad0, roughness: 0.7 });
  M.shaft = new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  M.shadow = new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false });
  M.web = new THREE.MeshBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
}

const colorCache = new Map();
export function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!colorCache.has(key)) colorCache.set(key, std({ color, roughness: 0.75, ...extra }));
  return colorCache.get(key);
}

export function mesh(geo, material, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

// 감염 단계에 따라 색을 초록빛으로 물들인다
function infect(color, amount) {
  const c = new THREE.Color(color);
  c.lerp(new THREE.Color(0x4f7a3a), Math.min(0.75, amount * 0.8));
  return c.getHex();
}

// ------------------------------------------------------------- 감염 장식
export function addInfection(target, amount, flower, radius = 0.35, height = 1.6, seed = 1) {
  const group = new THREE.Group();
  group.name = 'infection';
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const nVine = Math.round(2 + amount * 10);
  for (let i = 0; i < nVine; i++) {
    const v = new THREE.Mesh(rnd() < 0.5 ? G.vineArc : G.vineArc2, rnd() < 0.5 ? M.vine : M.vineDark);
    const r = radius * (1.02 + rnd() * 0.15);
    v.scale.setScalar(r);
    v.position.y = height * (0.15 + rnd() * 0.8);
    v.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.9, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.6);
    group.add(v);
  }
  const nLeaf = Math.round(amount * 14);
  for (let i = 0; i < nLeaf; i++) {
    const l = new THREE.Mesh(G.leaf, M.leaf);
    const a = rnd() * Math.PI * 2;
    l.scale.setScalar(0.08 + rnd() * 0.08);
    l.position.set(Math.cos(a) * radius * 1.05, height * (0.1 + rnd() * 0.9), Math.sin(a) * radius * 1.05);
    l.rotation.set(rnd() * 2, a, rnd() * 2);
    group.add(l);
  }
  const nFlower = Math.round(flower * 6);
  for (let i = 0; i < nFlower; i++) {
    const f = new THREE.Group();
    const pm = rnd() < 0.6 ? M.flowerPink : M.flowerGold;
    for (let p = 0; p < 5; p++) {
      const petal = new THREE.Mesh(G.petal, pm);
      const pa = p / 5 * Math.PI * 2;
      petal.scale.set(0.06, 0.02, 0.035);
      petal.position.set(Math.cos(pa) * 0.05, 0, Math.sin(pa) * 0.05);
      petal.rotation.y = -pa;
      f.add(petal);
    }
    const core = new THREE.Mesh(G.sphereLo, M.flowerGold);
    core.scale.setScalar(0.03);
    f.add(core);
    const a = rnd() * Math.PI * 2;
    f.position.set(Math.cos(a) * radius * 1.08, height * (0.3 + rnd() * 0.7), Math.sin(a) * radius * 1.08);
    f.rotation.set(Math.PI / 2 - 0.4, 0, a);
    f.scale.setScalar(1 + rnd() * 1.4);
    group.add(f);
  }
  target.add(group);
  return group;
}

// ------------------------------------------------------------- 무기 모델 (손잡이가 원점, +Y 방향)
export function makeWeapon(model) {
  const g = new THREE.Group();
  const add = (geo, m, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const o = mesh(geo, m, sx, sy, sz, x, y, z);
    o.rotation.set(rx, ry, rz);
    g.add(o);
    return o;
  };
  switch (model) {
    case 'stick':
      add(G.cylLo, M.wood, 0.035, 0.9, 0.035, 0, 0.4, 0);
      add(G.cylLo, M.wood, 0.02, 0.25, 0.02, 0.06, 0.6, 0, 0, 0, -0.6);
      break;
    case 'axe_stone':
      add(G.cylLo, M.wood, 0.035, 0.75, 0.035, 0, 0.35, 0);
      add(G.sphereLo, mat(0x77706a), 0.16, 0.1, 0.05, 0.1, 0.68, 0);
      add(G.vineArc2, M.vineDark, 0.05, 0.05, 0.05, 0, 0.66, 0, Math.PI / 2);
      break;
    case 'axe_iron':
      add(G.cylLo, M.wood, 0.035, 0.85, 0.035, 0, 0.4, 0);
      add(G.box, M.metalDark, 0.24, 0.16, 0.03, 0.12, 0.76, 0);
      break;
    case 'axe_fire':
      add(G.cylLo, mat(0xb03024), 0.04, 1.0, 0.04, 0, 0.48, 0);
      add(G.box, M.metalDark, 0.3, 0.2, 0.035, 0.15, 0.9, 0);
      add(G.cone, M.metalDark, 0.05, 0.18, 0.05, -0.08, 0.9, 0, 0, 0, Math.PI / 2);
      break;
    case 'broom':
      add(G.cylLo, M.woodLight, 0.03, 1.4, 0.03, 0, 0.65, 0);
      add(G.cone, mat(0xc9a65a), 0.16, 0.35, 0.1, 0, 1.4, 0, Math.PI);
      break;
    case 'pen':
      add(G.cylLo, mat(0x2a4aa0), 0.015, 0.16, 0.015, 0, 0.08, 0);
      add(G.cone, M.metalDark, 0.012, 0.03, 0.012, 0, 0.175, 0);
      break;
    case 'bokken':
      add(G.box, M.woodLight, 0.04, 1.05, 0.025, 0, 0.55, 0, 0, 0, 0.04);
      add(G.cyl, M.wood, 0.05, 0.02, 0.05, 0, 0.22, 0);
      break;
    case 'extinguisher':
      add(G.cyl, mat(0xc0281e, { metalness: 0.3, roughness: 0.4 }), 0.09, 0.5, 0.09, 0, 0.3, 0);
      add(G.cylLo, M.black, 0.02, 0.16, 0.02, 0, 0.6, 0);
      add(G.box, M.metalDark, 0.12, 0.03, 0.04, 0.04, 0.66, 0);
      break;
    case 'mace':
      add(G.cylLo, M.wood, 0.045, 0.85, 0.045, 0, 0.4, 0);
      add(G.sphereLo, M.metalDark, 0.13, 0.13, 0.13, 0, 0.85, 0);
      for (let i = 0; i < 6; i++) add(G.cone, M.metal, 0.03, 0.08, 0.03, Math.cos(i) * 0.12, 0.85 + Math.sin(i * 2) * 0.08, Math.sin(i) * 0.12, Math.sin(i), 0, Math.cos(i));
      break;
    case 'bottle':
      add(G.cyl, mat(0xb8c0c6, { metalness: 0.9, roughness: 0.25 }), 0.07, 0.42, 0.07, 0, 0.3, 0);
      add(G.cyl, M.black, 0.05, 0.06, 0.05, 0, 0.54, 0);
      break;
    case 'tumbler':
      add(G.cyl, mat(0x4d7a8a, { metalness: 0.6, roughness: 0.35 }), 0.065, 0.3, 0.065, 0, 0.22, 0);
      add(G.cyl, M.black, 0.06, 0.04, 0.06, 0, 0.39, 0);
      break;
    case 'shard':
      add(G.cone, M.glass, 0.05, 0.3, 0.015, 0, 0.18, 0);
      add(G.box, mat(0x777777), 0.06, 0.06, 0.03, 0, 0.02, 0);
      break;
    case 'wire': {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.15, 0.5, 0.05), new THREE.Vector3(-0.1, 1.0, -0.05), new THREE.Vector3(0.12, 1.5, 0)]);
      const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.018, 5), M.black);
      g.add(t);
      break;
    }
    case 'whip': {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 0.8, 0), new THREE.Vector3(-0.15, 1.8, 0.05), new THREE.Vector3(0.1, 2.8, 0)]);
      add(G.cylLo, mat(0x3a2418), 0.03, 0.25, 0.03, 0, 0.0, 0);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.014, 4), mat(0x4a2e1c)));
      break;
    }
    case 'stock':
      add(G.box, M.wood, 0.07, 0.4, 0.04, 0, 0.55, 0);
      add(G.box, M.metalDark, 0.04, 0.5, 0.03, 0, 0.15, 0);
      break;
    case 'speaker':
      add(G.box, M.black, 0.32, 0.4, 0.22, 0, 0.32, 0);
      add(G.cyl, mat(0x333333), 0.11, 0.02, 0.11, 0, 0.36, 0.115, Math.PI / 2);
      add(G.box, M.metalDark, 0.04, 0.12, 0.04, 0, 0.06, 0);
      break;
    case 'spear_s':
      add(G.cylLo, M.woodLight, 0.03, 1.7, 0.03, 0, 0.8, 0);
      add(G.cone, M.glass, 0.05, 0.28, 0.015, 0, 1.75, 0);
      add(G.cyl, mat(0x999999), 0.04, 0.1, 0.04, 0, 1.58, 0);
      break;
    case 'spear':
      add(G.cylLo, M.metalDark, 0.03, 1.8, 0.03, 0, 0.85, 0);
      add(G.cone, M.metal, 0.06, 0.38, 0.03, 0, 1.92, 0);
      break;
    case 'tv':
      add(G.box, mat(0x2a2a2a), 0.56, 0.42, 0.3, 0, 0.42, 0);
      add(G.box, M.screen, 0.46, 0.33, 0.02, 0, 0.42, 0.16);
      add(G.box, M.metalDark, 0.04, 0.22, 0.04, 0, 0.1, 0);
      break;
    case 'katana':
      add(G.box, mat(0xd8dde2, { metalness: 0.95, roughness: 0.15 }), 0.035, 1.0, 0.008, 0, 0.72, 0, 0, 0, 0.03);
      add(G.cyl, mat(0xa08030, { metalness: 0.8 }), 0.06, 0.012, 0.06, 0, 0.21, 0);
      add(G.box, mat(0x1b1b2a), 0.04, 0.26, 0.03, 0, 0.07, 0);
      break;
    default:
      add(G.cylLo, M.wood, 0.035, 0.8, 0.035, 0, 0.4, 0);
  }
  return g;
}

export function makeProjectile(model) {
  const g = new THREE.Group();
  const a = (geo, m, sx, sy, sz, x = 0, y = 0, z = 0) => { const o = mesh(geo, m, sx, sy, sz, x, y, z); g.add(o); return o; };
  switch (model) {
    case 'pebble': a(G.sphereLo, mat(0x8a8178), 0.07, 0.06, 0.07); break;
    case 'stone': a(G.sphereLo, mat(0x77706a), 0.13, 0.1, 0.12); break;
    case 'ball':
      a(G.sphere, M.white, 0.1, 0.1, 0.1);
      a(G.vineArc2, mat(0xb03030), 0.1, 0.1, 0.1).rotation.x = 1.2;
      break;
    case 'lump': a(G.box, M.rust, 0.2, 0.15, 0.17); break;
    case 'shard': a(G.cone, M.glass, 0.06, 0.25, 0.02); break;
    case 'dagger': a(G.box, M.metal, 0.03, 0.35, 0.01); a(G.box, M.black, 0.03, 0.1, 0.02, 0, -0.2, 0); break;
    case 'pen': a(G.cylLo, mat(0x2a4aa0), 0.015, 0.18, 0.015); break;
    case 'bomb': a(G.sphereLo, M.glass, 0.14, 0.18, 0.14); a(G.sphereLo, M.glowGreen, 0.1, 0.12, 0.1); break;
    case 'bullet': a(G.cylLo, M.lamp, 0.025, 0.4, 0.025).rotation.x = Math.PI / 2; break;
    case 'chair_p':
      a(G.box, mat(0x3a6ea0), 0.45, 0.05, 0.45, 0, 0.0, 0);
      a(G.box, mat(0x3a6ea0), 0.45, 0.45, 0.05, 0, 0.22, -0.2);
      break;
    case 'chair_i':
      a(G.box, M.metalDark, 0.45, 0.05, 0.45);
      a(G.box, M.metalDark, 0.45, 0.45, 0.05, 0, 0.22, -0.2);
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) a(G.cylLo, M.metalDark, 0.02, 0.4, 0.02, x, -0.2, z);
      break;
    case 'desk':
      a(G.box, M.woodLight, 1.0, 0.06, 0.6);
      for (const [x, z] of [[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]]) a(G.box, M.metalDark, 0.05, 0.6, 0.05, x, -0.3, z);
      break;
    case 'spore': a(G.sphereLo, M.glowGreen, 0.22, 0.22, 0.22); break;
    case 'sting': a(G.cone, mat(0xf2c35a, { emissive: 0x805010 }), 0.06, 0.4, 0.06).rotation.x = Math.PI / 2; break;
    case 'thorn': a(G.cone, mat(0x5d7a46, { emissive: 0x203010 }), 0.07, 0.5, 0.07).rotation.x = Math.PI / 2; break;
    default: a(G.sphereLo, mat(0x888888), 0.1, 0.1, 0.1);
  }
  return g;
}

// ------------------------------------------------------------- 캐릭터
// rig: { root, body, head, legL, legR, armL, armR, hand, wings[], shape }
function humanRig(opts) {
  const { skin = 0xd9b08c, shirt = 0x556070, pants = 0x2e3238, hair = 0x2a2420, scale = 1, coat = false, hood = false, helmet = null } = opts;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legMat = mat(pants);
  const legL = new THREE.Group(); legL.position.set(-0.13, 0.86, 0);
  const legR = new THREE.Group(); legR.position.set(0.13, 0.86, 0);
  legL.add(mesh(G.capsule, legMat, 0.2, 0.62, 0.2, 0, -0.44, 0));
  legR.add(mesh(G.capsule, legMat, 0.2, 0.62, 0.2, 0, -0.44, 0));
  legL.add(mesh(G.box, mat(0x2a2522), 0.16, 0.08, 0.26, 0, -0.84, 0.04));
  legR.add(mesh(G.box, mat(0x2a2522), 0.16, 0.08, 0.26, 0, -0.84, 0.04));
  body.add(legL, legR);
  const torso = mesh(G.capsule, mat(shirt), 0.5, 0.52, 0.32, 0, 1.22, 0);
  body.add(torso);
  if (coat) {
    body.add(mesh(G.cyl, M.white, 0.3, 0.75, 0.22, 0, 1.0, 0));
  }
  if (hood) {
    body.add(mesh(G.sphere, mat(shirt), 0.2, 0.14, 0.18, 0, 1.56, -0.1));
  }
  const head = new THREE.Group();
  head.position.set(0, 1.74, 0);
  head.add(mesh(G.sphere, mat(skin), 0.21, 0.24, 0.22));
  head.add(mesh(G.sphere, mat(hair), 0.22, 0.14, 0.23, 0, 0.1, -0.02));
  head.add(mesh(G.sphereLo, M.black, 0.025, 0.03, 0.02, -0.075, 0.02, 0.2));
  head.add(mesh(G.sphereLo, M.black, 0.025, 0.03, 0.02, 0.075, 0.02, 0.2));
  if (helmet === 'hard') {
    head.add(mesh(G.sphere, mat(0xd8a23a), 0.25, 0.15, 0.26, 0, 0.1, 0));
    head.add(mesh(G.cyl, M.lamp, 0.04, 0.04, 0.04, 0, 0.14, 0.24, Math.PI / 2));
  }
  body.add(head);
  const armMat = mat(coat ? 0xdedad0 : shirt);
  const armL = new THREE.Group(); armL.position.set(-0.32, 1.48, 0);
  const armR = new THREE.Group(); armR.position.set(0.32, 1.48, 0);
  armL.add(mesh(G.capsule, armMat, 0.15, 0.48, 0.15, 0, -0.3, 0));
  armR.add(mesh(G.capsule, armMat, 0.15, 0.48, 0.15, 0, -0.3, 0));
  armL.add(mesh(G.sphereLo, mat(skin), 0.08, 0.08, 0.08, 0, -0.62, 0));
  armR.add(mesh(G.sphereLo, mat(skin), 0.08, 0.08, 0.08, 0, -0.62, 0));
  const hand = new THREE.Group();
  hand.position.set(0, -0.62, 0.02);
  hand.rotation.x = Math.PI / 2;
  armR.add(hand);
  body.add(armL, armR);
  root.scale.setScalar(scale);
  return { root, body, head, legL, legR, armL, armR, hand, torso, height: 1.95 * scale, radius: 0.36 * scale, shape: 'human' };
}

function quadRig(opts) {
  const { color = 0x6a5a4a, len = 1, h = 0.6, scale = 1, headScale = 1, tail = true, tusks = false, spikes = false, ears = false } = opts;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const c = mat(color);
  const trunk = mesh(G.capsule, c, h * 0.9, len, h * 0.85, 0, h * 1.1, 0);
  trunk.rotation.x = Math.PI / 2;
  body.add(trunk);
  const head = new THREE.Group();
  head.position.set(0, h * 1.25, len * 0.75);
  head.add(mesh(G.sphere, c, h * 0.5 * headScale, h * 0.45 * headScale, h * 0.6 * headScale));
  const snout = mesh(G.cone, mat(0x2a2420), h * 0.18, h * 0.4, h * 0.18, 0, -0.03, h * 0.55 * headScale);
  snout.rotation.x = Math.PI / 2;
  head.add(snout);
  head.add(mesh(G.sphereLo, M.red, 0.04, 0.04, 0.04, -h * 0.2, h * 0.12, h * 0.42));
  head.add(mesh(G.sphereLo, M.red, 0.04, 0.04, 0.04, h * 0.2, h * 0.12, h * 0.42));
  if (ears) {
    head.add(mesh(G.cone, c, 0.08, 0.2, 0.06, -h * 0.25, h * 0.4, 0));
    head.add(mesh(G.cone, c, 0.08, 0.2, 0.06, h * 0.25, h * 0.4, 0));
  }
  if (tusks) {
    const t1 = mesh(G.cone, M.white, 0.05, 0.3, 0.05, -h * 0.25, -h * 0.1, h * 0.5); t1.rotation.x = -0.6; head.add(t1);
    const t2 = mesh(G.cone, M.white, 0.05, 0.3, 0.05, h * 0.25, -h * 0.1, h * 0.5); t2.rotation.x = -0.6; head.add(t2);
  }
  body.add(head);
  if (spikes) {
    for (let i = 0; i < 9; i++) {
      const s = mesh(G.cone, M.vineDark, 0.06, 0.4, 0.06, (i % 2 - 0.5) * 0.2, h * 1.6, -len * 0.45 + i * len * 0.12);
      s.rotation.x = -0.4;
      body.add(s);
    }
  }
  if (tail) {
    const tl = mesh(G.cylLo, c, 0.03, len * 0.8, 0.03, 0, h * 1.1, -len * 0.95);
    tl.rotation.x = Math.PI / 2 + 0.4;
    body.add(tl);
  }
  const legs = [];
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const lg = new THREE.Group();
    lg.position.set(x * h * 0.45, h * 0.9, z * len * 0.45);
    lg.add(mesh(G.capsule, c, h * 0.28, h * 0.8, h * 0.28, 0, -h * 0.45, 0));
    body.add(lg);
    legs.push(lg);
  }
  root.scale.setScalar(scale);
  return { root, body, head, legs, height: h * 2 * scale, radius: Math.max(len, h) * 0.6 * scale, shape: 'quad' };
}

function flyerRig(opts) {
  const { color = 0x3a3030, wingColor = 0x2a2020, wingGeo = G.batWing, span = 1, scale = 1, stripes = false, glow = false, beak = false } = opts;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh(G.sphere, mat(color), 0.18, 0.16, 0.3));
  if (stripes) {
    body.add(mesh(G.sphere, mat(0x1a1a1a), 0.185, 0.165, 0.08, 0, 0, -0.06));
    body.add(mesh(G.sphere, mat(0x1a1a1a), 0.16, 0.14, 0.06, 0, 0, -0.2));
    body.add(mesh(G.sphere, mat(0xe0b030), 0.2, 0.18, 0.2, 0, 0, -0.26));
  }
  const head = mesh(G.sphere, mat(color), 0.13, 0.12, 0.13, 0, 0.04, 0.26);
  body.add(head);
  head.add(mesh(G.sphereLo, M.red, 0.25, 0.25, 0.25, -0.45, 0.25, 0.75));
  head.add(mesh(G.sphereLo, M.red, 0.25, 0.25, 0.25, 0.45, 0.25, 0.75));
  if (beak) {
    const b = mesh(G.cone, mat(0x2a2a2a), 0.05, 0.22, 0.05, 0, 0.0, 0.42);
    b.rotation.x = Math.PI / 2;
    body.add(b);
  }
  const wmat = new THREE.MeshStandardMaterial({ color: wingColor, side: THREE.DoubleSide, roughness: 0.6, transparent: glow, opacity: glow ? 0.85 : 1, emissive: glow ? wingColor : 0x000000, emissiveIntensity: glow ? 0.35 : 0 });
  const wingL = new THREE.Group();
  const wingR = new THREE.Group();
  const wl = new THREE.Mesh(wingGeo, wmat);
  wl.scale.setScalar(span);
  wl.rotation.x = -Math.PI / 2;
  const wr = wl.clone();
  wr.scale.x = -span;
  wingL.add(wl); wingR.add(wr);
  wingL.position.set(0.08, 0.04, 0); wingR.position.set(-0.08, 0.04, 0);
  // 왼쪽 날개는 +x, 오른쪽은 -x 로 펼친다
  body.add(wingL, wingR);
  root.scale.setScalar(scale);
  return { root, body, head, wings: [wingL, wingR], height: 0.4 * scale, radius: 0.45 * scale * span, shape: 'flyer', wingMat: wmat };
}

function blobRig(opts) {
  const { color = 0x6a7a50, scale = 1 } = opts;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const c = mat(color);
  const parts = [[0, 0.7, 0, 0.7], [0.4, 0.55, 0.2, 0.5], [-0.35, 0.6, -0.15, 0.55], [0.1, 1.2, -0.1, 0.45], [-0.2, 0.4, 0.35, 0.4]];
  for (const [x, y, z, r] of parts) body.add(mesh(G.sphere, c, r, r * 0.95, r, x, y, z));
  // 엉킨 몸에서 튀어나온 팔다리
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const limb = mesh(G.capsule, mat(0xc49a7a), 0.14, 0.6, 0.14, Math.cos(a) * 0.65, 0.6 + (i % 3) * 0.2, Math.sin(a) * 0.65);
    limb.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    body.add(limb);
  }
  for (let i = 0; i < 3; i++) {
    body.add(mesh(G.sphere, mat(0xd9b08c), 0.14, 0.17, 0.14, -0.3 + i * 0.3, 1.0 + (i % 2) * 0.25, 0.5));
  }
  root.scale.setScalar(scale);
  return { root, body, height: 1.6 * scale, radius: 0.85 * scale, shape: 'blob' };
}

function spiderRig(opts) {
  const { scale = 1 } = opts;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const c = mat(0x3a4030);
  body.add(mesh(G.sphere, c, 0.45, 0.35, 0.55, 0, 0.6, -0.4));
  body.add(mesh(G.sphere, c, 0.3, 0.25, 0.3, 0, 0.55, 0.25));
  for (let i = 0; i < 4; i++) body.add(mesh(G.sphereLo, M.red, 0.04, 0.04, 0.04, -0.12 + i * 0.08, 0.66, 0.52));
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? 1 : -1;
    const k = i % 4;
    const lg = new THREE.Group();
    lg.position.set(side * 0.2, 0.6, 0.35 - k * 0.22);
    const upper = mesh(G.cylLo, c, 0.04, 0.7, 0.04, side * 0.3, 0.2, 0);
    upper.rotation.z = -side * 1.0;
    const lower = mesh(G.cylLo, c, 0.03, 0.8, 0.03, side * 0.75, -0.15, 0);
    lower.rotation.z = side * 0.45;
    lg.add(upper, lower);
    lg.rotation.y = side * (k - 1.5) * 0.35;
    body.add(lg);
    legs.push(lg);
  }
  root.scale.setScalar(scale);
  return { root, body, legs, height: 1.0 * scale, radius: 1.0 * scale, shape: 'spider' };
}

function treeRig(opts) {
  const { scale = 1 } = opts;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bark = mat(0x4a3a2a);
  body.add(mesh(G.cyl, bark, 0.45, 2.2, 0.45, 0, 1.1, 0));
  body.add(mesh(G.sphere, bark, 0.5, 0.4, 0.5, 0, 2.2, 0));
  body.add(mesh(G.sphereLo, M.glowGreen, 0.08, 0.1, 0.05, -0.15, 1.9, 0.43));
  body.add(mesh(G.sphereLo, M.glowGreen, 0.08, 0.1, 0.05, 0.15, 1.9, 0.43));
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const br = mesh(G.cylLo, bark, 0.1, 1.4, 0.1, Math.cos(a) * 0.6, 2.4, Math.sin(a) * 0.6);
    br.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
    body.add(br);
    const rt = mesh(G.cylLo, bark, 0.12, 1.2, 0.12, Math.cos(a + 0.6) * 0.7, 0.15, Math.sin(a + 0.6) * 0.7);
    rt.rotation.set(Math.sin(a + 0.6) * 1.2, 0, -Math.cos(a + 0.6) * 1.2);
    body.add(rt);
  }
  body.add(mesh(G.sphere, M.leaf, 1.1, 0.7, 1.1, 0, 3.0, 0));
  root.scale.setScalar(scale);
  return { root, body, height: 3.2 * scale, radius: 0.8 * scale, shape: 'tree' };
}

function swarmRig(opts) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const flies = [];
  const colors = [0xe07aa8, 0xf2c35a, 0x9be38a, 0xc89ae0];
  for (let i = 0; i < 46; i++) {
    const f = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: colors[i % 4], emissive: colors[i % 4], emissiveIntensity: 0.6, side: THREE.DoubleSide });
    const wl = new THREE.Mesh(G.wing, m); wl.scale.setScalar(0.32); wl.rotation.x = -Math.PI / 2;
    const wr = wl.clone(); wr.scale.x = -0.32;
    f.add(wl, wr);
    f.userData = { a: Math.random() * 6.28, r: 0.6 + Math.random() * 2.2, y: Math.random() * 1.8 - 0.6, s: 0.6 + Math.random() * 1.4, wl, wr };
    body.add(f);
    flies.push(f);
  }
  return { root, body, flies, height: 1.5, radius: 2.4, shape: 'swarm' };
}

// ------------------------------------------------------------- 엔티티 모델 팩토리
export function buildCharacter(shape, opts = {}) {
  const inf = opts.infection ?? 0;
  const fl = opts.flower ?? 0;
  const sc = opts.scale ?? 1;
  let rig;
  switch (shape) {
    case 'player':
      rig = humanRig({ shirt: 0xc8743a, pants: 0x34404c, hair: 0x241e1a, skin: 0xe2bc98, hood: true });
      rig.body.add(mesh(G.box, mat(0x4a5040), 0.34, 0.42, 0.18, 0, 1.25, -0.24)); // 가방
      return rig;
    case 'father': {
      rig = humanRig({ shirt: 0x50607a, coat: true, scale: sc, skin: 0xd6a888, hair: 0x3a3028 });
      const gl = new THREE.Group();
      const lens = new THREE.TorusGeometry(0.06, 0.012, 6, 16);
      gl.add(mesh(lens, M.black, 1, 1, 1, -0.075, 0.02, 0.21));
      gl.add(mesh(lens, M.black, 1, 1, 1, 0.075, 0.02, 0.21));
      gl.add(mesh(G.box, M.black, 0.04, 0.012, 0.012, 0, 0.03, 0.22));
      rig.head.add(gl);
      rig.glasses = gl;
      break;
    }
    case 'human': {
      const palette = [0x5a5048, 0x4e5a62, 0x6a5a40, 0x4a4a52, 0x5e4a4a];
      rig = humanRig({ shirt: infect(opts.coat ? 0x50607a : palette[(opts.seed || 0) % palette.length], inf), pants: infect(0x30343a, inf),
        skin: infect(0xd9b08c, inf * 0.9), coat: !!opts.coat, scale: sc, helmet: opts.tool === 'pick' ? 'hard' : null });
      if (opts.tool === 'pick') {
        const p = new THREE.Group();
        p.add(mesh(G.cylLo, M.wood, 0.035, 0.85, 0.035, 0, 0.4, 0));
        const hd = mesh(G.cone, M.metalDark, 0.05, 0.6, 0.05, 0, 0.82, 0); hd.rotation.z = Math.PI / 2; p.add(hd);
        rig.hand.add(p);
      }
      if (opts.tool === 'shield') {
        const sh = mesh(G.box, M.vineDark, 0.6, 0.85, 0.06, 0, -0.3, 0.25);
        rig.armL.add(sh);
            for (let i = 0; i < 6; i++) {
          const sp = mesh(G.cone, mat(0x3a5a2a), 0.1, 0.25, 0.6, (i % 3 - 1) * 0.3, (Math.floor(i / 3) - 0.5) * 0.4, 0.7);
          sp.rotation.x = Math.PI / 2;
          sh.add(sp);
        }
      }
      if (opts.bloom) {
        const fh = new THREE.Group();
        for (let p = 0; p < 7; p++) {
          const pa = p / 7 * Math.PI * 2;
          const petal = mesh(G.petal, M.flowerPink, 0.2, 0.05, 0.11, Math.cos(pa) * 0.16, 0, Math.sin(pa) * 0.16);
          petal.rotation.y = -pa;
          fh.add(petal);
        }
        fh.add(mesh(G.sphereLo, M.flowerGold, 0.12, 0.08, 0.12));
        fh.position.y = 0.18;
        rig.head.add(fh);
      }
      break;
    }
    case 'rat': rig = quadRig({ color: infect(0x5e5248, inf), len: 0.75, h: 0.26, scale: sc, headScale: 0.9, ears: true }); break;
    case 'dog': rig = quadRig({ color: infect(0x6e5a44, inf), len: 1.0, h: 0.42, scale: sc, ears: true }); break;
    case 'mole': rig = quadRig({ color: infect(0x4a3c36, inf), len: 0.8, h: 0.4, scale: sc, headScale: 1.2, tail: false }); break;
    case 'boar': rig = quadRig({ color: infect(0x4a3a30, inf), len: 1.2, h: 0.55, scale: sc, tusks: true, spikes: true }); break;
    case 'bear': rig = quadRig({ color: infect(0x3a2e26, inf), len: 1.3, h: 0.7, scale: sc, headScale: 1.1, tail: false, ears: true }); break;
    case 'bat': rig = flyerRig({ color: infect(0x5a4a42, inf * 0.6), wingColor: infect(0x6a5048, inf * 0.6), span: 1.0, scale: sc }); break;
    case 'crow': rig = flyerRig({ color: 0x34343e, wingColor: infect(0x40404c, inf * 0.5), wingGeo: G.wing, span: 1.1, scale: sc, beak: true }); break;
    case 'moth': rig = flyerRig({ color: 0x7a6a50, wingColor: 0xb8a070, wingGeo: G.wing, span: 0.9, scale: sc, glow: true }); break;
    case 'bee': rig = flyerRig({ color: 0xe0b030, wingColor: 0xd0e8f0, wingGeo: G.wing, span: 0.6, scale: sc, stripes: true, glow: true }); break;
    case 'butterfly': rig = flyerRig({ color: 0x3a2040, wingColor: 0xb04a90, wingGeo: G.wing, span: 1.3, scale: sc, glow: true }); break;
    case 'blob': rig = blobRig({ color: infect(0x7a6a5a, Math.max(inf, 0.6)), scale: sc }); break;
    case 'spider': rig = spiderRig({ scale: sc }); break;
    case 'tree': rig = treeRig({ scale: sc }); break;
    case 'swarm': rig = swarmRig({}); break;
    case 'survivor':
      rig = humanRig({ shirt: opts.color || 0x6a7a5a, pants: 0x3a3a40, skin: 0xd9b08c });
      return rig;
    default:
      rig = humanRig({});
  }
  if (inf > 0 && shape !== 'swarm' && shape !== 'tree') {
    const r = (rig.radius / sc) * (shape === 'human' || shape === 'father' ? 0.75 : 0.9);
    const h = (rig.height / sc) * (rig.shape === 'flyer' ? 0.0 : 0.9);
    if (rig.shape === 'flyer') {
      rig.infection = addInfection(rig.body, inf * 0.6, fl * 0.5, 0.2, 0.3, opts.seed || 1);
      rig.infection.position.y = -0.15;
    } else {
      rig.infection = addInfection(rig.body, inf, fl, r, h, opts.seed || 1);
    }
  }
  return rig;
}

// ------------------------------------------------------------- 소품
export function makeCrate(s = 1) {
  const g = new THREE.Group();
  g.add(mesh(G.box, M.wood, 1.1 * s, 0.9 * s, 1.1 * s, 0, 0.45 * s, 0));
  g.add(mesh(G.box, M.woodLight, 1.14 * s, 0.1 * s, 0.12 * s, 0, 0.45 * s, 0.5 * s));
  g.add(mesh(G.box, M.woodLight, 1.14 * s, 0.1 * s, 0.12 * s, 0, 0.45 * s, -0.5 * s));
  return g;
}
export function makeBarrel() {
  const g = new THREE.Group();
  g.add(mesh(G.cyl, M.rust, 0.42, 1.1, 0.42, 0, 0.55, 0));
  g.add(mesh(G.cyl, M.metalDark, 0.44, 0.06, 0.44, 0, 0.25, 0));
  g.add(mesh(G.cyl, M.metalDark, 0.44, 0.06, 0.44, 0, 0.85, 0));
  return g;
}
export function makeTerminal(amber = false) {
  const g = new THREE.Group();
  g.add(mesh(G.box, M.metal, 1.0, 1.7, 0.6, 0, 0.85, 0));
  g.add(mesh(G.box, amber ? M.screenAmber : M.screen, 0.72, 0.5, 0.02, 0, 1.2, 0.31));
  g.add(mesh(G.box, M.metalDark, 0.8, 0.12, 0.25, 0, 0.82, 0.38));
  g.add(mesh(G.box, M.black, 0.5, 0.2, 0.02, 0, 0.45, 0.31));
  return g;
}
export function makeWorkbench(forge = false) {
  const g = new THREE.Group();
  g.add(mesh(G.box, M.woodLight, 2.0, 0.1, 0.9, 0, 0.9, 0));
  for (const [x, z] of [[-0.9, -0.38], [0.9, -0.38], [-0.9, 0.38], [0.9, 0.38]]) g.add(mesh(G.box, M.metalDark, 0.08, 0.9, 0.08, x, 0.45, z));
  g.add(mesh(G.box, M.metalDark, 0.25, 0.2, 0.18, -0.6, 1.05, 0));
  const hammer = mesh(G.cylLo, M.wood, 0.03, 0.4, 0.03, 0.3, 0.97, 0.2);
  hammer.rotation.z = Math.PI / 2;
  g.add(hammer);
  if (forge) {
    const f = new THREE.Group();
    f.add(mesh(G.box, mat(0x3a3430), 1.1, 0.9, 1.0, 0, 0.45, 0));
    f.add(mesh(G.box, mat(0xff6a20, { emissive: 0xff4a10, emissiveIntensity: 2.0 }), 0.7, 0.08, 0.6, 0, 0.92, 0));
    f.add(mesh(G.box, M.metalDark, 0.8, 0.35, 0.35, 1.3, 0.55, 0)); // 모루
    f.add(mesh(G.box, M.metalDark, 0.3, 0.4, 0.3, 1.3, 0.2, 0));
    f.position.set(2.4, 0, 0);
    g.add(f);
    g.userData.forge = f;
  }
  return g;
}
export function makeLamp() {
  const g = new THREE.Group();
  g.add(mesh(G.cylLo, M.metalDark, 0.06, 3.2, 0.06, 0, 1.6, 0));
  g.add(mesh(G.cone, M.metalDark, 0.35, 0.25, 0.35, 0, 3.25, 0));
  g.add(mesh(G.sphereLo, M.lamp, 0.16, 0.12, 0.16, 0, 3.1, 0));
  return g;
}
export function makeStairsUp() {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) g.add(mesh(G.box, M.metal, 3.2, 0.32, 0.7, 0, 0.16 + i * 0.32, -i * 0.6));
  g.add(mesh(G.box, M.metalDark, 0.12, 3.5, 0.12, -1.65, 1.75, -1.8));
  g.add(mesh(G.box, M.metalDark, 0.12, 3.5, 0.12, 1.65, 1.75, -1.8));
  g.add(mesh(G.box, M.metalDark, 0.08, 0.08, 4.2, -1.65, 2.6, -1.8, 0.45));
  g.add(mesh(G.box, M.metalDark, 0.08, 0.08, 4.2, 1.65, 2.6, -1.8, 0.45));
  g.children[g.children.length - 1].rotation.x = 0.45;
  g.children[g.children.length - 2].rotation.x = 0.45;
  const frame = new THREE.Group();
  frame.add(mesh(G.box, M.metalDark, 3.6, 0.3, 0.3, 0, 4.6, -4.1));
  frame.add(mesh(G.box, M.metalDark, 0.3, 4.6, 0.3, -1.8, 2.3, -4.1));
  frame.add(mesh(G.box, M.metalDark, 0.3, 4.6, 0.3, 1.8, 2.3, -4.1));
  g.add(frame);
  const shaft = new THREE.Mesh(new THREE.ConeGeometry(2.4, 7, 24, 1, true), M.shaft);
  shaft.position.set(0, 3.2, -2.2);
  g.add(shaft);
  const lightM = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb54a, emissiveIntensity: 2.0 });
  const sig = mesh(G.box, lightM, 0.5, 0.2, 0.1, 0, 4.85, -3.9);
  g.add(sig);
  g.userData.signal = sig;
  return g;
}
export function makeHatch() {
  const g = new THREE.Group();
  g.add(mesh(G.cyl, M.metalDark, 1.3, 0.12, 1.3, 0, 0.06, 0));
  g.add(mesh(G.cyl, M.metal, 1.05, 0.14, 1.05, 0, 0.08, 0));
  g.add(mesh(G.box, M.metalDark, 1.4, 0.06, 0.12, 0, 0.17, 0));
  return g;
}
export function makeHeart() {
  const g = new THREE.Group();
  const core = mesh(G.sphere, M.heart, 0.9, 1.0, 0.9, 0, 1.3, 0);
  g.add(core);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    const v = mesh(G.vineArc, M.vineDark, 1.0, 1.0, 1.0, 0, 1.3, 0);
    v.rotation.set(Math.PI / 2 + Math.sin(a) * 0.5, a, 0);
    g.add(v);
  }
  const shield = mesh(G.sphere, M.heartShield, 1.5, 1.6, 1.5, 0, 1.3, 0);
  g.add(shield);
  g.userData.core = core;
  g.userData.shield = shield;
  return g;
}
export function makeHive() {
  const g = new THREE.Group();
  g.add(mesh(G.cyl, mat(0xc89a40, { emissive: 0x5a3a10 }), 0.6, 1.4, 0.6, 0, 0.7, 0));
  g.add(mesh(G.cone, mat(0xc89a40), 0.6, 0.5, 0.6, 0, 1.6, 0));
  for (let i = 0; i < 4; i++) g.add(mesh(G.cyl, mat(0x9a7020), 0.63, 0.08, 0.63, 0, 0.3 + i * 0.32, 0));
  return g;
}
export function makeRecorder() {
  const g = new THREE.Group();
  g.add(mesh(G.box, M.metalDark, 0.5, 0.3, 0.35, 0, 0.95, 0));
  g.add(mesh(G.box, M.wood, 0.6, 0.9, 0.5, 0, 0.45, 0));
  const led = mesh(G.sphereLo, M.red, 0.05, 0.05, 0.05, 0.16, 1.12, 0.16);
  g.add(led);
  g.add(mesh(G.cyl, M.black, 0.08, 0.02, 0.08, -0.1, 1.12, 0.1));
  g.userData.led = led;
  return g;
}
export function makeLocker() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    g.add(mesh(G.box, M.metal, 0.9, 2.2, 0.8, -1 + i, 1.1, 0));
    g.add(mesh(G.box, M.metalDark, 0.04, 0.3, 0.04, -0.7 + i, 1.2, 0.42));
  }
  return g;
}
export function makePipeRun(len) {
  const g = new THREE.Group();
  const p = mesh(G.cylLo, M.rust, 0.18, len, 0.18, 0, 0, 0);
  p.rotation.z = Math.PI / 2;
  g.add(p);
  for (let i = 0; i < len / 3; i++) {
    const ring = mesh(G.cylLo, M.metalDark, 0.22, 0.1, 0.22, -len / 2 + i * 3, 0, 0);
    ring.rotation.z = Math.PI / 2;
    g.add(ring);
  }
  return g;
}
export function makeRubble(seed = 1) {
  const g = new THREE.Group();
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 6; i++) {
    const m = mesh(G.sphereLo, i % 2 ? M.rock : mat(0x5a524a), 0.25 + r() * 0.4, 0.15 + r() * 0.3, 0.25 + r() * 0.4, (r() - 0.5) * 1.6, 0.1, (r() - 0.5) * 1.6);
    m.rotation.set(r(), r() * 3, r());
    g.add(m);
  }
  return g;
}
export function makePickupGlint() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 32), new THREE.MeshBasicMaterial({ color: 0xf2b33d, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}
export function makeDecal(color = 0xff3030, radius = 1) {
  const m = new THREE.MeshBasicMaterial({ map: TEX.ring, color, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
  const d = new THREE.Mesh(G.plane, m);
  d.rotation.x = -Math.PI / 2;
  d.scale.set(radius * 2, radius * 2, 1);
  d.position.y = 0.05;
  return d;
}
export function makeBlobShadow(r) {
  const s = new THREE.Mesh(G.plane, M.shadow);
  s.rotation.x = -Math.PI / 2;
  s.scale.set(r * 2.4, r * 2.4, 1);
  s.position.y = 0.02;
  return s;
}
