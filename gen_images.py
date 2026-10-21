"""
《지하 100층》 이미지·텍스처 생성기
모든 그림은 이 스크립트가 직접 그린 오리지널 에셋입니다 (외부 리소스 없음).

실행:  python gen_images.py
출력:  tex_*.png, img_*.jpg (같은 폴더)
필요:  numpy, pillow, scipy
"""
import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.abspath(__file__))
TEX = ROOT
IMG = ROOT
os.makedirs(TEX, exist_ok=True)
os.makedirs(IMG, exist_ok=True)


# ---------------------------------------------------------------- noise
def fbm(h, w=None, beta=2.0, seed=0, aniso=(1.0, 1.0)):
    """FFT 스펙트럼 합성 노이즈. 결과는 자동으로 이음매 없이 타일링된다."""
    w = w or h
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((h, w))
    F = np.fft.fft2(white)
    fy = np.fft.fftfreq(h)[:, None] * aniso[0]
    fx = np.fft.fftfreq(w)[None, :] * aniso[1]
    f = np.sqrt(fx ** 2 + fy ** 2)
    f[0, 0] = 1.0
    F = F / (f ** (beta / 2.0))
    F[0, 0] = 0
    out = np.real(np.fft.ifft2(F))
    out -= out.min()
    out /= max(out.max(), 1e-9)
    return out


def lerp(a, b, t):
    return a + (b - a) * t


def colorize(t, stops):
    """t(0..1) 배열을 색 정지점 목록으로 매핑."""
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,), dtype=np.float32)
    for i in range(len(stops) - 1):
        p0, c0 = stops[i]
        p1, c1 = stops[i + 1]
        m = (t >= p0) & (t <= p1)
        k = ((t - p0) / max(p1 - p0, 1e-9))[..., None]
        out[m] = (np.array(c0) + (np.array(c1) - np.array(c0)) * k)[m]
    return out


def normal_from_height(hmap, strength=4.0):
    gy, gx = np.gradient(hmap)
    # 타일링이 깨지지 않도록 가장자리 기울기는 순환 차분으로 다시 계산
    gx = (np.roll(hmap, -1, axis=1) - np.roll(hmap, 1, axis=1)) * 0.5
    gy = (np.roll(hmap, -1, axis=0) - np.roll(hmap, 1, axis=0)) * 0.5
    nx = -gx * strength
    ny = -gy * strength
    nz = np.ones_like(hmap)
    l = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    n = np.stack([nx / l, -ny / l, nz / l], axis=-1)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)


def save_rgb(arr, path):
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    if path.endswith(".jpg"):
        im.save(path, quality=88, optimize=True, progressive=True)
    else:
        im.save(path, optimize=True)


def grain(img_arr, amount=6, seed=1):
    rng = np.random.default_rng(seed)
    return img_arr + rng.normal(0, amount, img_arr.shape[:2])[..., None]


# ---------------------------------------------------------------- textures
def tex_rock(n=512):
    base = fbm(n, beta=2.3, seed=11)
    detail = fbm(n, beta=1.3, seed=12)
    ridge = 1.0 - np.abs(2 * fbm(n, beta=2.7, seed=13) - 1)
    cracks = ndimage.gaussian_filter(np.clip((ridge - 0.935) / 0.065, 0, 1) ** 1.2, 0.7, mode='wrap')
    yy = np.arange(n)[:, None] / n
    strata = 0.5 + 0.5 * np.sin((yy * 9 + base * 1.6) * math.pi * 2)
    h = base * 0.55 + detail * 0.25 + strata * 0.2 - cracks * 0.55
    h = (h - h.min()) / (h.max() - h.min())
    col = colorize(h, [(0, (26, 23, 22)), (0.35, (58, 51, 46)), (0.7, (96, 86, 76)), (1, (132, 120, 104))])
    col *= (1 - cracks[..., None] * 0.6)
    col = grain(col, 5, 3)
    save_rgb(col, os.path.join(TEX, "tex_rock_wall.png"))
    Image.fromarray(normal_from_height(h, 6.0)).save(os.path.join(TEX, "tex_rock_wall_n.png"), optimize=True)


def tex_floor(n=512):
    base = fbm(n, beta=2.0, seed=21)
    stains = fbm(n, beta=3.2, seed=22)
    speck = fbm(n, beta=0.4, seed=23)
    h = base * 0.6 + speck * 0.4
    col = colorize(h, [(0, (54, 56, 58)), (0.5, (84, 86, 86)), (1, (118, 117, 112))])
    st = np.clip((stains - 0.55) / 0.35, 0, 1)[..., None]
    col = col * (1 - st * 0.45) + np.array([38, 34, 28]) * st * 0.2
    # 슬래브 이음매 (4x4)
    seam = np.zeros((n, n), dtype=np.float32)
    cell = n // 4
    for i in range(0, n, cell):
        seam[max(i - 1, 0):i + 2, :] = 1
        seam[:, max(i - 1, 0):i + 2] = 1
    breaks = fbm(n, beta=1.0, seed=24) > 0.35
    seam = seam * breaks
    seam = ndimage.gaussian_filter(seam, 0.8)
    col *= (1 - seam[..., None] * 0.5)
    hh = h - seam * 0.6
    col = grain(col, 4, 25)
    save_rgb(col, os.path.join(TEX, "tex_floor_concrete.png"))
    Image.fromarray(normal_from_height(hh, 3.0)).save(os.path.join(TEX, "tex_floor_concrete_n.png"), optimize=True)


def tex_metal(n=512):
    brushed = fbm(n, beta=1.6, seed=31, aniso=(6.0, 0.15))
    rustmask = fbm(n, beta=2.4, seed=32)
    rust = np.clip((rustmask - 0.58) / 0.25, 0, 1)
    col = colorize(brushed, [(0, (70, 74, 78)), (1, (128, 132, 134))])
    rustc = colorize(fbm(n, beta=1.2, seed=33), [(0, (72, 34, 18)), (1, (150, 78, 36))])
    col = col * (1 - rust[..., None]) + rustc * rust[..., None]
    img = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    for i in range(0, n, n // 4):
        d.line([(0, i), (n, i)], fill=(40, 42, 44), width=3)
        for j in range(16, n, n // 8):
            d.ellipse([j - 6, i + 10, j + 6, i + 22], fill=(150, 152, 150), outline=(50, 50, 50))
    arr = np.array(img).astype(np.float32)
    arr = grain(arr, 3, 34)
    save_rgb(arr, os.path.join(TEX, "tex_metal_plate.png"))
    Image.fromarray(normal_from_height(brushed * 0.5 - rust * 0.4, 2.0)).save(os.path.join(TEX, "tex_metal_plate_n.png"), optimize=True)


def tex_vine(n=256):
    a = fbm(n, beta=1.4, seed=41, aniso=(0.2, 5.0))
    b = fbm(n, beta=2.2, seed=42)
    h = a * 0.7 + b * 0.3
    col = colorize(h, [(0, (22, 44, 22)), (0.5, (58, 96, 46)), (1, (128, 160, 84))])
    col = grain(col, 5, 43)
    save_rgb(col, os.path.join(TEX, "tex_vine.png"))


def tex_moss_patch(n=256):
    rng = np.random.default_rng(51)
    yy, xx = np.mgrid[0:n, 0:n] / n - 0.5
    r = np.sqrt(xx ** 2 + yy ** 2)
    noise = fbm(n, beta=2.0, seed=52)
    alpha = np.clip((0.48 - r) * 4.0 + (noise - 0.5) * 1.6, 0, 1)
    alpha = np.clip(alpha * 1.4, 0, 1)
    col = colorize(fbm(n, beta=1.1, seed=53), [(0, (30, 58, 26)), (0.6, (70, 110, 50)), (1, (150, 178, 92))])
    rgba = np.dstack([np.clip(col, 0, 255), alpha * 255]).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(os.path.join(TEX, "tex_moss_patch.png"), optimize=True)


def tex_spore(n=64):
    yy, xx = np.mgrid[0:n, 0:n] / (n - 1) - 0.5
    r = np.sqrt(xx ** 2 + yy ** 2) * 2
    a = np.clip(1 - r, 0, 1) ** 2.2
    core = np.clip(1 - r * 3, 0, 1)
    v = np.clip(a * 0.85 + core, 0, 1)
    rgba = np.dstack([np.full((n, n), 255), np.full((n, n), 255), np.full((n, n), 255), v * 255]).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(os.path.join(TEX, "tex_spore.png"))


def tex_decal_ring(n=256):
    """보스 장판 경고용 원형 데칼"""
    yy, xx = np.mgrid[0:n, 0:n] / (n - 1) - 0.5
    r = np.sqrt(xx ** 2 + yy ** 2) * 2
    ring = np.clip(1 - np.abs(r - 0.94) * 22, 0, 1)
    fill = np.clip(1 - r, 0, 1) ** 0.6 * (r < 1) * 0.35
    v = np.clip(ring + fill, 0, 1)
    rgba = np.dstack([np.full((n, n), 255), np.full((n, n), 255), np.full((n, n), 255), v * 255]).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(os.path.join(TEX, "tex_decal_ring.png"))


def tex_blob_shadow(n=128):
    yy, xx = np.mgrid[0:n, 0:n] / (n - 1) - 0.5
    r = np.sqrt(xx ** 2 + yy ** 2) * 2
    a = np.clip(1 - r, 0, 1) ** 1.6
    rgba = np.dstack([np.zeros((n, n)), np.zeros((n, n)), np.zeros((n, n)), a * 200]).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(os.path.join(TEX, "tex_blob_shadow.png"))


# ---------------------------------------------------------------- illustrations
def glow_layer(size, points, blur):
    layer = Image.new("RGB", size, (0, 0, 0))
    d = ImageDraw.Draw(layer)
    for (x, y, r, c) in points:
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    return layer.filter(ImageFilter.GaussianBlur(blur))


def add(a, b, k=1.0):
    return np.clip(np.asarray(a, np.float32) + np.asarray(b, np.float32) * k, 0, 255)


def vignette(arr, strength=0.75):
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    xx = xx / w - 0.5
    yy = yy / h - 0.5
    r = np.sqrt(xx ** 2 * 1.2 + yy ** 2 * 1.6)
    v = 1 - np.clip(r * strength * 1.6, 0, 1) ** 1.8
    return arr * v[..., None]


def img_title(W=1920, H=1080):
    rng = np.random.default_rng(101)
    y = np.linspace(0, 1, H)[:, None, None]
    top = np.array([46, 58, 60], np.float32)
    mid = np.array([22, 20, 22], np.float32)
    bot = np.array([16, 11, 9], np.float32)
    grad = np.where(y < 0.35, lerp(top, mid, y / 0.35), lerp(mid, bot, (y - 0.35) / 0.65))
    arr = np.broadcast_to(grad, (H, W, 3)).copy()

    # 양쪽 암벽
    rock = fbm(H, W, beta=2.2, seed=102)
    wall = colorize(rock, [(0, (14, 12, 11)), (1, (52, 46, 40))])
    xs = np.arange(W)[None, :]
    edgeL = 470 + (fbm(H, 1, beta=2.5, seed=103)[:, 0] - 0.5) * 140
    edgeR = W - 470 + (fbm(H, 1, beta=2.5, seed=104)[:, 0] - 0.5) * 140
    maskL = xs < edgeL[:, None]
    maskR = xs > edgeR[:, None]
    m = (maskL | maskR)[..., None]
    arr = np.where(m, wall, arr)

    img = Image.fromarray(arr.astype(np.uint8))
    d = ImageDraw.Draw(img)
    # 층 구조: 위로 갈수록 작아지는 원근감 있는 층판
    floors = 26
    glows = []
    for i in range(floors):
        t = i / (floors - 1)
        yline = int(lerp(1060, 90, t ** 0.78))
        thick = int(lerp(16, 3, t))
        x0 = int(lerp(380, 860, t ** 1.2))
        x1 = W - x0
        d.rectangle([x0, yline, x1, yline + thick], fill=(30, 27, 25))
        d.line([x0, yline, x1, yline], fill=(70, 62, 54), width=max(1, thick // 5))
        # 창문 불빛
        nwin = int(lerp(14, 3, t))
        for k in range(nwin):
            if rng.random() < 0.55:
                wx = rng.uniform(x0 + 20, x1 - 20)
                ww = lerp(16, 4, t)
                wh = lerp(10, 3, t)
                warm = (240, 176, 82) if t < 0.62 else (226, 120, 160)
                d.rectangle([wx, yline - wh - 4, wx + ww, yline - 4], fill=warm)
                glows.append((wx + ww / 2, yline - wh / 2 - 4, lerp(12, 4, t), warm))
        # 위쪽 층일수록 식물 발광
        if t > 0.45:
            for k in range(int(lerp(2, 9, t))):
                gx = rng.uniform(x0, x1)
                glows.append((gx, yline + rng.uniform(-4, 18), rng.uniform(4, 11) * (1.2 - t * 0.5),
                              (96, 168, 90) if rng.random() < 0.7 else (214, 110, 160)))
    g = glow_layer((W, H), glows, 9)
    arr = add(np.array(img), g, 0.75)

    # 위에서 내려오는 빛줄기
    xx = np.arange(W)[None, :]
    yy = np.arange(H)[:, None]
    shaft = np.exp(-((xx - W / 2) / (90 + yy * 0.18)) ** 2) * np.clip(1 - yy / H * 1.05, 0, 1) ** 1.5
    arr = add(arr, np.stack([shaft * 70, shaft * 92, shaft * 96], -1))

    # 매달린 덩굴
    img = Image.fromarray(arr.astype(np.uint8))
    d = ImageDraw.Draw(img)
    for k in range(70):
        side = rng.random() < 0.5
        x = rng.uniform(380, 640) if side else rng.uniform(W - 640, W - 380)
        y0 = rng.uniform(-20, 420)
        L = rng.uniform(120, 520)
        pts = []
        for s in range(30):
            u = s / 29
            pts.append((x + math.sin(u * 6 + k) * 10 * u, y0 + L * u))
        d.line(pts, fill=(34, 62, 34), width=int(rng.uniform(2, 6)))
    arr = np.array(img).astype(np.float32)

    # 포자 입자
    pts = []
    for k in range(260):
        pts.append((rng.uniform(0, W), rng.uniform(0, H), rng.uniform(1, 3.2),
                    (200, 240, 190) if rng.random() < 0.75 else (255, 170, 210)))
    arr = add(arr, glow_layer((W, H), pts, 2.2), 1.6)
    arr = vignette(arr, 0.8)
    arr = grain(arr, 5, 105)
    save_rgb(arr, os.path.join(IMG, "img_title_bg.jpg"))


def draw_family(d, W, H, ox, oy, s):
    """사진 속 두 사람 (아버지와 15살 아들)."""
    # 아버지 (왼쪽, 키 큼)
    fx, fy = ox + 175 * s, oy + 170 * s
    d.rounded_rectangle([fx - 78 * s, fy + 58 * s, fx + 78 * s, fy + 330 * s], radius=int(40 * s), fill=(214, 210, 198))  # 흰 연구복
    d.polygon([(fx - 14 * s, fy + 60 * s), (fx + 14 * s, fy + 60 * s), (fx, fy + 120 * s)], fill=(80, 96, 120))  # 셔츠
    d.ellipse([fx - 46 * s, fy - 50 * s, fx + 46 * s, fy + 58 * s], fill=(222, 182, 150))  # 얼굴
    d.chord([fx - 50 * s, fy - 60 * s, fx + 50 * s, fy + 10 * s], 180, 360, fill=(52, 42, 36))  # 머리카락
    # 안경
    for dx in (-19, 19):
        d.ellipse([fx + (dx - 14) * s, fy - 8 * s, fx + (dx + 14) * s, fy + 18 * s], outline=(30, 26, 24), width=max(2, int(4 * s)))
    d.line([fx - 5 * s, fy + 4 * s, fx + 5 * s, fy + 4 * s], fill=(30, 26, 24), width=max(2, int(3 * s)))
    d.ellipse([fx - 22 * s, fy + 2 * s, fx - 16 * s, fy + 8 * s], fill=(40, 30, 26))
    d.ellipse([fx + 16 * s, fy + 2 * s, fx + 22 * s, fy + 8 * s], fill=(40, 30, 26))
    d.arc([fx - 20 * s, fy + 14 * s, fx + 20 * s, fy + 40 * s], 20, 160, fill=(120, 60, 50), width=max(2, int(3 * s)))
    # 아들 (오른쪽)
    bx, by = ox + 330 * s, oy + 228 * s
    d.rounded_rectangle([bx - 66 * s, by + 50 * s, bx + 66 * s, by + 272 * s], radius=int(36 * s), fill=(206, 112, 58))  # 주황 후드
    d.ellipse([bx - 40 * s, by - 44 * s, bx + 40 * s, by + 52 * s], fill=(230, 192, 160))
    d.chord([bx - 44 * s, by - 54 * s, bx + 44 * s, by + 8 * s], 180, 360, fill=(36, 30, 28))
    d.ellipse([bx - 18 * s, by + 4 * s, bx - 12 * s, by + 10 * s], fill=(40, 30, 26))
    d.ellipse([bx + 12 * s, by + 4 * s, bx + 18 * s, by + 10 * s], fill=(40, 30, 26))
    d.arc([bx - 18 * s, by + 12 * s, bx + 18 * s, by + 36 * s], 15, 165, fill=(130, 60, 50), width=max(2, int(3 * s)))
    # 아버지 팔이 아들 어깨 위로
    d.line([(fx + 60 * s, fy + 90 * s), (bx - 10 * s, by + 52 * s), (bx + 40 * s, by + 58 * s)], fill=(214, 210, 198), width=int(26 * s), joint="curve")
    return (fx, fy)


def img_photos(W=640, H=480):
    s = 1.0
    base = Image.new("RGB", (W, H), (236, 228, 210))
    d = ImageDraw.Draw(base)
    # 사진 영역
    px0, py0, px1, py1 = 34, 30, W - 34, H - 74
    sky = np.zeros((py1 - py0, px1 - px0, 3), np.float32)
    yy = np.linspace(0, 1, py1 - py0)[:, None, None]
    sky[:] = lerp(np.array([176, 196, 204]), np.array([214, 206, 178]), yy)
    photo = Image.fromarray(sky.astype(np.uint8))
    pd = ImageDraw.Draw(photo)
    pw, ph = photo.size
    # 배경 나무와 땅
    pd.rectangle([0, ph * 0.72, pw, ph], fill=(122, 138, 92))
    for tx in (60, 470, 520):
        pd.rectangle([tx, ph * 0.3, tx + 16, ph * 0.74], fill=(84, 66, 50))
        pd.ellipse([tx - 70, ph * 0.05, tx + 86, ph * 0.46], fill=(96, 130, 84))
    face = draw_family(pd, pw, ph, 20, 10, s)
    photo = photo.filter(ImageFilter.GaussianBlur(0.8))
    clear = photo.copy()

    # 물에 젖어 번진 얼굴
    arr = np.array(photo).astype(np.float32)
    hh, ww = arr.shape[:2]
    yy, xx = np.mgrid[0:hh, 0:ww]
    cx, cy = face[0], face[1] + 4
    noise = fbm(hh, ww, beta=2.2, seed=111)
    r = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / 78.0
    mask = ndimage.gaussian_filter(np.clip((1.0 - r) * 2.2 + (noise - 0.5) * 1.8, 0, 1), 2.0)
    blurred = ndimage.gaussian_filter(arr, sigma=(9, 9, 0))
    stain = blurred * 0.7 + np.array([150, 118, 84]) * 0.3
    arr = arr * (1 - mask[..., None]) + stain * mask[..., None]
    edge = np.clip(1 - np.abs(mask - 0.12) * 14, 0, 1) * (mask > 0.02)
    arr *= (1 - edge[..., None] * 0.35)
    smudged = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))

    for name, ph_img in (("photo_clear.jpg", clear), ("photo_smudged.jpg", smudged)):
        a = np.array(ph_img).astype(np.float32)
        lum = a @ np.array([0.3, 0.59, 0.11])
        sep = np.stack([lum * 1.07 + 16, lum * 0.95 + 8, lum * 0.78], -1)
        a = a * 0.35 + sep * 0.65
        a = vignette(a, 0.6)
        a = grain(a, 7, 112)
        out = base.copy()
        out.paste(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), (px0, py0))
        o = np.array(out).astype(np.float32)
        paper = fbm(H, W, beta=1.6, seed=113)
        o *= (0.93 + paper[..., None] * 0.07)
        # 접힌 자국
        o[:, W // 2 - 1:W // 2 + 1] *= 0.86
        save_rgb(o, os.path.join(IMG, "img_" + name))


def img_ending_surface(W=1920, H=1080):
    rng = np.random.default_rng(201)
    y = np.linspace(0, 1, H)[:, None, None]
    sky = np.where(y < 0.55, lerp(np.array([92, 120, 126], np.float32), np.array([236, 182, 150], np.float32), (y / 0.55) ** 1.4),
                   lerp(np.array([236, 182, 150], np.float32), np.array([60, 52, 46], np.float32), (y - 0.55) / 0.45))
    arr = np.broadcast_to(sky, (H, W, 3)).copy()
    arr = add(arr, glow_layer((W, H), [(W * 0.62, H * 0.56, 120, (255, 220, 170))], 90), 1.0)
    img = Image.fromarray(arr.astype(np.uint8))
    d = ImageDraw.Draw(img)
    layers = [(0.52, (128, 118, 116), 0.55), (0.58, (78, 74, 72), 0.75), (0.66, (36, 36, 34), 1.0)]
    for li, (base_y, col, sc) in enumerate(layers):
        x = -40
        while x < W:
            bw = rng.uniform(60, 170) * sc
            bh = rng.uniform(120, 420) * sc
            top = H * base_y - bh
            if rng.random() < 0.35:
                d.polygon([(x, H), (x, top + rng.uniform(0, 60)), (x + bw * 0.6, top), (x + bw, top + rng.uniform(30, 120)), (x + bw, H)], fill=col)
            else:
                d.rectangle([x, top, x + bw, H], fill=col)
            # 덩굴로 덮인 꼭대기
            g = tuple(int(c * 0.6) for c in col)
            green = (int(g[0] * 0.6), int(min(255, g[1] * 1.25 + 20)), int(g[2] * 0.6))
            for cl in range(int(rng.integers(3, 7))):
                cxl = x + rng.uniform(0, bw)
                cyl = top + rng.uniform(-6, 40 * sc)
                rr = rng.uniform(10, 28) * sc
                d.ellipse([cxl - rr, cyl - rr * 0.7, cxl + rr, cyl + rr * 0.7], fill=green)
            for vv in range(int(rng.integers(1, 4))):
                vx = x + rng.uniform(4, bw - 4)
                d.line([(vx, top + 10), (vx + rng.uniform(-6, 6), top + rng.uniform(40, bh * 0.8))], fill=green, width=max(2, int(4 * sc)))
            if li < 2:
                for wy in range(int(top + 30), int(H * base_y + 40), int(26 * sc) + 6):
                    for wx in range(int(x + 8), int(x + bw - 10), int(22 * sc) + 6):
                        if rng.random() < 0.5:
                            dc = tuple(int(c * 0.82) for c in col)
                            d.rectangle([wx, wy, wx + 8 * sc, wy + 12 * sc], fill=dc)
            x += bw + rng.uniform(4, 30)
    # 거대한 꽃
    for k in range(7):
        fx = rng.uniform(80, W - 80)
        fy = rng.uniform(H * 0.55, H * 0.72)
        R = rng.uniform(40, 110)
        d.line([(fx, fy), (fx + rng.uniform(-30, 30), H)], fill=(40, 60, 36), width=int(R * 0.12))
        for p in range(7):
            a = p / 7 * math.pi * 2
            d.ellipse([fx + math.cos(a) * R * 0.6 - R * 0.42, fy + math.sin(a) * R * 0.6 - R * 0.42,
                       fx + math.cos(a) * R * 0.6 + R * 0.42, fy + math.sin(a) * R * 0.6 + R * 0.42], fill=(170, 84, 112))
        d.ellipse([fx - R * 0.3, fy - R * 0.3, fx + R * 0.3, fy + R * 0.3], fill=(226, 180, 90))
    # 전경 땅과 13명의 실루엣
    d.rectangle([0, H * 0.84, W, H], fill=(28, 30, 24))
    for k in range(400):
        gx = rng.uniform(0, W)
        d.line([(gx, H * 0.85), (gx + rng.uniform(-10, 10), H * 0.85 - rng.uniform(10, 50))], fill=(36, 50, 30), width=2)
    sx = W * 0.32
    for k in range(13):
        hgt = rng.uniform(52, 66)
        x = sx + k * 34 + rng.uniform(-6, 6)
        yb = H * 0.86
        d.ellipse([x - 7, yb - hgt - 14, x + 7, yb - hgt], fill=(16, 16, 14))
        d.rounded_rectangle([x - 10, yb - hgt, x + 10, yb], radius=6, fill=(16, 16, 14))
    arr = np.array(img).astype(np.float32)
    pts = [(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(1, 3), (255, 236, 200)) for _ in range(180)]
    arr = add(arr, glow_layer((W, H), pts, 2), 1.4)
    arr = vignette(arr, 0.65)
    arr = grain(arr, 4, 202)
    save_rgb(arr, os.path.join(IMG, "img_ending_surface.jpg"))


def img_ending_stay(W=1920, H=1080):
    rng = np.random.default_rng(301)
    arr = np.zeros((H, W, 3), np.float32) + np.array([12, 14, 15])
    img = Image.fromarray(arr.astype(np.uint8))
    d = ImageDraw.Draw(img)
    glows = []
    cols, rows = 9, 4
    for r in range(rows):
        for c in range(cols):
            x0 = 280 + c * 152
            y0 = 160 + r * 112
            on = rng.random() < 0.6
            fill = (28, 52, 54) if on else (20, 22, 22)
            d.rectangle([x0, y0, x0 + 136, y0 + 96], fill=(8, 9, 10))
            d.rectangle([x0 + 6, y0 + 6, x0 + 130, y0 + 90], fill=fill)
            if on:
                glows.append((x0 + 68, y0 + 48, 70, (40, 110, 112) if rng.random() < 0.7 else (150, 110, 40)))
                for ln in range(5):
                    yy = y0 + 18 + ln * 14
                    d.line([(x0 + 16, yy), (x0 + 16 + rng.uniform(30, 100), yy)], fill=(90, 170, 160), width=2)
            if rng.random() < 0.3:
                d.line([(x0 + rng.uniform(10, 120), y0 + 6), (x0 + rng.uniform(10, 120), y0 + 90)], fill=(160, 170, 170), width=1)
    d.rectangle([0, 700, W, H], fill=(18, 18, 18))
    # 실루엣
    cx = W / 2
    d.ellipse([cx - 22, 548, cx + 22, 594], fill=(4, 4, 4))
    d.rounded_rectangle([cx - 36, 590, cx + 36, 760], radius=16, fill=(4, 4, 4))
    d.line([(cx + 30, 610), (cx + 70, 700)], fill=(4, 4, 4), width=14)
    d.line([(cx + 70, 700), (cx + 92, 600)], fill=(110, 110, 112), width=5)  # 손에 든 도끼 자루
    arr = add(np.array(img), glow_layer((W, H), glows, 40), 1.1)
    img = Image.fromarray(arr.astype(np.uint8))
    d = ImageDraw.Draw(img)
    for k in range(60):
        x = rng.uniform(0, W)
        L = rng.uniform(80, 600)
        pts = [(x + math.sin(u / 29 * 5 + k) * 18, L * u / 29 - 10) for u in range(30)]
        d.line(pts, fill=(30, 66, 34), width=int(rng.uniform(3, 10)))
    arr = np.array(img).astype(np.float32)
    flowers = [(rng.uniform(0, W), rng.uniform(0, 600), rng.uniform(4, 10), (220, 110, 160) if rng.random() < 0.5 else (120, 200, 110)) for _ in range(70)]
    arr = add(arr, glow_layer((W, H), flowers, 5), 1.6)
    arr = vignette(arr, 0.9)
    arr = grain(arr, 5, 302)
    save_rgb(arr, os.path.join(IMG, "img_ending_stay.jpg"))


def img_favicon(n=128):
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([4, 4, n - 4, n - 4], fill=(36, 32, 30, 255), outline=(242, 179, 61, 255), width=6)
    d.line([(n / 2, n * 0.82), (n / 2, n * 0.42)], fill=(127, 163, 107, 255), width=8)
    d.ellipse([n / 2 - 30, n * 0.30, n / 2, n * 0.48], fill=(127, 163, 107, 255))
    d.ellipse([n / 2, n * 0.22, n / 2 + 32, n * 0.42], fill=(160, 196, 120, 255))
    img.save(os.path.join(IMG, "img_favicon.png"))


if __name__ == "__main__":
    print("textures…")
    tex_rock(); tex_floor(); tex_metal(); tex_vine(); tex_moss_patch(); tex_spore(); tex_decal_ring(); tex_blob_shadow()
    print("illustrations…")
    img_title(); img_photos(); img_ending_surface(); img_ending_stay(); img_favicon()
    print("done")
