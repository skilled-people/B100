"""
《지하 100층》 BGM / 효과음 생성기
모든 소리는 이 스크립트가 수식으로 직접 합성한 오리지널 사운드입니다.

실행:  python tools/gen_audio.py
출력:  assets/audio/bgm/*.mp3, assets/audio/sfx/*.mp3
필요:  numpy, scipy, ffmpeg(libmp3lame)
"""
import os
import subprocess
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BGM = os.path.join(ROOT, "assets", "audio", "bgm")
SFX = os.path.join(ROOT, "assets", "audio", "sfx")
TMP = os.path.join(ROOT, "tools", "_tmp")
for d in (BGM, SFX, TMP):
    os.makedirs(d, exist_ok=True)

rng = np.random.default_rng(2026)

NOTE_IDX = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6,
            "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def midi(name):
    p = name[:-1]
    o = int(name[-1])
    return 12 * (o + 1) + NOTE_IDX[p]


def hz(n):
    if isinstance(n, str):
        n = midi(n)
    return 440.0 * 2 ** ((n - 69) / 12)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


# ------------------------------------------------------------ instruments
def piano(f, dur, vel=0.8):
    L = dur + 2.2
    t = tt(L)
    out = np.zeros_like(t)
    B = 0.00035
    for k in range(1, 10):
        fk = k * f * np.sqrt(1 + B * k * k)
        if fk > 12000:
            break
        amp = (1 / k ** 1.25) * (0.6 + 0.4 * vel)
        dec = 1.4 + k * 0.85 + f / 900
        out += amp * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28)) * np.exp(-t * dec)
    att = np.clip(t / 0.004, 0, 1)
    rel = np.where(t > dur, np.exp(-(t - dur) * 7), 1.0)
    ham = rng.standard_normal(len(t)) * np.exp(-t * 90) * 0.08
    return (out * att * rel + ham) * vel * 0.32


def bell(f, dur, vel=0.8, bright=1.0):
    t = tt(dur + 3.5)
    ratios = [0.5, 1.0, 2.0, 2.76, 5.40, 8.93]
    amps = [0.25, 1.0, 0.35, 0.45 * bright, 0.2 * bright, 0.08 * bright]
    decs = [1.0, 1.3, 2.0, 2.6, 4.5, 7.0]
    out = np.zeros_like(t)
    for r, a, d in zip(ratios, amps, decs):
        if f * r < 15000:
            out += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d)
    return out * np.clip(t / 0.002, 0, 1) * vel * 0.22


def musicbox(f, dur, vel=0.8):
    t = tt(2.6)
    out = (np.sin(2 * np.pi * f * t) * np.exp(-t * 2.2)
           + 0.4 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t * 5)
           + 0.18 * np.sin(2 * np.pi * f * 5.98 * t) * np.exp(-t * 9))
    click = rng.standard_normal(len(t)) * np.exp(-t * 400) * 0.15
    return (out + click) * vel * 0.25


def pluck(f, dur, vel=0.8, damp=0.996):
    L = int((dur + 1.4) * SR)
    N = max(2, int(round(SR / f)))
    buf = rng.uniform(-1, 1, N)
    # 부드러운 음색을 위해 초기 버퍼를 한번 걸러줌
    buf = 0.5 * (buf + np.roll(buf, 1))
    out = np.zeros(L + N)
    pos = 0
    while pos < L:
        out[pos:pos + N] = buf
        buf = damp * 0.5 * (buf + np.roll(buf, -1))
        pos += N
    out = out[:L]
    t = np.arange(L) / SR
    rel = np.where(t > dur, np.exp(-(t - dur) * 5), 1.0)
    return out * rel * vel * 0.35


def pad(freqs, dur, vel=0.6, att=0.9, rel=1.4, bright=0.35):
    L = dur + rel
    t = tt(L)
    out = np.zeros_like(t)
    for f in freqs:
        for det in (-0.0045, 0.0, 0.0052):
            ph = rng.uniform(0, 6.28)
            vib = 1 + 0.0018 * np.sin(2 * np.pi * (4.3 + det * 200) * t)
            for k, a in ((1, 1.0), (2, 0.45 * bright), (3, 0.25 * bright), (4, 0.12 * bright)):
                out += a * np.sin(2 * np.pi * f * k * (1 + det) * vib * t + ph * k)
    out /= (len(freqs) * 3)
    env = np.clip(t / att, 0, 1) * np.where(t > dur, np.exp(-(t - dur) * (4 / rel)), 1.0)
    return out * env * vel * 0.5


def choir(freqs, dur, vel=0.6, vowel="ah"):
    formants = {"ah": [(800, 80, 1.0), (1150, 90, 0.6), (2900, 120, 0.25)],
                "oo": [(350, 60, 1.0), (600, 70, 0.4), (2400, 120, 0.1)]}[vowel]
    L = dur + 1.8
    t = tt(L)
    out = np.zeros_like(t)
    for f in freqs:
        for det in (-0.006, 0.0, 0.006):
            vib = 1 + 0.004 * np.sin(2 * np.pi * (5.1 + det * 100) * t + rng.uniform(0, 6))
            for h in range(1, 40):
                hf = f * h
                if hf > 5000:
                    break
                a = sum(g * np.exp(-((hf - c) / bw) ** 2 / 2) for c, bw, g in formants) + 0.02
                out += (a / h ** 0.3) * np.sin(2 * np.pi * hf * (1 + det) * vib * t)
    out /= (len(freqs) * 3 * 4)
    env = np.clip(t / 1.2, 0, 1) * np.where(t > dur, np.exp(-(t - dur) * 2.4), 1.0)
    return out * env * vel


def bass(f, dur, vel=0.8, drive=1.6):
    t = tt(dur + 0.12)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    env = np.clip(t / 0.006, 0, 1) * np.exp(-t * 2.5) * np.where(t > dur, np.exp(-(t - dur) * 40), 1.0)
    return np.tanh(s * drive) * env * vel * 0.4


def saw(f, t, harm=14):
    out = np.zeros_like(t)
    for k in range(1, harm + 1):
        if f * k > 9000:
            break
        out += ((-1) ** (k + 1)) * np.sin(2 * np.pi * f * k * t) / k
    return out


def stab(freqs, dur, vel=0.7):
    t = tt(dur + 0.15)
    out = sum(saw(f * (1 + rng.uniform(-0.003, 0.003)), t, 10) for f in freqs) / len(freqs)
    env = np.clip(t / 0.005, 0, 1) * np.exp(-t * 9)
    b, a = signal.butter(2, 2600 / (SR / 2))
    return signal.lfilter(b, a, out * env) * vel * 0.45


def brass(f, dur, vel=0.7):
    t = tt(dur + 0.3)
    s = saw(f, t, 16) + saw(f * 1.004, t, 16) * 0.7
    env = np.clip(t / 0.06, 0, 1) * np.where(t > dur, np.exp(-(t - dur) * 12), 1.0)
    cut = 900 + 2200 * vel
    b, a = signal.butter(2, cut / (SR / 2))
    return np.tanh(signal.lfilter(b, a, s * env) * 1.4) * vel * 0.28


def strings_swell(freqs, dur, vel=0.6):
    t = tt(dur + 0.8)
    out = np.zeros_like(t)
    for f in freqs:
        for det in (-0.004, 0.003, 0.007):
            vib = 1 + 0.003 * np.sin(2 * np.pi * 5.5 * t + rng.uniform(0, 6))
            out += saw(f * (1 + det) * 1.0, t * vib, 12)
    out /= len(freqs) * 3
    env = (np.clip(t / dur, 0, 1) ** 2) * np.where(t > dur, np.exp(-(t - dur) * 6), 1.0)
    b, a = signal.butter(2, 2200 / (SR / 2))
    return signal.lfilter(b, a, out * env) * vel * 0.5


def kick(vel=1.0, low=45, high=130, dec=7):
    t = tt(0.5)
    f = low + (high - low) * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * dec)
    s += rng.standard_normal(len(t)) * np.exp(-t * 300) * 0.25
    return np.tanh(s * 1.5) * vel * 0.7


def snare(vel=1.0):
    t = tt(0.35)
    n = rng.standard_normal(len(t))
    b, a = signal.butter(2, [900 / (SR / 2), 6500 / (SR / 2)], "band")
    n = signal.lfilter(b, a, n) * np.exp(-t * 16)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 24)
    return (n * 0.9 + tone * 0.6) * vel * 0.5


def hat(vel=1.0, dec=55):
    t = tt(0.12)
    n = rng.standard_normal(len(t))
    b, a = signal.butter(2, 7000 / (SR / 2), "high")
    return signal.lfilter(b, a, n) * np.exp(-t * dec) * vel * 0.22


def noise_band(dur, lo, hi, color=0.0):
    n = rng.standard_normal(int(dur * SR))
    if color:
        n = np.cumsum(n)
        n -= signal.savgol_filter(n, 2001, 1) if len(n) > 2001 else 0
    b, a = signal.butter(2, [lo / (SR / 2), hi / (SR / 2)], "band")
    out = signal.lfilter(b, a, n)
    return out / (np.abs(out).max() + 1e-9)


# ------------------------------------------------------------ mix helpers
class Track:
    def __init__(self, length, tail=5.0):
        self.L = int(length * SR)
        self.tail = int(tail * SR)
        self.buf = np.zeros((2, self.L + self.tail))
        self.dry = np.zeros((2, self.L + self.tail))

    def place(self, sig, start, pan=0.0, gain=1.0, wet=True):
        i = int(start * SR)
        if i >= self.buf.shape[1]:
            return
        n = min(len(sig), self.buf.shape[1] - i)
        lg = np.cos((pan + 1) * np.pi / 4)
        rg = np.sin((pan + 1) * np.pi / 4)
        tgt = self.buf if wet else self.dry
        tgt[0, i:i + n] += sig[:n] * lg * gain
        tgt[1, i:i + n] += sig[:n] * rg * gain

    def render(self, reverb=2.6, wet=0.32, lowcut=30):
        ir_len = int(reverb * SR)
        t = np.arange(ir_len) / SR
        out = np.zeros_like(self.buf)
        b, a = signal.butter(1, 5000 / (SR / 2))
        for ch in range(2):
            ir = rng.standard_normal(ir_len) * np.exp(-t * 6.9 / reverb)
            ir = signal.lfilter(b, a, ir)
            ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
            ir /= np.sqrt(np.sum(ir ** 2))
            wetsig = signal.fftconvolve(self.buf[ch], ir)[: self.buf.shape[1]]
            out[ch] = self.buf[ch] * (1 - wet * 0.5) + wetsig * wet * 1.6 + self.dry[ch]
        # 루프 이음매: 꼬리를 앞쪽에 겹쳐 끊김 없이 반복되게
        loop = out[:, : self.L].copy()
        loop[:, : self.tail] += out[:, self.L: self.L + self.tail]
        bh, ah = signal.butter(2, lowcut / (SR / 2), "high")
        loop = signal.lfilter(bh, ah, loop, axis=1)
        return loop


def master(x, peak_db=-1.2):
    x = np.tanh(x / (np.abs(x).max() + 1e-9) * 1.25)
    x = x / (np.abs(x).max() + 1e-9) * (10 ** (peak_db / 20))
    return x


def export(x, name, folder, bitrate="160k", mono=False):
    wav = os.path.join(TMP, name + ".wav")
    if x.ndim == 2:
        data = (x.T * 32767).astype(np.int16)
    else:
        data = (x * 32767).astype(np.int16)
    wavfile.write(wav, SR, data)
    mp3 = os.path.join(folder, name + ".mp3")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", bitrate]
    if mono:
        cmd += ["-ac", "1"]
    subprocess.run(cmd + [mp3], check=True)
    os.remove(wav)
    print("  ", name, f"{len(data) / SR:.1f}s")


def chord_notes(root, kind, octave=3):
    r = midi(root + str(octave))
    iv = {"m": [0, 3, 7], "M": [0, 4, 7], "dim": [0, 3, 6], "7": [0, 4, 7, 10]}[kind]
    return [r + i for i in iv]


def play_melody(tr, inst, mel, start, beat, transpose=0, gain=1.0, pan=0.0, vel=0.8, **kw):
    """mel: [(note|None, beats), ...]"""
    t = start
    for n, d in mel:
        if n is not None:
            f = hz(midi(n) + transpose)
            tr.place(inst(f, d * beat * 0.95, vel, **kw), t, pan, gain)
        t += d * beat
    return t


# 주제 선율 (아버지의 테마) — 가 단조
LEIT = [("E5", 1.5), ("D5", 0.5), ("C5", 2),
        ("A4", 3), ("C5", 1),
        ("G4", 1.5), ("A4", 0.5), ("C5", 2),
        ("B4", 4),
        ("E5", 1.5), ("D5", 0.5), ("C5", 1), ("E5", 1),
        ("F5", 2), ("E5", 1), ("D5", 1),
        ("D5", 1.5), ("C5", 0.5), ("A4", 2),
        ("G#4", 3), ("B4", 1)]


# ------------------------------------------------------------ tracks
def track_title():
    bpm = 70
    beat = 60 / bpm
    bar = beat * 4
    prog = [("A", "m"), ("F", "M"), ("C", "M"), ("G", "M"), ("A", "m"), ("F", "M"), ("D", "m"), ("E", "M")]
    tr = Track(16 * bar)
    for i in range(16):
        root, kind = prog[(i // 2) % 8]
        ch = chord_notes(root, kind, 3)
        t0 = i * bar
        if i % 2 == 0:
            tr.place(pad([hz(n) for n in ch] + [hz(ch[0] - 12)], bar * 2, 0.55), t0, 0, 0.9)
        pat = [ch[0] - 12, ch[2] - 12, ch[0], ch[1], ch[2], ch[1], ch[0], ch[2] - 12]
        for k, n in enumerate(pat):
            v = 0.55 + 0.15 * (k == 0) + rng.uniform(-0.05, 0.05)
            tr.place(piano(hz(n), beat * 0.9, v), t0 + k * beat / 2 + rng.uniform(0, 0.012), -0.25 + k * 0.07, 0.9)
    play_melody(tr, bell, LEIT, 8 * bar, beat, 0, gain=0.9, pan=0.2, vel=0.7)
    return master(tr.render(3.2, 0.38))


def track_explore():
    L = 64.0
    tr = Track(L, 6)
    t = tt(L)
    # 저음 드론 (D + A) 과 느린 음색 변화
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * t / 32)
    drone = (np.sin(2 * np.pi * hz("D2") * t) * 0.5 + np.sin(2 * np.pi * hz("A2") * t) * 0.3
             + saw(hz("D2"), t, 8) * (0.06 + 0.1 * lfo))
    drone *= np.clip(t / 3, 0, 1) * np.clip((L - t) / 3, 0, 1) * 0.5 + 0.5 * np.clip(t / 3, 0, 1)
    tr.place(drone * 0.35, 0, 0, 1.0)
    wind = noise_band(L, 180, 900)
    wl = 0.5 + 0.5 * np.sin(2 * np.pi * t / 11 + 1) * np.sin(2 * np.pi * t / 7)
    tr.place(wind * wl * 0.12, 0, -0.3)
    tr.place(noise_band(L, 300, 1400) * (0.5 + 0.5 * np.sin(2 * np.pi * t / 13)) * 0.07, 0, 0.4)
    scale = ["D3", "F3", "A3", "C4", "E4", "D4", "A2", "G3"]
    tpos = 1.5
    while tpos < L - 2:
        n = scale[rng.integers(len(scale))]
        tr.place(piano(hz(n), 1.8, rng.uniform(0.35, 0.55)), tpos, rng.uniform(-0.6, 0.6), 0.9)
        tpos += rng.uniform(2.8, 5.5)
    for tb in (9.0, 26.0, 47.0):
        tr.place(bell(hz("D3"), 2.0, 0.5, bright=0.6), tb, rng.uniform(-0.8, 0.8), 0.8)
    tpos = 2.0
    while tpos < L - 1:
        f = rng.uniform(1300, 2400)
        d = tt(0.18)
        drip = np.sin(2 * np.pi * (f + 1800 * d) * d) * np.exp(-d * 38)
        tr.place(drip * 0.25, tpos, rng.uniform(-0.9, 0.9))
        tpos += rng.uniform(3.5, 9.0)
    # 아버지의 테마 조각
    play_melody(tr, piano, [("A4", 1.5), ("G4", 0.5), ("F4", 3)], 33.0, 0.95, gain=0.7, pan=0.1, vel=0.45)
    return master(tr.render(4.0, 0.5), -2.5)


def track_town():
    bpm = 84
    beat = 60 / bpm
    bar = beat * 4
    prog = [("F", "M"), ("A", "m"), ("A#", "M"), ("C", "M"), ("F", "M"), ("D", "m"), ("G", "m"), ("C", "M"),
            ("F", "M"), ("A", "m"), ("A#", "M"), ("C", "M"), ("D", "m"), ("A#", "M"), ("C", "M"), ("F", "M")]
    tr = Track(16 * bar)
    for i, (root, kind) in enumerate(prog):
        ch = chord_notes(root, kind, 3)
        t0 = i * bar
        tr.place(pad([hz(n) for n in ch], bar, 0.42, att=0.5, rel=1.0), t0, 0, 0.8)
        pat = [ch[0] - 12, ch[2] - 12, ch[1], ch[2], ch[0] + 12, ch[2], ch[1], ch[2] - 12]
        for k, n in enumerate(pat):
            tr.place(pluck(hz(n), beat * 0.6, 0.6 + 0.1 * (k % 4 == 0)), t0 + k * beat / 2 + rng.uniform(0, 0.008),
                     -0.35 + 0.1 * (k % 4), 1.0)
        for k in range(4):
            tr.place(hat(0.25, 80), t0 + k * beat + beat / 2, 0.4, 0.7)
    mel = [("C5", 1.5), ("D5", 0.5), ("C5", 2), ("A4", 3), ("C5", 1), ("D5", 1.5), ("C5", 0.5), ("A#4", 2), ("G4", 4),
           ("A4", 1.5), ("A#4", 0.5), ("C5", 1), ("F5", 1), ("E5", 2), ("D5", 1), ("C5", 1), ("D5", 1.5), ("C5", 0.5),
           ("A#4", 2), ("A4", 3), (None, 1)]
    play_melody(tr, bell, mel, 8 * bar, beat, 0, gain=0.8, pan=0.25, vel=0.6, bright=0.7)
    return master(tr.render(2.4, 0.3), -2.0)


def track_tension():
    bpm = 120
    beat = 60 / bpm
    bar = beat * 4
    tr = Track(32 * bar, 4)
    roots = ["E", "C", "A", "B"]
    for i in range(32):
        r = roots[(i // 4) % 4]
        t0 = i * bar
        for k in range(8):
            n = midi(r + "1") + (12 if k % 2 else 0)
            tr.place(bass(hz(n), beat * 0.42, 0.75), t0 + k * beat / 2, 0, 0.9, wet=False)
        for k in range(16):
            tr.place(hat(0.25 + 0.25 * (k % 4 == 0), 70), t0 + k * beat / 4, 0.3 * ((k % 2) * 2 - 1), 0.55, wet=False)
        if i >= 8:
            tr.place(kick(0.8), t0, 0, 0.9, wet=False)
            tr.place(kick(0.6), t0 + 2 * beat, 0, 0.9, wet=False)
        if i >= 16:
            tr.place(snare(0.6), t0 + 3 * beat, 0.1, 0.8)
        if i % 4 == 0:
            cl = [hz("E4"), hz("F4"), hz("B4")] if r in ("E", "B") else [hz("C4"), hz("C#4"), hz("G4")]
            tr.place(strings_swell(cl, bar * 4, 0.55), t0, 0, 0.8)
        if i % 2 == 1 and i >= 4:
            m = [midi(r + "4") + o for o in (0, 3, 7, 3)]
            for k, n in enumerate(m):
                tr.place(stab([hz(n)], beat * 0.3, 0.45), t0 + k * beat, -0.3 + 0.2 * k, 0.6)
    return master(tr.render(1.8, 0.22), -1.5)


def track_boss():
    bpm = 140
    beat = 60 / bpm
    bar = beat * 4
    tr = Track(24 * bar, 3)
    roots = ["D", "D", "A#", "A#", "C", "C", "A", "A"]
    ost = [0, 0, 12, 0, 3, 0, 7, 0, 0, 0, 12, 0, 5, 3, 0, -2]
    for i in range(24):
        r = roots[i % 8]
        t0 = i * bar
        base = midi(r + "2")
        for k, o in enumerate(ost):
            tr.place(bass(hz(base + o), beat * 0.22, 0.7, drive=2.4), t0 + k * beat / 4, 0, 0.85, wet=False)
        for k in (0, 1.5, 2.5):
            tr.place(kick(1.0, 42, 150, 9), t0 + k * beat, 0, 1.0, wet=False)
        for k in (1, 3):
            tr.place(snare(0.9), t0 + k * beat, 0.05, 1.0)
        for k in range(8):
            tr.place(hat(0.4 + 0.3 * (k % 2), 60), t0 + k * beat / 2, 0.35, 0.6, wet=False)
        kind = "m" if r in ("D", "A") else "M"
        ch = [hz(n) for n in chord_notes(r, kind, 4)]
        for k in (0.5, 1.5, 2.75, 3.5):
            tr.place(stab(ch, beat * 0.25, 0.55), t0 + k * beat, -0.35, 0.7)
    lead = [("A4", 1.5), ("G4", 0.5), ("F4", 2), ("D4", 3), ("F4", 1), ("C4", 1.5), ("D4", 0.5), ("F4", 2), ("E4", 4),
            ("A4", 1.5), ("G4", 0.5), ("F4", 1), ("A4", 1), ("A#4", 2), ("A4", 1), ("G4", 1), ("G4", 1.5), ("F4", 0.5),
            ("D4", 2), ("C#4", 3), ("E4", 1)]
    play_melody(tr, brass, lead, 8 * bar, beat, 0, gain=0.9, pan=0.15, vel=0.75)
    return master(tr.render(1.6, 0.2), -1.0)


def track_father():
    bpm = 60
    beat = 60 / bpm
    bar = beat * 4
    tr = Track(16 * bar, 6)
    prog = [("C", "m"), ("G#", "M"), ("D#", "M"), ("A#", "M")]
    for i in range(0, 16, 2):
        root, kind = prog[(i // 2) % 4]
        ch = [hz(n) for n in chord_notes(root, kind, 3)]
        tr.place(choir(ch, bar * 2, 0.75, "ah" if i % 4 == 0 else "oo"), i * bar, 0, 0.9)
    t = tt(16 * bar)
    tr.place(np.sin(2 * np.pi * hz("C2") * t) * 0.18 * np.clip(t / 4, 0, 1), 0, 0, 1.0)
    for b in range(64):
        tb = b * beat
        tr.place(kick(0.5, 40, 70, 10), tb, 0, 0.8, wet=False)
        tr.place(kick(0.32, 38, 62, 12), tb + 0.22, 0, 0.8, wet=False)
    play_melody(tr, piano, LEIT, 4 * bar, beat, 3, gain=1.0, pan=0.0, vel=0.62)
    return master(tr.render(4.5, 0.48), -1.5)


def track_ending():
    bpm = 66
    beat = 60 / bpm
    bar = beat * 4
    prog = [("A", "m"), ("F", "M"), ("C", "M"), ("G", "M"), ("A", "m"), ("F", "M"), ("G", "M"), ("C", "M")]
    tr = Track(16 * bar, 6)
    for i in range(16):
        root, kind = prog[(i // 2) % 8]
        ch = [hz(n) for n in chord_notes(root, kind, 3)]
        if i % 2 == 0:
            tr.place(pad(ch, bar * 2, 0.45, att=1.4, rel=2.0, bright=0.2), i * bar, 0, 0.9)
        for k in range(4):
            n = chord_notes(root, kind, 4)[k % 3] + (12 if k == 3 else 0)
            tr.place(musicbox(hz(n + 12), beat, 0.25), i * bar + k * beat + beat / 2, -0.4, 0.6)
    mel = LEIT[:-2] + [("A4", 2), ("C5", 1), ("E5", 1)]
    play_melody(tr, musicbox, mel, 0, beat, 12, gain=1.0, pan=0.15, vel=0.7)
    play_melody(tr, musicbox, mel, 8 * bar, beat, 12, gain=0.9, pan=-0.1, vel=0.6)
    return master(tr.render(4.0, 0.45), -2.0)


# ------------------------------------------------------------ sfx
def fit(x, n):
    x = np.asarray(x)
    return x[:n] if len(x) >= n else np.pad(x, (0, n - len(x)))


def env_exp(n, k):
    return np.exp(-np.arange(n) / SR * k)


def sfx_all():
    out = {}
    d = 0.32
    n = noise_band(d, 300, 3000)
    t = tt(d)
    out["swing"] = n * np.sin(np.pi * t / d) ** 2 * 0.7
    d = 0.35
    t = tt(d)
    out["hit"] = (noise_band(d, 120, 2400) * np.exp(-t * 30) * 0.6 + np.sin(2 * np.pi * (90 + 120 * np.exp(-t * 30)) * t) * np.exp(-t * 18) * 0.8)
    out["hit_heavy"] = np.tanh((noise_band(0.5, 60, 1200) * np.exp(-tt(0.5) * 14) + fit(kick(1.2, 38, 110, 8), int(0.5 * SR))) * 1.6) * 0.8
    d = 0.25
    t = tt(d)
    out["throw"] = noise_band(d, 600, 5000) * np.sin(np.pi * t / d) ** 3 * 0.5
    d = 0.6
    t = tt(d)
    crack = rng.standard_normal(len(t)) * np.exp(-t * 60)
    out["gun"] = np.tanh((crack + np.sin(2 * np.pi * 70 * t) * np.exp(-t * 12) * 1.4 + noise_band(d, 100, 900) * np.exp(-t * 8) * 0.5) * 1.8) * 0.8
    out["pickup"] = np.concatenate([bell(hz("E6"), 0.08, 0.9)[: int(0.09 * SR)], bell(hz("B6"), 0.3, 0.9)[: int(0.45 * SR)]])
    lv = np.zeros(int(1.4 * SR))
    for k, nn in enumerate(["C5", "E5", "G5", "C6"]):
        b = bell(hz(nn), 0.3, 0.9)[: int(0.9 * SR)]
        i = int(k * 0.09 * SR)
        lv[i:i + len(b)] += b[: len(lv) - i]
    out["levelup"] = lv
    d = 0.4
    t = tt(d)
    out["hurt"] = np.tanh((np.sin(2 * np.pi * (160 * np.exp(-t * 4)) * t) * np.exp(-t * 10) + noise_band(d, 200, 1500) * np.exp(-t * 20) * 0.5) * 2) * 0.7
    d = 0.9
    t = tt(d)
    clunk = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * k) for f, k in ((180, 9), (410, 14), (1230, 20), (2650, 30)))
    out["door"] = (clunk * 0.35 + noise_band(d, 100, 600) * np.exp(-t * 12) * 0.5) * 0.8
    d = 1.2
    t = tt(d)
    out["heart_break"] = (noise_band(d, 400, 7000) * np.exp(-t * 6) * 0.6 + np.sin(2 * np.pi * (300 * np.exp(-t * 3)) * t) * np.exp(-t * 4) * 0.6
                          + sum(fit(bell(rng.uniform(1500, 4000), 0.2, 0.4), len(t)) for _ in range(6)))
    d = 1.6
    t = tt(d)
    f = np.where((t * 2.5) % 1 < 0.5, 660, 880)
    ph = 2 * np.pi * np.cumsum(f) / SR
    out["alarm"] = np.tanh(np.sin(ph) * 2) * 0.35 * np.clip((d - t) / 0.1, 0, 1)
    d = 1.6
    t = tt(d)
    out["death"] = np.sin(2 * np.pi * (220 * np.exp(-t * 1.2)) * t) * np.exp(-t * 1.6) * 0.6 + noise_band(d, 80, 400) * np.exp(-t * 3) * 0.3
    d = 0.06
    t = tt(d)
    out["click"] = np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 90) * 0.4
    cr = np.zeros(int(0.9 * SR))
    for k in range(3):
        tc = tt(0.3)
        c = sum(np.sin(2 * np.pi * f * tc) * np.exp(-tc * 18) for f in (820, 1640, 2900)) * 0.25 + rng.standard_normal(len(tc)) * np.exp(-tc * 80) * 0.3
        i = int(k * 0.22 * SR)
        cr[i:i + len(c)] += c[: len(cr) - i]
    out["craft"] = cr
    d = 1.5
    t = tt(d)
    lfo = 1 + 0.3 * np.sin(2 * np.pi * 9 * t)
    roar = noise_band(d, 80, 700) * lfo + np.sin(2 * np.pi * 60 * lfo * t) * 0.6
    out["boss_roar"] = np.tanh(roar * 2.2) * np.clip(t / 0.15, 0, 1) * np.exp(-t * 1.3) * 0.8
    d = 0.22
    t = tt(d)
    out["dodge"] = noise_band(d, 400, 2500) * np.sin(np.pi * t / d) ** 2 * 0.45
    d = 1.1
    t = tt(d)
    out["explode"] = np.tanh((noise_band(d, 40, 1800) * np.exp(-t * 5) * 1.4 + fit(kick(1.3, 30, 90, 5), len(t))) * 2) * 0.85
    hl = np.zeros(int(1.0 * SR))
    for k, nn in enumerate(["G5", "C6", "E6"]):
        b = bell(hz(nn), 0.3, 0.6, bright=0.4)[: int(0.7 * SR)]
        i = int(k * 0.07 * SR)
        hl[i:i + len(b)] += b[: len(hl) - i]
    out["heal"] = hl
    gu = pad([hz("A2"), hz("C3"), hz("E3")], 1.4, 0.8, att=0.05, rel=1.2)
    out["giveup"] = gu
    d = 0.5
    t = tt(d)
    out["rec_static"] = noise_band(d, 1000, 6000) * (0.5 + 0.5 * (rng.random(len(t)) > 0.97)) * 0.25
    d = 0.15
    t = tt(d)
    out["enemy_hit"] = noise_band(d, 300, 3000) * np.exp(-t * 35) * 0.5 + np.sin(2 * np.pi * 220 * t) * np.exp(-t * 40) * 0.3
    d = 0.5
    t = tt(d)
    out["spore"] = noise_band(d, 1500, 6000) * np.exp(-t * 6) * 0.35 + noise_band(d, 200, 800) * np.exp(-t * 10) * 0.3
    return out


if __name__ == "__main__":
    import sys
    only_sfx = "--sfx" in sys.argv
    print("BGM…")
    if not only_sfx:
      export(track_title(), "title", BGM)
      export(track_explore(), "explore", BGM)
      export(track_town(), "town", BGM)
      export(track_tension(), "tension", BGM)
      export(track_boss(), "boss", BGM)
      export(track_father(), "father", BGM)
      export(track_ending(), "ending", BGM)
    print("SFX…")
    for name, x in sfx_all().items():
        x = np.asarray(x, dtype=np.float64)
        x = x / (np.abs(x).max() + 1e-9) * 0.89
        fade = min(len(x), int(0.01 * SR))
        x[-fade:] *= np.linspace(1, 0, fade)
        export(x, name, SFX, "128k", mono=True)
    try:
        os.rmdir(TMP)
    except OSError:
        pass
    print("done")
