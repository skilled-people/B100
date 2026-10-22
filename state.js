// 게임 상태 (저장되는 값) 와 파생 스탯 계산
import { MAX_LEVEL, POINTS_PER_LEVEL, RANGED, rangedById, meleeById, BUILDINGS, JOBS } from './data.js';

const SAVE_KEY = 'underground100.save.v1';

export function newState() {
  const bld = {};
  for (const [k, b] of Object.entries(BUILDINGS)) bld[k] = b.start;
  return {
    version: 1,
    seed: Math.floor(Math.random() * 1e9),   // 새 게임마다 층 모양이 달라진다
    floor: 100,
    maxReached: 100,
    level: 1, xp: 0, points: 0,
    stats: { str: 0, vit: 0, thr: 0, spd: 0, sta: 0 },
    mentalDelta: 0,
    gold: 0,
    items: { '붕대': 2 },
    melee: ['branch'], meleeEq: 'branch',
    guns: [], rangedEq: 'pebble',
    floors: {},
    residents: [],
    town: { started: false, res: { food: 30, water: 30, power: 30, oxygen: 30, build: 10 }, bld },
    warehouse: { gold: 0, items: {} },
    flags: {},
    heard: {},
    journal: [],
    cd: { rest: -999, photo: -999, talk: -999 },
    playTime: 0,
    deaths: 0,
    endings: [],
  };
}

export function floorState(state, f) {
  if (!state.floors[f]) {
    state.floors[f] = { visited: false, cleared: false, bossDefeated: false, taken: [], reinfected: false,
      room: null, survivorDone: false };
  }
  return state.floors[f];
}

export const STAT_LABEL = { str: '힘', vit: '체력', thr: '투척', spd: '기본 속도', sta: '스태미나' };
export const STAT_DESC = {
  str: '근접 공격력 +1%, 무거운 무기 사용 조건',
  vit: '최대 HP +6',
  thr: '원거리 공격력 +1%, 야구공 위력 상승',
  spd: '이동 속도 +0.25%',
  sta: '최대 스태미나 +3, 공격 속도 +0.15%',
};

export function xpNeed(level) {
  return Math.round(28 * Math.pow(level, 1.62));
}

export function derive(state) {
  const s = state.stats;
  const floorBonus = 100 - state.maxReached;      // 층마다 +1, 최대 99
  const mental = Math.max(0, Math.min(99, floorBonus + state.mentalDelta));
  const working = (job) => state.town.started ? state.residents.filter((r) => r.work === job).length : 0;
  return {
    maxHp: 100 + s.vit * 6,
    maxSta: 100 + s.sta * 3,
    meleeMul: 1 + s.str * 0.01,
    rangedMul: 1 + s.thr * 0.01,
    speedMul: 1 + s.spd * 0.0025,        // 이동 속도
    atkSpeedMul: 1 + s.sta * 0.0015,     // 공격 속도 (스태미나)
    survival: floorBonus,
    handskill: floorBonus,
    mental,
    evasion: floorBonus * 0.003,
    craftRate: Math.min(1, 0.7 + floorBonus * 0.003),
    craftTimeMul: 1 - floorBonus * 0.005,
    statusMul: 1 - mental / 99 * 0.5,
    researchers: Math.min(3, working('researcher')),
    merchants: working('merchant'),
    guards: working('guard'),
    doctors: working('doctor'),
    smiths: working('smith'),
  };
}

export function addXp(state, amount) {
  let ups = 0;
  if (state.level >= MAX_LEVEL) return 0;
  state.xp += amount;
  while (state.level < MAX_LEVEL && state.xp >= xpNeed(state.level)) {
    state.xp -= xpNeed(state.level);
    state.level++;
    state.points += POINTS_PER_LEVEL;
    ups++;
  }
  if (state.level >= MAX_LEVEL) state.xp = 0;
  return ups;
}

export function itemCount(state, name) {
  return state.items[name] || 0;
}
export function addItem(state, name, n = 1) {
  state.items[name] = (state.items[name] || 0) + n;
  if (state.items[name] <= 0) delete state.items[name];
}

export function rangedAvailable(state) {
  return RANGED.filter((w) => {
    if (w.infinite) return true;
    if (w.gun) return state.guns.includes(w.id);
    return itemCount(state, w.item) > 0;
  });
}
export function rangedAmmo(state, w) {
  if (w.infinite) return Infinity;
  return itemCount(state, w.item);
}
export function equippedMelee(state) {
  return meleeById[state.meleeEq] || meleeById.branch;
}
export function equippedRanged(state) {
  const w = rangedById[state.rangedEq];
  const avail = rangedAvailable(state);
  if (!w || !avail.includes(w)) return avail[0];
  return w;
}

export function townRates(state) {
  // 한 틱(8초)당 생산·소비량
  const out = { food: 0, water: 0, power: 0, oxygen: 0, build: 0 };
  const use = { food: 0, water: 0, power: 0, oxygen: 0, build: 0 };
  if (!state.town.started) return { out, use };
  const lvlOf = (job) => {
    const b = Object.entries(BUILDINGS).find(([, d]) => d.job === job);
    return b ? state.town.bld[b[0]] : 1;
  };
  for (const r of state.residents) {
    const j = JOBS[r.work];
    if (j && j.res) {
      const lvl = lvlOf(r.work);
      out[j.res] += lvl > 0 ? j.out * (1 + 0.5 * (lvl - 1)) : 0;
    }
  }
  const n = state.residents.length;
  use.food = n; use.water = n; use.oxygen = n;
  use.power = 0.4 * n + ['smithy', 'clinic', 'seal'].reduce((a, k) => a + (state.town.bld[k] > 0 ? 1 : 0), 0);
  return { out, use };
}

export function save(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}
export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== 1) return null;
    // 새 필드 보강
    const base = newState();
    for (const k of Object.keys(base)) if (s[k] === undefined) s[k] = base[k];
    for (const k of Object.keys(base.town.bld)) if (s.town.bld[k] === undefined) s.town.bld[k] = base.town.bld[k];
    return s;
  } catch (e) {
    return null;
  }
}
export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
}
