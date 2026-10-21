// =====================================================================
//  《지하 100층》 데이터 테이블
//  기획에서 정한 수치를 그대로 옮겨 두었다. 밸런스는 BALANCE 로 조절한다.
// =====================================================================

export const BALANCE = {
  enemyHp: 1.0,      // 일반 몬스터 체력 배율
  enemyAtk: 1.0,     // 일반 몬스터 공격력 배율
  bossHp: 1.0,       // 보스 체력 배율
  bossAtk: 1.0,
  xp: 1.0,
  gold: 1.0,
};

export const MAX_LEVEL = 80;
export const POINTS_PER_LEVEL = 2;

// 층 계수 = 1 + (100 - 층) × 0.05
export const floorCoef = (f) => 1 + (100 - f) * 0.05;
// 올라온 정도 (B100 = 0, B1 = 1)
export const progressOf = (f) => (100 - f) / 99;

export const STAGES = [
  { id: 1, name: '새싹', from: 100, to: 86, vine: 0.12, flower: 0.0, look: '피부에 이끼가 군데군데' },
  { id: 2, name: '덩굴', from: 85, to: 69, vine: 0.32, flower: 0.0, look: '팔다리에 덩굴이 감김' },
  { id: 3, name: '개화', from: 68, to: 51, vine: 0.5, flower: 0.35, look: '몸에서 꽃이 피기 시작' },
  { id: 4, name: '군락', from: 50, to: 31, vine: 0.7, flower: 0.6, look: '몸 절반이 식물' },
  { id: 5, name: '숙주', from: 30, to: 11, vine: 0.88, flower: 0.85, look: '원래 형체가 거의 안 보임' },
  { id: 6, name: '완전 잠식', from: 10, to: 1, vine: 1.0, flower: 1.0, look: '식물이 몸을 조종' },
];
export const stageOf = (f) => STAGES.find((s) => f <= s.from && f >= s.to) || STAGES[5];

// ------------------------------------------------------------- 몬스터
// from/to : 출현 층 범위 (from 이 더 깊은 층)
export const MONSTERS = {
  rat:     { name: '이끼쥐',     base: '동물', from: 100, to: 70, hp: 40,  atk: 5,  ai: 'chase',    shape: 'rat',   speed: 4.0, size: 0.55, xp: 4 },
  worker:  { name: '이끼 작업자', base: '인간', from: 100, to: 60, hp: 120, atk: 10, ai: 'grabber',  shape: 'human', speed: 1.7, size: 1.0,  xp: 9 },
  bat:     { name: '덩굴박쥐',   base: '동물', from: 98,  to: 50, hp: 50,  atk: 8,  ai: 'diver',    shape: 'bat',   speed: 4.4, size: 0.7,  xp: 7, flying: true },
  dog:     { name: '포자 들개',   base: '동물', from: 90,  to: 40, hp: 90,  atk: 14, ai: 'charger',  shape: 'dog',   speed: 4.6, size: 0.8,  xp: 10, spore: true },
  miner:   { name: '덩굴 광부',   base: '인간', from: 85,  to: 35, hp: 200, atk: 18, ai: 'brute',    shape: 'human', speed: 1.9, size: 1.12, xp: 15, armor: 0.3, tool: 'pick' },
  sprayer: { name: '포자 분사자', base: '인간', from: 75,  to: 20, hp: 140, atk: 12, ai: 'spitter',  shape: 'human', speed: 2.1, size: 1.0,  xp: 13 },
  moth:    { name: '포자 나방',   base: '곤충', from: 70,  to: 15, hp: 30,  atk: 6,  ai: 'moth',     shape: 'moth',  speed: 3.2, size: 0.6,  xp: 5, flying: true, blind: true },
  mole:    { name: '뿌리 두더지', base: '동물', from: 65,  to: 25, hp: 180, atk: 20, ai: 'burrower', shape: 'mole',  speed: 3.0, size: 0.9,  xp: 15 },
  bloomer: { name: '개화체',     base: '인간', from: 55,  to: 5,  hp: 160, atk: 25, ai: 'bloomer',  shape: 'human', speed: 2.3, size: 1.0,  xp: 15, bloom: true },
  crow:    { name: '감염 까마귀', base: '동물', from: 40,  to: 2,  hp: 100, atk: 22, ai: 'diver',    shape: 'crow',  speed: 5.6, size: 0.7,  xp: 13, flying: true },
  thorn:   { name: '가시 경비원', base: '인간', from: 35,  to: 2,  hp: 350, atk: 30, ai: 'brute',    shape: 'human', speed: 2.1, size: 1.18, xp: 24, reflect: 0.3, tool: 'shield' },
  host:    { name: '숙주 덩어리', base: '인간', from: 20,  to: 2,  hp: 600, atk: 35, ai: 'splitter', shape: 'blob',  speed: 1.5, size: 1.45, xp: 36 },
  // 보스 소환 전용
  bee:     { name: '일벌',       base: '곤충', from: 0,   to: 0,  hp: 40,  atk: 10, ai: 'diver',    shape: 'bee',   speed: 5.0, size: 0.5,  xp: 5, flying: true },
  hostling:{ name: '작은 숙주',   base: '인간', from: 0,   to: 0,  hp: 180, atk: 18, ai: 'chase',    shape: 'blob',  speed: 2.2, size: 0.9,  xp: 10 },
};

export const monstersForFloor = (f) =>
  Object.entries(MONSTERS).filter(([, m]) => m.from > 0 && f <= m.from && f >= m.to).map(([id]) => id);

// ------------------------------------------------------------- 중간 보스 (5층마다) + 최종
export const BOSSES = {
  95: { name: '이끼쥐 왕',       shape: 'rat',       scale: 2.6, hp: 1500,  atk: 14, patterns: ['summon:rat', 'charge'] },
  90: { name: '덩굴박쥐 군주',    shape: 'bat',       scale: 2.6, hp: 2000,  atk: 16, air: true, patterns: ['dive', 'summon:bat'] },
  85: { name: '광부 반장',       shape: 'human',     scale: 1.9, hp: 3000,  atk: 24, tool: 'pick', patterns: ['slam', 'rockfall'] },
  80: { name: '포자 나방 여왕',   shape: 'moth',      scale: 3.0, hp: 3500,  atk: 18, air: true, patterns: ['blur', 'summon:moth', 'dive'] },
  75: { name: '뿌리 두더지 거수', shape: 'mole',      scale: 2.6, hp: 4500,  atk: 30, patterns: ['burrow', 'slam'] },
  70: { name: '경비대장',        shape: 'human',     scale: 2.0, hp: 6000,  atk: 32, tool: 'shield', patterns: ['charge', 'slam'] },
  65: { name: '여왕벌',          shape: 'bee',       scale: 3.4, hp: 7000,  atk: 26, air: true, patterns: ['summon:bee', 'barrage'] },
  60: { name: '쌍둥이 숙주',      shape: 'human',     scale: 1.8, hp: 4500,  atk: 30, twin: true, patterns: ['charge', 'slam'] },
  55: { name: '가시 멧돼지',      shape: 'boar',      scale: 2.6, hp: 9000,  atk: 40, patterns: ['charge', 'barrage'] },
  50: { name: '나비 떼',         shape: 'swarm',     scale: 1.0, hp: 11000, atk: 22, air: true, patterns: ['sleep', 'dive'] },
  45: { name: '감염된 의사',      shape: 'human',     scale: 1.9, hp: 12000, atk: 34, coat: true, patterns: ['heal', 'summon:bloomer', 'barrage'] },
  40: { name: '덩굴 거미',       shape: 'spider',    scale: 2.8, hp: 14000, atk: 40, patterns: ['web', 'charge'] },
  35: { name: '까마귀 왕',       shape: 'crow',      scale: 3.0, hp: 15000, atk: 40, air: true, patterns: ['dive', 'summon:crow'] },
  30: { name: '거목 인간',       shape: 'tree',      scale: 3.0, hp: 18000, atk: 46, stationary: true, patterns: ['roots', 'barrage'] },
  25: { name: '군락 여왕벌',      shape: 'bee',       scale: 3.8, hp: 20000, atk: 44, air: true, patterns: ['hive', 'summon:bee', 'barrage'] },
  20: { name: '감염된 곰',       shape: 'bear',      scale: 2.8, hp: 23000, atk: 55, patterns: ['charge', 'slam'] },
  15: { name: '독화 나비 여왕',   shape: 'butterfly', scale: 3.2, hp: 25000, atk: 44, air: true, patterns: ['poisonfield', 'clone', 'dive'] },
  10: { name: '숙주 거인',       shape: 'blob',      scale: 3.4, hp: 30000, atk: 60, patterns: ['split', 'slam'] },
  5:  { name: '감염된 연구원',    shape: 'human',     scale: 1.9, hp: 32000, atk: 58, coat: true, patterns: ['barrage', 'summon:thorn', 'roots'] },
  1:  { name: '???',            shape: 'father',    scale: 1.9, hp: 40000, atk: 62, final: true, patterns: ['slam', 'roots', 'charge'] },
};
export const isBossFloor = (f) => !!BOSSES[f];

// 감염된 방과 겹치는 보스 층 → 처치 후 잔몹 스폰
export const BOSS_MINIONS = {
  85: { list: ['miner', 'worker'], n: 6 },
  70: { list: ['dog', 'sprayer'], n: 8 },
  55: { list: ['dog', 'mole'], n: 10 },
  40: { list: ['crow', 'thorn'], n: 12 },
  25: { list: ['bee', 'moth'], n: 14 },
  10: { list: ['host', 'bloomer'], n: 16 },
};

// ------------------------------------------------------------- 감염된 방 (3층마다, 보스 겹침 층 제외)
export const hasInfectedRoom = (f) => f % 3 === 1 && f >= 4 && f <= 97 && !BOSS_MINIONS[f];
export function roomTier(f) {
  if (f >= 70) return { fee: 50, waves: 3, max: 30, interval: 30 };
  if (f >= 37) return { fee: 200, waves: 4, max: 45, interval: 16 };
  return { fee: 500, waves: 5, max: 60, interval: 10 };
}
export const ROOM_OVERFLOW_OUT = 0.4; // 넘칠 때 층으로 쏟아지는 비율
export const ROOM_AFTER_OVERFLOW = 0.6; // 넘친 뒤 남는 게이지

// ------------------------------------------------------------- 무기
// spd: 공격 간격(초)
export const SPEED = { vfast: 0.32, fast: 0.44, normal: 0.6, slow: 0.86, vslow: 1.12 };
export const SPEED_LABEL = { vfast: '매우 빠름', fast: '빠름', normal: '보통', slow: '느림', vslow: '매우 느림' };

export const MELEE = [
  { id: 'branch',       name: '나뭇가지',        atk: 8,   spd: 'fast',   reach: 1.9, arc: 100, floor: 100, start: true, model: 'stick' },
  { id: 'sstoneaxe',    name: '즉석 돌도끼',      atk: 14,  spd: 'normal', reach: 1.9, arc: 100, floor: 99, craft: true, model: 'axe_stone' },
  { id: 'broom',        name: '빗자루',          atk: 18,  spd: 'normal', reach: 2.6, arc: 110, floor: 97, model: 'broom', note: '리치가 김' },
  { id: 'stoneaxe',     name: '돌도끼',          atk: 24,  spd: 'normal', reach: 2.0, arc: 100, floor: 94, craft: true, model: 'axe_stone' },
  { id: 'pen',          name: '볼펜',            atk: 28,  spd: 'vfast',  reach: 1.3, arc: 50,  floor: 91, model: 'pen', note: '찌르기, 투척 겸용' },
  { id: 'bokken',       name: '목도',            atk: 36,  spd: 'fast',   reach: 2.2, arc: 100, floor: 87, model: 'bokken' },
  { id: 'extinguisher', name: '소화기',          atk: 45,  spd: 'slow',   reach: 2.0, arc: 120, floor: 83, str: 10, knock: 3.2, clearSpore: true, model: 'extinguisher', note: '넉백, 포자 구름 제거' },
  { id: 'smace',        name: '즉석 철퇴',        atk: 55,  spd: 'slow',   reach: 2.1, arc: 100, floor: 79, craft: true, str: 15, model: 'mace' },
  { id: 'ironaxe',      name: '철도끼',          atk: 65,  spd: 'normal', reach: 2.1, arc: 100, floor: 75, craft: true, model: 'axe_iron' },
  { id: 'bottle',       name: '스테인리스 물통',   atk: 75,  spd: 'normal', reach: 1.8, arc: 100, floor: 71, stun: 0.5, model: 'bottle', note: '짧은 기절' },
  { id: 'tumbler',      name: '텀블러',          atk: 85,  spd: 'normal', reach: 1.8, arc: 100, floor: 67, model: 'tumbler', note: '주민에게 받음' },
  { id: 'glass',        name: '유리 조각',        atk: 95,  spd: 'vfast',  reach: 1.4, arc: 60,  floor: 63, bleed: true, model: 'shard', note: '출혈, 투척 겸용' },
  { id: 'wire',         name: '전깃줄',          atk: 110, spd: 'normal', reach: 3.0, arc: 220, floor: 58, root: 0.8, model: 'wire', note: '넓은 범위, 묶기' },
  { id: 'fireaxe',      name: '소방도끼',        atk: 130, spd: 'normal', reach: 2.2, arc: 100, floor: 53, str: 30, model: 'axe_fire' },
  { id: 'whip',         name: '채찍',            atk: 145, spd: 'fast',   reach: 4.2, arc: 40,  floor: 48, hitsAir: true, model: 'whip', note: '공중 몬스터 끌어내리기' },
  { id: 'stock',        name: '총 개머리판',      atk: 165, spd: 'normal', reach: 2.0, arc: 100, floor: 43, model: 'stock', note: '고장 난 소총' },
  { id: 'speaker',      name: '스피커',          atk: 185, spd: 'slow',   reach: 2.4, arc: 360, floor: 38, stun: 0.8, model: 'speaker', note: '소리로 기절' },
  { id: 'sspear',       name: '즉석 창',          atk: 205, spd: 'normal', reach: 3.2, arc: 30,  floor: 33, craft: true, pierce: true, model: 'spear_s' },
  { id: 'spear',        name: '창',              atk: 230, spd: 'normal', reach: 3.4, arc: 30,  floor: 27, craft: true, pierce: true, model: 'spear' },
  { id: 'tv',           name: 'TV',              atk: 260, spd: 'vslow',  reach: 2.4, arc: 200, floor: 21, str: 50, model: 'tv', note: '범위 강타' },
  { id: 'katana',       name: '전시용 카타나',     atk: 300, spd: 'fast',   reach: 2.5, arc: 120, floor: 12, shop: true, model: 'katana' },
];
export const meleeById = Object.fromEntries(MELEE.map((w) => [w.id, w]));

// 원거리: item = 소모되는 아이템 이름 (infinite 이면 무한)
export const RANGED = [
  { id: 'pebble',   name: '작은 돌',        atk: 6,   floor: 100, infinite: true, speed: 22, cd: 0.42, model: 'pebble' },
  { id: 'pchair',   name: '플라스틱 의자',   atk: 10,  floor: 98, item: '플라스틱 의자', speed: 15, cd: 0.8,  retrieve: true, model: 'chair_p' },
  { id: 'stone',    name: '돌',            atk: 14,  floor: 95, item: '돌',         speed: 20, cd: 0.6,  retrieve: true, model: 'stone' },
  { id: 'baseball', name: '야구공',         atk: 18,  floor: 92, item: '야구공',      speed: 27, cd: 0.5,  retrieve: true, model: 'ball', scaleThrow: true },
  { id: 'ironlump', name: '철 덩이',        atk: 24,  floor: 86, item: '철 덩이',     speed: 13, cd: 0.9,  retrieve: true, model: 'lump' },
  { id: 'glass_t',  name: '유리 조각',       atk: 32,  floor: 63, item: '유리 조각',   speed: 24, cd: 0.5,  consume: true, model: 'shard' },
  { id: 'dagger',   name: '전시용 투척 단검', atk: 36,  floor: 45, item: '투척 단검',   speed: 28, cd: 0.4,  retrieve: true, model: 'dagger', shop: true },
  { id: 'pen_t',    name: '볼펜',           atk: 38,  floor: 91, item: '볼펜',       speed: 28, cd: 0.35, retrieve: true, model: 'pen' },
  { id: 'beanbomb', name: '콩폭탄',         atk: 60,  floor: 55, item: '콩폭탄',      speed: 15, cd: 1.0,  consume: true, aoe: 3.4, model: 'bomb', craft: true },
  { id: 'pistol',   name: '권총',           atk: 80,  floor: 40, item: '권총 탄약',   speed: 60, cd: 0.35, gun: true, model: 'bullet' },
  { id: 'rifle',    name: '소총',           atk: 120, floor: 25, item: '소총 탄약',   speed: 80, cd: 0.7,  gun: true, pierce: true, model: 'bullet' },
  { id: 'ichair',   name: '철 의자',        atk: 150, floor: 18, item: '철 의자',     speed: 12, cd: 1.2,  retrieve: true, str: 45, model: 'chair_i' },
  { id: 'desk',     name: '책상',           atk: 190, floor: 8,  item: '책상',       speed: 10, cd: 1.5,  retrieve: true, str: 60, slow: 0.2, model: 'desk', note: '들고 있는 동안 이동속도 −20%' },
];
export const rangedById = Object.fromEntries(RANGED.map((w) => [w.id, w]));
export const baseballAtk = (throwStat) => 18 + throwStat * 0.17;

// 각 층에서 주울 수 있는 무기 (제작·구매 무기 제외)
export const FLOOR_PICKUPS = {
  97: [{ melee: 'broom' }],
  98: [{ item: '플라스틱 의자', n: 3, label: '플라스틱 의자' }],
  95: [{ item: '돌', n: 6, label: '돌' }],
  92: [{ item: '야구공', n: 2, label: '야구공' }],
  91: [{ melee: 'pen' }, { item: '볼펜', n: 3, label: '볼펜' }],
  87: [{ melee: 'bokken' }],
  86: [{ item: '철 덩이', n: 3, label: '철 덩이' }],
  83: [{ melee: 'extinguisher' }],
  71: [{ melee: 'bottle' }],
  67: [{ melee: 'tumbler' }],
  63: [{ melee: 'glass' }, { item: '유리 조각', n: 4, label: '유리 조각' }],
  58: [{ melee: 'wire' }],
  53: [{ melee: 'fireaxe' }],
  48: [{ melee: 'whip' }],
  43: [{ melee: 'stock' }],
  40: [{ gun: 'pistol' }, { item: '권총 탄약', n: 12, label: '권총 탄약' }],
  38: [{ melee: 'speaker' }],
  25: [{ gun: 'rifle' }, { item: '소총 탄약', n: 10, label: '소총 탄약' }],
  21: [{ melee: 'tv' }],
  18: [{ item: '철 의자', n: 2, label: '철 의자' }],
  8:  [{ item: '책상', n: 1, label: '책상' }],
};

// ------------------------------------------------------------- 재료 & 제작
export const MATERIALS = [
  '날카로운 돌', '돌', '나뭇가지', '덩굴', '단단한 나무 막대', '노끈', '나무 수액',
  '굵은 막대', '볼트·너트', '철사', '철 덩이', '나무 손잡이', '쐐기', '천 조각', '빈 유리병',
  '감염 콩깍지', '테이프', '긴 막대', '쇠파이프', '리벳', '유리 조각',
];
export function materialTable(f) {
  const t = ['날카로운 돌', '돌', '나뭇가지', '덩굴', '단단한 나무 막대', '나무 수액', '노끈'];
  if (f <= 85) t.push('굵은 막대', '볼트·너트', '철사', '철 덩이', '나무 손잡이', '쐐기', '천 조각', '빈 유리병');
  if (f <= 68) t.push('감염 콩깍지', '감염 콩깍지', '테이프', '긴 막대');
  if (f <= 50) t.push('쇠파이프', '리벳', '유리 조각');
  return t;
}

// station: null(맨손) | 'workbench'(작업대) | 'forge'(화로+모루) | 'smithy'(대장간)
export const RECIPES = [
  { id: 'r_sstoneaxe', out: { melee: 'sstoneaxe' }, name: '즉석 돌도끼', floor: 99, gold: 0, time: 10, station: null,
    need: { '날카로운 돌': 1, '나뭇가지': 1, '덩굴': 2 }, how: '돌끼리 부딪쳐 날을 세우고, 가지 끝을 쪼개 끼운 뒤 덩굴로 감는다.' },
  { id: 'r_stoneaxe', out: { melee: 'stoneaxe' }, name: '돌도끼', floor: 94, gold: 50, time: 45, station: 'workbench',
    need: { '돌': 2, '단단한 나무 막대': 1, '노끈': 1, '나무 수액': 1 }, how: '돌을 숫돌에 갈아 날을 만들고, 손잡이에 홈을 파 끼운 뒤 수액과 노끈으로 고정한다.' },
  { id: 'r_smace', out: { melee: 'smace' }, name: '즉석 철퇴', floor: 79, gold: 30, time: 15, station: null,
    need: { '굵은 막대': 1, '볼트·너트': 1, '철사': 2 }, how: '막대 끝에 볼트 뭉치를 철사로 칭칭 감아 무게를 싣는다.' },
  { id: 'r_ironaxe', out: { melee: 'ironaxe' }, name: '철도끼', floor: 75, gold: 300, time: 120, station: 'forge',
    need: { '철 덩이': 2, '나무 손잡이': 1, '쐐기': 1 }, how: '철을 달궈 두드려 날 모양을 잡고, 식힌 뒤 숫돌로 갈아 손잡이에 끼워 쐐기로 고정한다.' },
  { id: 'r_beanbomb', out: { item: '콩폭탄', n: 1 }, name: '콩폭탄', floor: 55, gold: 100, time: 20, station: 'workbench',
    need: { '감염 콩깍지': 3, '빈 유리병': 1, '천 조각': 1 }, how: '충격을 받으면 터지는 콩깍지를 병에 담고 천으로 입구를 막는다.' },
  { id: 'r_sspear', out: { melee: 'sspear' }, name: '즉석 창', floor: 33, gold: 20, time: 15, station: null,
    need: { '긴 막대': 1, '유리 조각': 1, '테이프': 1 }, how: '막대 끝을 쪼개 유리 조각을 끼우고 테이프로 단단히 감는다.' },
  { id: 'r_spear', out: { melee: 'spear' }, name: '창', floor: 27, gold: 600, time: 180, station: 'smithy',
    need: { '쇠파이프': 1, '철 덩이': 1, '리벳': 2 }, how: '철을 두드려 창날을 만들고 파이프 끝에 끼워 리벳으로 고정한다.' },
];
export const STATION_LABEL = { workbench: '작업대', forge: '화로 + 모루', smithy: '대장간' };

// ------------------------------------------------------------- 상점
export const SHOP = [
  { id: 'bandage', name: '붕대', price: 30, give: { item: '붕대', n: 1 }, desc: 'HP 30% 회복' },
  { id: 'can', name: '복숭아 통조림', price: 60, give: { item: '통조림', n: 1 }, desc: 'HP 60%와 스태미나 회복' },
  { id: 'rope', name: '노끈', price: 15, give: { item: '노끈', n: 1 }, desc: '제작 부품' },
  { id: 'tape', name: '테이프', price: 15, give: { item: '테이프', n: 1 }, desc: '제작 부품', from: 68 },
  { id: 'wirep', name: '철사', price: 20, give: { item: '철사', n: 1 }, desc: '제작 부품', from: 85 },
  { id: 'rivet', name: '리벳 2개', price: 40, give: { item: '리벳', n: 2 }, desc: '제작 부품', from: 50 },
  { id: 'wedge', name: '쐐기', price: 25, give: { item: '쐐기', n: 1 }, desc: '제작 부품', from: 85 },
  { id: 'pammo', name: '권총 탄약 10발', price: 150, give: { item: '권총 탄약', n: 10 }, desc: '권총 전용', from: 40 },
  { id: 'rammo', name: '소총 탄약 10발', price: 300, give: { item: '소총 탄약', n: 10 }, desc: '소총 전용', from: 25 },
];
// 전시실 상점 (해당 층에서만)
export const DISPLAY_SHOP = {
  45: [{ id: 'dagger', name: '전시용 투척 단검 5개', price: 1200, give: { item: '투척 단검', n: 5 }, desc: '회수 가능한 투척 무기' }],
  12: [{ id: 'katana', name: '전시용 카타나', price: 8000, give: { melee: 'katana' }, desc: '근접 공격력 300' }],
};

// 보급 단말기 · 작업대가 있는 층 (보스 바로 아래층)
export const isStationFloor = (f) => f % 5 === 4;
export const hasForge = (f) => isStationFloor(f) && f <= 79;

// ------------------------------------------------------------- 주민
export const JOBS = {
  farmer:     { name: '농부',     res: 'food',      freq: 'common', out: 4 },
  miner:      { name: '광부',     res: 'build',     freq: 'common', out: 3 },
  guard:      { name: '경비',     freq: 'common' },
  water:      { name: '정수사',   res: 'water',     freq: 'normal', out: 5 },
  electric:   { name: '전기공',   res: 'power',     freq: 'normal', out: 6 },
  vent:       { name: '환기공',   res: 'oxygen',    freq: 'normal', out: 5 },
  merchant:   { name: '상인',     freq: 'normal' },
  smith:      { name: '대장장이', freq: 'rare' },
  doctor:     { name: '의사',     freq: 'rare' },
  researcher: { name: '연구원',   freq: 'rare' },
};
export const RES_LABEL = { food: '식량', water: '물', power: '전력', oxygen: '산소', build: '건축 자원' };
export const BUILDINGS = {
  farm:     { name: '농장',       job: 'farmer',   start: 1 },
  purifier: { name: '정수 시설',   job: 'water',    start: 1 },
  plant:    { name: '발전소',     job: 'electric', start: 1 },
  vent:     { name: '환기탑',     job: 'vent',     start: 1 },
  mine:     { name: '광산',       job: 'miner',    start: 1 },
  seal:     { name: '봉쇄 시설',   start: 0, desc: '레벨당 감염된 방이 차오르는 속도 −15%' },
  vault:    { name: '금고',       start: 0, desc: '레벨당 포기할 때 잃는 돈 10% 보호' },
  smithy:   { name: '대장간',     start: 0, desc: '대장장이가 일하면 창 제작 가능' },
  clinic:   { name: '의무실',     start: 0, desc: '의사가 일하면 전투 밖에서 HP 회복' },
};
export const MAX_RESIDENTS = 20;
export const START_RESIDENTS = [
  { name: '한도윤', jobs: ['farmer', 'guard'], work: 'farmer' },
  { name: '오미란', jobs: ['miner', 'farmer'], work: 'miner' },
  { name: '강태식', jobs: ['electric', 'miner'], work: 'electric' },
  { name: '서유진', jobs: ['water', 'vent'], work: 'water' },
  { name: '문경호', jobs: ['guard', 'merchant'], work: 'guard' },
];
export const RESIDENT_NAMES = [
  '박서윤', '이준호', '최하은', '정민재', '윤지아', '임도현', '장예린', '신우진', '권나연', '조현우',
  '배수아', '류건', '남궁별', '황보람', '안채원', '송태오', '유다인', '홍재민', '전소율', '고은호',
  '양시우', '노하람', '구민서', '탁윤슬', '변주원', '엄태양',
];
// 생존자 등장 층: B65 부터 3층마다 (B65, B62 … B2)
export const isSurvivorFloor = (f) => f <= 65 && f % 3 === 2;

// ------------------------------------------------------------- 멘탈 이벤트
export const MENTAL = {
  reinfect: -2, bossLose: -3, residentDeath: -5, recording: -1,
  talk: +1, rest: +2, photo: +2, bossKill: +3,
};
export const REINFECT_CHANCE = 0.075;
