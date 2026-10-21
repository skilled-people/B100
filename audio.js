// 오디오: bgm_*.mp3 / sfx_*.mp3 파일을 Web Audio 로 재생한다.
const BGM_FILES = ['title', 'explore', 'town', 'tension', 'boss', 'father', 'ending'];
const BGM_GAIN = { title: 0.8, explore: 0.55, town: 0.65, tension: 0.6, boss: 0.7, father: 0.7, ending: 0.8 };
const SFX_FILES = ['swing', 'hit', 'hit_heavy', 'throw', 'gun', 'pickup', 'levelup', 'hurt', 'door', 'heart_break',
  'alarm', 'death', 'click', 'craft', 'boss_roar', 'dodge', 'explode', 'heal', 'giveup', 'rec_static', 'enemy_hit', 'spore'];

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.current = null; // { name, src, gain }
    this.musicVol = 0.7;
    this.sfxVol = 0.8;
    this.ready = false;
    this.lastPlay = {};
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVol;
    this.musicBus.connect(this.master);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);
    const load = async (path, key) => {
      try {
        const res = await fetch(path);
        const arr = await res.arrayBuffer();
        this.buffers[key] = await this.ctx.decodeAudioData(arr);
      } catch (e) {
        console.warn('오디오를 불러오지 못했습니다:', path, e);
      }
    };
    // 효과음과 타이틀 곡을 먼저, 나머지 BGM 은 이어서
    await Promise.all([
      load('bgm_title.mp3', 'bgm:title'),
      ...SFX_FILES.map((n) => load(`sfx_${n}.mp3`, 'sfx:' + n)),
    ]);
    this.ready = true;
    BGM_FILES.filter((n) => n !== 'title').forEach((n) => load(`bgm_${n}.mp3`, 'bgm:' + n));
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMusicVolume(v) {
    this.musicVol = v;
    if (this.musicBus) this.musicBus.gain.value = v;
  }
  setSfxVolume(v) {
    this.sfxVol = v;
    if (this.sfxBus) this.sfxBus.gain.value = v;
  }

  playBgm(name, fade = 1.6) {
    if (!this.ctx) return;
    if (this.current && this.current.name === name) return;
    const buf = this.buffers['bgm:' + name];
    const now = this.ctx.currentTime;
    if (this.current) {
      const old = this.current;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(() => { try { old.src.stop(); } catch (e) { /* 이미 멈춤 */ } }, fade * 1000 + 100);
      this.current = null;
    }
    if (!buf) {
      // 아직 로딩 중이면 잠시 후 다시 시도
      this.pending = name;
      setTimeout(() => { if (this.pending === name) { this.pending = null; this.playBgm(name, fade); } }, 600);
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(BGM_GAIN[name] ?? 0.7, now + fade);
    src.connect(g).connect(this.musicBus);
    src.start();
    this.current = { name, src, gain: g };
  }

  stopBgm(fade = 1.2) {
    if (!this.current || !this.ctx) return;
    const old = this.current;
    const now = this.ctx.currentTime;
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0, now + fade);
    setTimeout(() => { try { old.src.stop(); } catch (e) { /* 이미 멈춤 */ } }, fade * 1000 + 100);
    this.current = null;
  }

  sfx(name, vol = 1, pitchVar = 0.06, minGap = 0.03) {
    if (!this.ctx) return;
    const buf = this.buffers['sfx:' + name];
    if (!buf) return;
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < minGap) return;
    this.lastPlay[name] = now;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitchVar;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.sfxBus);
    src.start();
  }
}
