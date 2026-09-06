#!/usr/bin/env python3
"""파티클 텍스처 후처리 — 검은 배경 생성물을 알파 채널 텍스처로 바꾼다.

ComfyUI 는 알파가 없는 RGB 를 내놓는다. 파티클은 검은 배경에 발광체 하나만
그리게 했으므로, **밝기(luminance)를 그대로 알파로** 쓰면 additive 블렌드에
바로 쓸 수 있는 텍스처가 된다.

    # 생성물 → 게임 에셋
    python scripts/fx-particle.py --in creative/_fx/particles --out public/assets/fx/particles

    # 수학적으로 그린 기준 텍스처도 같이 만든다 (비교용)
    python scripts/fx-particle.py --procedural --out public/assets/fx/particles

    # 비교 시트 (어두운 배경에 나란히)
    python scripts/fx-particle.py --sheet <경로> --out-file compare.webp

Pillow 필요 → ComfyUI venv 파이썬으로 실행.
"""
from __future__ import annotations

import argparse
import math
import random
import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    raise SystemExit("Pillow / numpy 필요: C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/fx-particle.py ...")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SIZE = 128  # 게임에 넣을 크기. 파티클은 작게 그려지므로 128 이면 충분하다


def to_alpha(src: Path, size: int = SIZE, threshold: int = 6) -> Image.Image:
    """검은 배경 + 발광체 → 밝기를 알파로 옮긴 RGBA 텍스처."""
    im = Image.open(src).convert("RGB")
    lum = im.convert("L")

    # 내용 영역만 잘라낸다 (여백이 크면 게임에서 파티클이 작아 보인다)
    bbox = lum.point(lambda v: 255 if v > threshold else 0).getbbox()
    if bbox:
        pad = max(im.width, im.height) // 64
        box = (max(bbox[0] - pad, 0), max(bbox[1] - pad, 0),
               min(bbox[2] + pad, im.width), min(bbox[3] + pad, im.height))
        im, lum = im.crop(box), lum.crop(box)

    side = max(im.size)
    canvas = Image.new("RGB", (side, side), (0, 0, 0))
    mask = Image.new("L", (side, side), 0)
    off = ((side - im.width) // 2, (side - im.height) // 2)
    canvas.paste(im, off)
    mask.paste(lum, off)

    out = canvas.convert("RGBA")
    out.putalpha(mask)
    return out.resize((size, size), Image.LANCZOS)


def procedural(kind: str, size: int = SIZE) -> Image.Image:
    """수학적으로 그린 기준 텍스처. 중심 정렬과 알파가 정확하다."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    c = (size - 1) / 2

    if kind == "glow":                       # 부드러운 원형 발광
        for y in range(size):
            for x in range(size):
                d = math.hypot(x - c, y - c) / c
                a = max(0.0, 1.0 - d) ** 2.2
                px[x, y] = (255, 255, 255, int(a * 255))

    elif kind == "spark":                    # 십자 광선이 있는 반짝임
        for y in range(size):
            for x in range(size):
                dx, dy = abs(x - c) / c, abs(y - c) / c
                core = max(0.0, 1.0 - math.hypot(dx, dy) * 2.6) ** 2
                ray = max(0.0, 1.0 - dx * 12) * max(0.0, 1.0 - dy) ** 3
                ray += max(0.0, 1.0 - dy * 12) * max(0.0, 1.0 - dx) ** 3
                a = min(1.0, core + ray * 0.75)
                px[x, y] = (255, 255, 255, int(a * 255))

    elif kind == "ring":                     # 충격파 링
        d = ImageDraw.Draw(img)
        d.ellipse([4, 4, size - 5, size - 5], outline=(255, 255, 255, 255), width=max(2, size // 20))
        img = img.filter(ImageFilter.GaussianBlur(size / 48))

    elif kind == "shard":                    # 파편 — 삼각 조각 (AI 보다 정확하다)
        d = ImageDraw.Draw(img)
        import random
        random.seed(7)
        for _ in range(3):
            cx = random.uniform(size * .3, size * .7)
            cy = random.uniform(size * .3, size * .7)
            r = random.uniform(size * .12, size * .3)
            a = random.uniform(0, math.tau)
            pts = [(cx + r * math.cos(a + k * math.tau / 3) * random.uniform(.6, 1.2),
                    cy + r * math.sin(a + k * math.tau / 3) * random.uniform(.6, 1.2)) for k in range(3)]
            d.polygon(pts, fill=(255, 255, 255, 235))
        img = img.filter(ImageFilter.GaussianBlur(size / 128))

    elif kind == "petal":                    # 낱장 꽃잎 — 끝이 뾰족한 아몬드형
        pts = []
        L, W = size * 0.86, size * 0.42
        for i in range(41):                  # 오른쪽 윤곽
            t = i / 40
            w = math.sin(math.pi * t) ** 0.75 * W / 2
            curl = math.sin(math.pi * t) * size * 0.06   # 살짝 휜 느낌
            pts.append((c + w + curl, c - L / 2 + L * t))
        for i in range(40, -1, -1):          # 왼쪽 윤곽
            t = i / 40
            w = math.sin(math.pi * t) ** 0.75 * W / 2
            curl = math.sin(math.pi * t) * size * 0.06
            pts.append((c - w + curl, c - L / 2 + L * t))
        d = ImageDraw.Draw(img)
        d.polygon(pts, fill=(255, 255, 255, 255))
        # 뿌리 쪽을 옅게 (빛을 받는 끝이 밝아 보이도록)
        grad = Image.new("L", (size, size), 0)
        gd = grad.load()
        for y in range(size):
            v = int(255 * min(1.0, 0.45 + 0.55 * (y / size)))
            for x in range(size):
                gd[x, y] = v
        a = img.getchannel("A").point(lambda v: v)
        img.putalpha(Image.composite(a, Image.new("L", (size, size), 0), a).point(lambda v: v))
        img = Image.merge("RGBA", (*img.split()[:3], Image.eval(Image.merge("L", (img.getchannel("A"),)), lambda v: v)))
        img.putalpha(Image.blend(img.getchannel("A"), Image.composite(grad, Image.new("L", (size, size), 0), img.getchannel("A")), 0.5))
        img = img.filter(ImageFilter.GaussianBlur(size / 96))

    elif kind == "arc":                      # 칼날 궤적 — 양끝이 가늘어지는 초승달
        d = ImageDraw.Draw(img)
        R = size * 0.44
        span = math.radians(110)
        outer, inner = [], []
        for i in range(61):
            t = i / 60
            ang = -span / 2 + span * t
            th = math.sin(math.pi * t) ** 0.65 * size * 0.075   # 가운데가 두껍다
            outer.append((c + math.cos(ang - math.pi / 2) * (R + th / 2),
                          c + math.sin(ang - math.pi / 2) * (R + th / 2)))
            inner.append((c + math.cos(ang - math.pi / 2) * (R - th / 2),
                          c + math.sin(ang - math.pi / 2) * (R - th / 2)))
        d.polygon(outer + inner[::-1], fill=(255, 255, 255, 255))
        img = img.filter(ImageFilter.GaussianBlur(size / 110))

    elif kind == "streak":                   # 속도감 있는 가로 획
        for y in range(size):
            for x in range(size):
                dy = abs(y - c) / c
                dx = abs(x - c) / c
                a = max(0.0, 1.0 - dy * 6) ** 2 * max(0.0, 1.0 - dx) ** 1.4
                px[x, y] = (255, 255, 255, int(a * 255))
    else:
        raise SystemExit(f"알 수 없는 종류: {kind}")

    return img


# ── 검기(호) 텍스처 ─────────────────────────────────────────────────────────
# 생성 모델은 "허공의 참격" 같은 추상 이펙트를 시키면 자꾸 검·캐릭터를 그린다.
# 그래서 **칠해진 플라즈마 질감은 생성물에서 가져오고 형태는 여기서 만든다** —
# 밝은 띠를 수평으로 세워 잘라낸 뒤 열마다 위로 밀어 얕은 호로 휘고, 양 끝을 뾰족하게 깎는다.

def _principal_angle(lum: "np.ndarray", thresh: int = 90) -> float:
    """밝은 픽셀 분포의 주축 각도(도). 대각선으로 그려진 띠를 수평으로 세우는 데 쓴다."""
    ys, xs = np.where(lum > thresh)
    if len(xs) < 50:
        return 0.0
    x = xs - xs.mean()
    y = ys - ys.mean()
    cov = np.cov(np.stack([x, y]))
    w, v = np.linalg.eigh(cov)
    vx, vy = v[:, int(np.argmax(w))]
    return math.degrees(math.atan2(vy, vx))


def _aurora_grade(img: "Image.Image", hue0: float, hue1: float, sat: float,
                  floor: float = 0.0) -> Image.Image:
    """색상을 가로 방향 그라데이션으로 갈아끼우고 채도를 올린다.

    하늘색 배경(평균 192/255) 위에서는 옅은 청록이 그대로 묻힌다 —
    **색상환에서 배경 반대쪽(보라~마젠타)까지 끌고 가야** 형태가 읽힌다.
    흰 코어는 채도가 0 이라 색상을 바꿔도 흰색 그대로 남는다.
    """
    a = img.getchannel("A")
    hsv = np.asarray(img.convert("RGB").convert("HSV"), dtype=np.float32)
    w = hsv.shape[1]
    ramp = np.linspace(hue0, hue1, w, dtype=np.float32) * 255.0 / 360.0
    hsv[..., 0] = ramp[None, :]
    boosted = hsv[..., 1] * sat
    if floor > 0:
        # 생성물은 채도가 낮은 영역이 넓어 그대로 올리면 뿌옇게 뜬다.
        # **흰 코어(밝고 무채색)만 남기고** 나머지에 채도 하한을 준다.
        core = (hsv[..., 2] > 245) & (hsv[..., 1] < 30)
        boosted = np.where(core, boosted, np.maximum(boosted, floor))
    hsv[..., 1] = np.clip(boosted, 0, 255)
    out = Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB")
    out.putalpha(a)
    return out


def beam(src: Path, width: int = 512, band: int = 96, arc: float = 0.30,
         taper: float = 0.75, hue: tuple[float, float] | None = None,
         sat: float = 1.0, sat_floor: float = 0.0,
         translucent: float = 0.0, tip: bool = False,
         start_fade: float = 0.0) -> Image.Image:
    """생성물의 발광 띠 → 얕은 호 모양 검기 텍스처(RGBA, 밝기=알파).

    width : 결과 가로 크기
    band  : 잘라낼 띠의 세로 두께(리샘플 후)
    arc   : 호의 높이 = width * arc
    taper : 양 끝이 가늘어지는 정도 (클수록 뾰족)
    """
    im = Image.open(src).convert("RGB")
    lum0 = np.asarray(im.convert("L"), dtype=np.float32)

    # 1) 띠를 수평으로 세운다
    ang = _principal_angle(lum0)
    im = im.rotate(ang, resample=Image.BICUBIC, expand=True, fillcolor=(0, 0, 0))
    arr = np.asarray(im, dtype=np.float32)
    lum = arr.max(axis=2)

    # 2) 가장 밝은 줄을 중심으로 띠만 잘라낸다 (행 밝기 합의 최댓값)
    rows = lum.sum(axis=1)
    cy = int(np.argmax(rows))
    half = max(8, int(lum.shape[0] * 0.10))
    top, bot = max(0, cy - half), min(lum.shape[0], cy + half + 1)
    cols = lum[top:bot].sum(axis=0)
    on = np.where(cols > cols.max() * 0.06)[0]
    left, right = (int(on[0]), int(on[-1])) if len(on) else (0, lum.shape[1] - 1)
    strip = Image.fromarray(arr[top:bot, left:right + 1].astype(np.uint8))
    strip = strip.resize((width, band), Image.LANCZOS)
    sarr = np.asarray(strip, dtype=np.float32)

    # 3) 열마다 위로 밀어 호로 휜다 (가운데가 가장 높다)
    lift = int(round(width * arc))
    height = band + lift
    canvas = np.zeros((height, width, 3), dtype=np.float32)
    t = np.linspace(-1.0, 1.0, width)
    bow = (1.0 - t ** 2)                      # 가운데 1, 끝 0
    shift = (bow * lift).round().astype(int)
    for x in range(width):
        y0 = lift - shift[x]
        canvas[y0:y0 + band, x] = sarr[:, x]

    # 4) 알파 = 밝기 × 끝 테이퍼 × 세로 감쇠. 끝을 깎아야 '칼날'로 읽힌다
    a = canvas.max(axis=2) / 255.0
    if tip:
        # 손끝에서 나가는 광선 — **시작은 굵고 끝만 뾰족해야** 한다.
        # 양끝 테이퍼(bow)를 쓰면 발사점이 가늘어져 손에서 떨어져 나온 것처럼 보인다.
        t01 = (t + 1.0) * 0.5
        a *= np.clip(1.0 - t01 ** 3, 0.0, 1.0)[None, :] ** taper
    else:
        a *= (bow ** taper)[None, :]
    yy = np.abs(np.arange(height)[:, None] - (lift - shift)[None, :] - band / 2) / (band / 2)
    a *= np.clip(1.0 - (yy ** 3) * 0.85, 0.0, 1.0)
    a = np.clip(a * 1.25, 0.0, 1.0)

    rgb = np.clip(canvas, 0, 255).astype(np.uint8)
    out = np.dstack([rgb, (a * 255).astype(np.uint8)])
    img = Image.fromarray(out, "RGBA")
    if hue is not None:
        img = _aurora_grade(img, hue[0], hue[1], sat, sat_floor)
    if start_fade > 0:
        # 잘라낸 왼쪽 단면이 직각으로 드러나지 않게 시작 구간의 알파를 끌어올린다
        al = np.asarray(img.getchannel("A"), dtype=np.float32)
        xr = np.linspace(0.0, 1.0, al.shape[1], dtype=np.float32)
        al *= np.clip(xr / max(start_fade, 1e-3), 0.0, 1.0)[None, :] ** 0.7
        img.putalpha(Image.fromarray(al.astype(np.uint8), "L"))
    if translucent > 0:
        img = _translucent(img, translucent)
    return img.filter(ImageFilter.GaussianBlur(0.6))


def _translucent(img: "Image.Image", keep: float) -> Image.Image:
    """내부를 비워 비쳐 보이게 한다 — **밝은 결과 코어는 남기고 탁한 부분만** 알파를 뺀다.

    알파를 통째로 낮추면 색까지 배경에 섞여 그냥 바랜 그림이 된다.
    밝기를 가중치로 쓰면 흰 코어와 발광하는 결은 그대로 서고 사이의 탁한 면만 뚫린다.
    `keep` 은 가장 어두운 부분에 남길 알파 비율.
    """
    a = np.asarray(img.getchannel("A"), dtype=np.float32) / 255.0
    lum = np.asarray(img.convert("RGB").convert("L"), dtype=np.float32) / 255.0
    lum = np.clip((lum - 0.35) / 0.55, 0.0, 1.0)  # 중간톤부터 살린다
    out = np.dstack([
        np.asarray(img.convert("RGB")),
        (a * (keep + (1.0 - keep) * lum) * 255).astype(np.uint8),
    ])
    return Image.fromarray(out, "RGBA")


def bolt(width: int = 512, height: int = 256, seed: int = 0,
         segs: int = 20, amp: float = 0.34, stroke: float = 0.045,
         branches: int = 5) -> Image.Image:
    """낙뢰 — **절차적으로 그린다.**

    생성물에서 잘라낸 번개는 획이 굵고 뭉툭해서, 좌우로 크게 흔들리게 하려고 늘리면
    같이 뚱뚱해진다. 얇은 획 + 큰 흔들림을 동시에 얻으려면 그리는 수밖에 없다.
    시드를 바꿔 **여러 변형**을 만들어 두면 번쩍일 때마다 다른 줄기를 쓸 수 있다.

    가로 방향이 진행 방향이다 (beam() 이 회전시킨다).
    x=0 이 하늘 쪽이라 그쪽을 가늘게, x=W 쪽(착지점)을 굵게 뺀다.
    """
    rng = random.Random(seed)
    img = Image.new("L", (width, height), 0)
    d = ImageDraw.Draw(img)
    cy = height / 2
    w0 = height * stroke

    # 본줄기 — 좌우로 꺾이며 나아간다.
    # 매번 무작위로 흩뿌리면 흔들리기만 하고, 매번 정확히 교대시키면 스프링이 된다.
    # **대체로 교대하되 가끔 같은 쪽으로 한 번 더** 가고, 마디 간격도 고르지 않게 둔다.
    xs = []
    acc = 0.0
    raw = [rng.uniform(0.5, 1.6) for _ in range(segs)]
    total = sum(raw)
    for r in raw:
        acc += r / total
        xs.append(width * acc)

    pts = [(0.0, cy)]
    side = 1 if rng.random() < 0.5 else -1
    for i, x in enumerate(xs):
        t = (i + 1) / segs
        swing = amp * height * (0.35 + 0.65 * math.sin(t * math.pi))
        # 대부분은 작게 꺾이고 가끔 크게 튄다 — 매 마디를 크게 꺾으면 코일처럼 보인다
        mag = rng.uniform(0.12, 0.45) if rng.random() < 0.7 else rng.uniform(0.6, 1.0)
        pts.append((x, cy + side * swing * mag))
        if rng.random() < 0.78:
            side = -side
    pts[-1] = (float(width - 1), cy + rng.uniform(-8, 8))

    def stroke_path(path, w_start, w_end):
        n = len(path) - 1
        for i in range(n):
            w = max(1.0, w_start + (w_end - w_start) * (i / max(1, n - 1)))
            d.line([path[i], path[i + 1]], fill=255, width=int(round(w)))
            d.ellipse([path[i + 1][0] - w / 2, path[i + 1][1] - w / 2,
                       path[i + 1][0] + w / 2, path[i + 1][1] + w / 2], fill=255)

    def zigzag(x, y, ang, length, steps, spread):
        """한 방향으로 나아가되 매 마디 각도를 크게 꺾는다 — 가지도 지그재그여야 번개다."""
        path = [(x, y)]
        step = length / steps
        for k in range(steps):
            a = ang + rng.uniform(-spread, spread)
            x += math.cos(a) * step
            y += math.sin(a) * step
            path.append((x, y))
        return path

    # 하늘 쪽은 가늘게, 착지점은 굵게
    stroke_path(pts, w0 * 0.35, w0)

    # 가지 — 본줄기 마디에서 갈라져 나가며 저도 지그재그로 꺾인다
    used = set()
    for _ in range(branches):
        i = rng.randrange(3, segs - 2)
        if i in used:
            continue
        used.add(i)
        bx, by = pts[i]
        ang = rng.uniform(-1.0, 1.0) + (0.0 if rng.random() < 0.5 else math.pi * 0.28)
        blen = width * rng.uniform(0.12, 0.24)
        bp = zigzag(bx, by, ang, blen, 5, 0.85)
        stroke_path(bp, w0 * 0.55, w0 * 0.16)

        # 잔가지 — 가지에서 한 번 더 갈라진다 (성기게)
        if rng.random() < 0.6:
            j = rng.randrange(1, len(bp) - 1)
            sx, sy = bp[j]
            sp = zigzag(sx, sy, ang + rng.uniform(-1.2, 1.2), blen * 0.45, 3, 0.9)
            stroke_path(sp, w0 * 0.3, w0 * 0.12)

    a = np.asarray(img, dtype=np.float32) / 255.0
    # 가장자리를 아주 살짝만 풀어 준다 — 많이 흐리면 애니메 이펙트의 날카로움이 죽는다
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(height / 200)), dtype=np.float32) / 255.0
    a = np.clip(a * 1.25, 0.0, 1.0)

    rgb = np.full((height, width, 3), 255, dtype=np.uint8)
    return Image.fromarray(np.dstack([rgb, (a * 255).astype(np.uint8)]), "RGBA")


def slash_frame(t: float, width: int = 256, height: int = 160,
                rng: "random.Random | None" = None) -> Image.Image:
    """애니메 참격 한 프레임. `t` 는 0(시작) ~ 1(소멸).

    **프레임마다 형태가 바뀌는 것**이 정지 텍스처를 변형만 하는 것과의 차이다.
      t≈0.0  가늘게 그어지기 시작
      t≈0.25 가장 굵고 길다 (임팩트)
      t≈0.5~ 안쪽부터 끊어지며 조각으로 흩어진다
    """
    rng = rng or random.Random(0)
    y = (np.arange(height, dtype=np.float32) / (height - 1) * 2 - 1)[:, None]
    x = (np.arange(width, dtype=np.float32) / (width - 1))[None, :]

    grow = min(1.0, t / 0.25)                 # 뻗는 구간
    decay = max(0.0, (t - 0.3) / 0.7)         # 흩어지는 구간

    # 길이·두께가 프레임마다 변한다 — 뻗었다가 가늘어진다
    span = 0.25 + 0.75 * grow
    thick = (0.30 + 0.42 * grow) * (1.0 - 0.75 * decay)

    tt = np.clip(x / max(span, 1e-3), 0.0, 1.0)
    bow = np.clip(1.0 - (2 * tt - 1) ** 2, 0.0, 1.0)
    arc = -0.34 * bow                          # 위로 휜 초승달
    w = np.maximum(thick * bow ** 0.7, 1e-3)
    a = np.exp(-(((y - arc) / w) ** 2) * 2.1) * np.where(x <= span, 1.0, 0.0)

    # 소멸: 세로 줄무늬로 끊어 조각을 만든다 (알파를 통째로 빼면 그냥 흐려진다)
    if decay > 0:
        freq = 9.0 + 7.0 * decay
        stripes = 0.5 + 0.5 * np.sin(x * math.pi * freq + rng.random() * 6.28)
        a *= np.clip(stripes * 1.6 - decay * 1.15, 0.0, 1.0)

    a = np.clip(a * (1.0 - 0.25 * decay) * 1.15, 0.0, 1.0)
    rgb = np.full((height, width, 3), 255, dtype=np.uint8)
    img = Image.fromarray(np.dstack([rgb, (a * 255).astype(np.uint8)]), "RGBA")
    return img.filter(ImageFilter.GaussianBlur(1.0))


def sheet_slash(frames: int = 8, width: int = 256, height: int = 160,
                seed: int = 0) -> Image.Image:
    """참격 플립북 — 프레임을 가로로 이어붙인 시트. vfx 의 registerFxSheet 규약."""
    rng = random.Random(seed)
    out = Image.new("RGBA", (width * frames, height), (0, 0, 0, 0))
    for i in range(frames):
        out.paste(slash_frame(i / (frames - 1), width, height, rng), (i * width, 0))
    return out


def slice_frames(src: Path, count: int = 8, out_w: int = 192, out_h: int = 192,
                 thresh: int = 10, pad: float = 0.10, rotate: int = 0,
                 ramp: tuple[int, int, int] | None = None, hot: float = 0.84) -> "Image.Image":
    """생성한 **한 장짜리 프레임 스트립** → 게임용 플립북 시트.

    ChatGPT(GPT Image) 에 "한 장에 N프레임 가로 일렬" 을 시키면 프레임 간 일관성 문제가
    없다 — 모델이 애초에 같이 그린다. 다만 셀 경계가 정확히 등분되지는 않으므로,
    **밝은 덩어리를 찾아 중심을 잡고 균등한 셀로 다시 자른다.**

    알파는 밝기에서 딴다(검은 배경 전제).

    `ramp` 를 주면 **밝기를 색 계단으로 바꿔 구워 넣는다** — 어두운 가장자리는 진한 색,
    밝은 심지는 흰색. RGB 를 흰색으로 통일하고 게임에서 통째로 착색하면 알파만 다르고
    색이 전부 같아서 '기운' 이 아니라 '단색 도형' 으로 보인다.
    """
    im = Image.open(src).convert("RGB")
    lum = np.asarray(im.convert("L"), dtype=np.float32)
    col = (lum > thresh).sum(axis=0).astype(np.float32)

    # 밝은 덩어리 = 프레임. 빈 열로 끊어 그룹을 만든다
    on = col > col.max() * 0.02
    groups, start = [], None
    for x, v in enumerate(on):
        if v and start is None:
            start = x
        elif not v and start is not None:
            if x - start > im.width // (count * 8):
                groups.append((start, x))
            start = None
    if start is not None:
        groups.append((start, im.width))

    if len(groups) != count:
        # 덩어리가 붙거나 끊긴 경우 — 균등 분할로 물러선다
        step = im.width / count
        centers = [step * (i + 0.5) for i in range(count)]
    else:
        centers = [(a + b) / 2 for a, b in groups]

    spacing = np.median(np.diff(centers)) if len(centers) > 1 else im.width / count
    cell_w = spacing * (1.0 + pad)

    rows = np.where((lum > thresh).any(axis=1))[0]
    top, bot = (int(rows.min()), int(rows.max())) if len(rows) else (0, im.height - 1)
    m = int((bot - top) * pad)
    top, bot = max(0, top - m), min(im.height - 1, bot + m)

    sheet = Image.new("RGBA", (out_w * count, out_h), (0, 0, 0, 0))
    for i, cx in enumerate(centers):
        box = (int(round(cx - cell_w / 2)), top, int(round(cx + cell_w / 2)), bot + 1)
        cell = im.crop(box)
        if rotate:
            # 시트의 기본 방향을 게임 진행 방향에 맞춰 둔다 — 호출부에서 매번 90도를
            # 더하는 것보다, 텍스처가 이미 맞는 방향인 편이 헷갈리지 않는다
            cell = cell.rotate(rotate, expand=True)
        cell = cell.resize((out_w, out_h), Image.LANCZOS)
        g = np.asarray(cell.convert("L"), dtype=np.float32) / 255.0
        a = np.clip((g - thresh / 255.0) / (1.0 - thresh / 255.0), 0.0, 1.0) ** 0.85

        if ramp is None:
            rgb = np.full((out_h, out_w, 3), 255, dtype=np.uint8)
        else:
            # 어두움 → 진한 색, 중간 → 지정색, 밝음 → 흰색.
            # 심지가 흰색으로 남아야 발광체로 읽힌다
            deep = np.array([c * 0.45 for c in ramp], dtype=np.float32)
            mid = np.array(ramp, dtype=np.float32)
            white = np.array([255.0, 255.0, 255.0], dtype=np.float32)
            # 흰 심지는 **가장 밝은 구간에서만** 나와야 한다. 경계를 낮게 잡으면
            # 원본이 전반적으로 밝은 탓에 대부분이 흰색이 되고 색은 테두리만 남는다
            t = np.clip(g / 0.30, 0.0, 1.0)[..., None]
            # `hot` 을 올리면 흰 심지가 좁아진다 — 어두운 색(검붉은 번개 등)은
            # 경계를 높이지 않으면 밝은 원본에 밀려 전부 흰색이 된다
            u = np.clip((g - hot) / max(1.0 - hot, 1e-3), 0.0, 1.0)[..., None] ** 1.4
            col = deep * (1 - t) + mid * t
            col = col * (1 - u) + white * u
            rgb = np.clip(col, 0, 255).astype(np.uint8)
        sheet.paste(Image.fromarray(np.dstack([rgb, (a * 255).astype(np.uint8)]), "RGBA"),
                    (i * out_w, 0))
    return sheet


def plume(width: int = 512, height: int = 192, bend: float = 0.16,
          fluff: float = 0.32, peak: float = 0.46) -> Image.Image:
    """꼬리(깃털/불꽃 깃) — **절차적으로 그린다.**

    원본은 발광 점 14개를 이어 꼬리 하나를 만들었다 (9개면 126장). 실루엣은
    "밑동 가늘고 중간이 가장 두껍고 끝이 뾰족" 인데, 그건 한 장으로 구울 수 있다.

    가로가 진행 방향이다 — x=0 이 밑동, x=W 가 끝.
    bend  : 중심선이 위로 휘는 정도
    fluff : 끝에서 흩어지는 털의 세기
    peak  : 가장 두꺼워지는 지점 (0~1)
    """
    x = (np.arange(width, dtype=np.float32) / (width - 1))[None, :]
    y = (np.arange(height, dtype=np.float32) / (height - 1) * 2 - 1)[:, None]

    # 폭 프로파일 — peak 에서 최대, 양끝에서 0
    t = np.clip(x, 0.0, 1.0)
    left = np.clip(t / peak, 0.0, 1.0) ** 0.65
    right = np.clip((1.0 - t) / (1.0 - peak), 0.0, 1.0) ** 1.25
    w = np.maximum(np.minimum(left, right), 0.02) * 0.95

    # 중심선이 완만하게 휜다 — 곧은 막대는 꼬리로 안 보인다
    cyl = -bend * np.sin(t * math.pi)

    d = (y - cyl) / np.maximum(w, 1e-3)
    a = np.exp(-(d ** 2) * 2.0)

    # 끝쪽 털 — 결을 몇 가닥 얹어 뭉툭한 타원이 되지 않게 한다
    strands = np.zeros_like(a)
    for k, off in enumerate((-0.62, -0.28, 0.12, 0.48, 0.78)):
        phase = 2.0 + k * 1.7
        line = cyl + off * w * (1.0 + 0.35 * np.sin(t * math.pi * phase))
        sw = w * (0.16 + 0.05 * k)
        strands = np.maximum(strands, np.exp(-(((y - line) / np.maximum(sw, 1e-3)) ** 2) * 2.2))
    a = np.clip(a + strands * fluff * np.clip((t - 0.25) / 0.75, 0.0, 1.0), 0.0, 1.0)

    # 밑동은 몸에 묻히도록 살짝 흐리게, 끝은 옅게
    a *= np.clip(t / 0.06, 0.0, 1.0) ** 0.5
    a = np.clip(a * 1.1, 0.0, 1.0)

    rgb = np.full((height, width, 3), 255, dtype=np.uint8)
    img = Image.fromarray(np.dstack([rgb, (a * 255).astype(np.uint8)]), "RGBA")
    return img.filter(ImageFilter.GaussianBlur(height / 130))


def orb(size: int = 192,
        body: tuple[int, int, int] = (0x55, 0x00, 0x00),
        inner: tuple[int, int, int] = (0xdd, 0x22, 0x00),
        hot: tuple[int, int, int] = (0xff, 0x88, 0x22)) -> Image.Image:
    """구슬(여의주) — **절차적으로 그린다.**

    생성 모델로 뽑으면 불꽃·연기가 붙어 작은 크기(30px 안팎)에서 뭉개진다.
    원본 구현이 fillCircle 여섯 번으로 만들던 읽기 — 어두운 본체 · 속에서 타는 빛 ·
    왼쪽 위 흰 반사 — 를 그대로 한 장에 굽는다. 작아져도 형태가 무너지지 않는다.
    """
    c = (size - 1) / 2
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    nx = (xx - c) / c
    ny = (yy - c) / c
    r = np.hypot(nx, ny)

    # 구체 알파 — 가장자리만 살짝 부드럽게
    a = np.clip((0.92 - r) / 0.07, 0.0, 1.0)

    # 본체: 가장자리로 갈수록 어두워지는 구면 음영
    shade = np.clip(1.0 - r * 0.75, 0.0, 1.0) ** 0.8
    rgb = np.zeros((size, size, 3), dtype=np.float32)
    for i in range(3):
        rgb[..., i] = body[i] * (0.55 + 0.45 * shade)

    # 속에서 타는 빛 — 중심보다 살짝 아래
    gd = np.hypot(nx - 0.06, ny - 0.12)
    glow = np.clip(1.0 - gd / 0.62, 0.0, 1.0) ** 1.7
    core = np.clip(1.0 - gd / 0.24, 0.0, 1.0) ** 1.4
    for i in range(3):
        rgb[..., i] = rgb[..., i] * (1 - glow) + inner[i] * glow
        rgb[..., i] = rgb[..., i] * (1 - core) + hot[i] * core

    # 왼쪽 위 반사 — 이게 있어야 '구슬'로 읽힌다
    sd = np.hypot((nx + 0.34) / 0.9, (ny + 0.38) / 0.62)
    spec = np.clip(1.0 - sd / 0.30, 0.0, 1.0) ** 1.3
    rgb = rgb * (1 - spec[..., None]) + 255.0 * spec[..., None]

    # 아래쪽 반사광 (구면감)
    rim = np.clip(1.0 - np.hypot(nx * 1.05, (ny - 0.62) / 0.5) / 0.55, 0.0, 1.0) ** 2
    for i in range(3):
        rgb[..., i] = np.minimum(255.0, rgb[..., i] + inner[i] * rim * 0.45)

    out = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), (a * 255).astype(np.uint8)])
    return Image.fromarray(out, "RGBA").filter(ImageFilter.GaussianBlur(size / 220))


def cutout(src: Path, size: int = 256, disc: float = 0.0, thresh: int = 10) -> Image.Image:
    """검은 배경 생성물 → 알파 컷아웃 (연꽃·여의주처럼 **형태가 있는** 대상용).

    파티클(`to_alpha`)은 밝기를 그대로 알파로 쓰지만, 구슬처럼 **본체가 어두운** 대상은
    그렇게 따면 속이 뚫린다. `disc` 를 주면 중심 원 안쪽을 불투명으로 유지하고
    바깥은 밝기로 딴다 — 어두운 구체 + 주변 불꽃이 둘 다 남는다.

    disc : 중심 원의 반지름 비율 (0 = 끄기)
    """
    im = Image.open(src).convert("RGB")
    lum = im.convert("L")

    box = lum.point(lambda v: 255 if v > thresh else 0).getbbox()
    if box:
        pad = max(im.width, im.height) // 48
        box = (max(box[0] - pad, 0), max(box[1] - pad, 0),
               min(box[2] + pad, im.width), min(box[3] + pad, im.height))
        im, lum = im.crop(box), lum.crop(box)

    side = max(im.size)
    sq = Image.new("RGB", (side, side), (0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    sq = sq.resize((size, size), Image.LANCZOS)

    a = np.asarray(sq.convert("L"), dtype=np.float32) / 255.0
    a = np.clip((a - thresh / 255.0) / (1.0 - thresh / 255.0), 0.0, 1.0) ** 0.7

    if disc > 0:
        yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
        c = (size - 1) / 2
        r = np.hypot(xx - c, yy - c) / c
        # 원 안쪽은 그대로, 경계에서 부드럽게 떨어진다
        a = np.maximum(a, np.clip((disc + 0.06 - r) / 0.06, 0.0, 1.0))

    out = np.dstack([np.asarray(sq), (a * 255).astype(np.uint8)])
    return Image.fromarray(out, "RGBA")


def beam_tube(width: int = 512, height: int = 128, sigma: float = 0.42,
              tip: float = 0.14, start: float = 0.1) -> Image.Image:
    """에너지파의 **흰 통** — 절차적으로 그린다.

    생성물에서 뽑은 코어는 원본이 가느다란 필라멘트라 아무리 굵게 늘려도 '선'이지 '통'이 아니다.
    드래곤볼식 에너지파는 균일한 흰 기둥에 얇은 색 테두리가 둘린 모양이라, 기둥은 여기서 만들고
    색·결은 생성 텍스처를 겹쳐서 얹는다.

    폭은 **양끝에서 좁아진다** — 시작은 손에서 뻗어 나오도록, 끝은 뾰족하도록.
    시작이 직각으로 잘려 있으면 손에 붙어 있지 않고 잘린 파이프처럼 보인다.

    sigma : 가운데 구간의 세로 감쇠 폭 (클수록 통이 두껍다)
    tip   : 끝에서 뾰족해지는 구간 비율
    start : 시작에서 넓어지는 구간 비율
    """
    y = (np.arange(height, dtype=np.float32) / (height - 1) * 2 - 1)[:, None]
    x = (np.arange(width, dtype=np.float32) / (width - 1))[None, :]

    # 폭 프로파일 — 시작에서 벌어지고 끝에서 좁아진다
    head_w = np.clip(x / max(start, 1e-3), 0.0, 1.0) ** 0.55
    tail_w = np.clip((1.0 - x) / max(tip, 1e-3), 0.0, 1.0) ** 0.6
    w = sigma * np.maximum(np.minimum(head_w, tail_w), 0.06)

    a = np.exp(-(y / w) ** 2 * 2.2)
    # 시작·끝은 밝기도 함께 떨어뜨려 단면이 드러나지 않게
    a *= (head_w ** 0.35) * (tail_w ** 0.35)
    a = np.clip(a * 1.15, 0.0, 1.0)

    rgb = np.full((height, width, 3), 255, dtype=np.uint8)
    img = Image.fromarray(np.dstack([rgb, (a * 255).astype(np.uint8)]), "RGBA")
    return img.filter(ImageFilter.GaussianBlur(1.0))


def beam_core(src: Path, sharpen: float = 2.4, floor: float = 0.0) -> Image.Image:
    """검기 코어 — 같은 형태를 **흰색 하드 엣지**로 뽑는다.

    애니메 이펙트는 '납작한 형태 + 늘어난 흰 선'이 있어야 작은 크기에서 읽힌다.
    알파에 지수를 먹여 흐린 가장자리를 깎아내고 RGB 는 흰색으로 통일한다.
    """
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im.getchannel("A"), dtype=np.float32) / 255.0
    if floor > 0:
        # 밝은 원본에서 **가장 밝은 부분만** 심지로 남긴다.
        # 바닥을 안 깎으면 코어가 형태를 통째로 먹어 색 테두리만 남는다
        a = np.clip((a - floor) / (1.0 - floor), 0.0, 1.0)
    a = np.clip(a ** sharpen * 1.35, 0.0, 1.0)
    rgb = np.full((*a.shape, 3), 255, dtype=np.uint8)
    return Image.fromarray(np.dstack([rgb, (a * 255).astype(np.uint8)]), "RGBA")


def sheet(paths: list[Path], out: Path, cols: int = 6, cell: int = 150) -> None:
    """어두운 배경에 나란히 놓은 비교 시트 (게임 화면과 같은 조건)."""
    rows = (len(paths) + cols - 1) // cols
    img = Image.new("RGB", (cols * cell, rows * (cell + 22)), (21, 19, 26))
    d = ImageDraw.Draw(img)
    for i, p in enumerate(paths):
        t = Image.open(p).convert("RGBA").resize((cell - 16, cell - 16), Image.LANCZOS)
        x, y = (i % cols) * cell + 8, (i // cols) * (cell + 22) + 8
        img.paste(t, (x, y), t)
        d.text((x + (cell - 16) / 2, y + cell - 4), p.stem, fill=(200, 195, 210), anchor="ma")
    img.save(out, "WEBP", quality=90)


def main() -> int:
    p = argparse.ArgumentParser(description="파티클 텍스처 후처리")
    p.add_argument("--in", dest="src", help="ComfyUI 생성물 디렉터리 (하위 폴더 순회)")
    p.add_argument("--procedural", action="store_true", help="수학 기반 기준 텍스처도 생성")
    p.add_argument("--out", help="출력 디렉터리")
    p.add_argument("--sheet", help="비교 시트를 만들 디렉터리")
    p.add_argument("--out-file", help="비교 시트 저장 경로")
    p.add_argument("--size", type=int, default=SIZE)
    p.add_argument("--beam", help="검기 호 텍스처로 가공할 원본 png")
    p.add_argument("--beam-width", type=int, default=512)
    p.add_argument("--beam-arc", type=float, default=0.30)
    p.add_argument("--beam-band", type=int, default=96,
                   help="잘라낼 띠의 세로 두께. 번개처럼 좌우로 크게 흔들리는 것은 크게 잡는다")
    p.add_argument("--beam-hue", help="색상 그라데이션 \"시작,끝\" (도). 예: 150,310")
    p.add_argument("--beam-sat", type=float, default=1.0, help="채도 배율")
    p.add_argument("--beam-sat-floor", type=float, default=0.0, help="흰 코어를 뺀 영역의 채도 하한(0-255)")
    p.add_argument("--beam-translucent", type=float, default=0.0,
                   help="내부를 비워 반투명하게 (0=끄기, 0.3~0.5 권장). 코어 판을 먼저 뽑고 나서 쓴다")
    p.add_argument("--beam-tip", action="store_true",
                   help="한쪽만 뾰족하게 (손끝에서 뻗는 광선용). 기본은 양끝 테이퍼")
    p.add_argument("--beam-core", help="코어(흰 하드엣지)로 가공할 png")
    p.add_argument("--core-floor", type=float, default=0.0,
                   help="이 밝기 아래는 심지에서 제외 (밝은 원본일수록 올린다)")
    p.add_argument("--core-sharpen", type=float, default=2.4)
    p.add_argument("--frames-from", help="생성한 프레임 스트립 png 를 게임용 시트로 자른다")
    p.add_argument("--frames", type=int, default=8)
    p.add_argument("--frame-size", default="192x192", help="프레임 크기 WxH")
    p.add_argument("--frames-rotate", type=int, default=0, help="셀을 회전(반시계, 도)")
    p.add_argument("--frames-ramp", help="밝기를 색 계단으로 구워 넣는다 (예: ff9a2e)")
    p.add_argument("--frames-pad", type=float, default=0.10,
                   help="셀 여백 비율. 프레임이 붙어 있으면 낮춘다(이웃이 물린다)")
    p.add_argument("--frames-ramp-hot", type=float, default=0.84,
                   help="흰 심지가 시작되는 밝기. 올릴수록 심지가 좁아진다")
    p.add_argument("--sheet-slash", action="store_true",
                   help="참격 플립북 시트를 절차 생성 (프레임마다 형태가 바뀐다)")
    p.add_argument("--sheet-frames", type=int, default=8)
    p.add_argument("--plume", action="store_true", help="꼬리 텍스처를 절차 생성")
    p.add_argument("--bolt", action="store_true", help="낙뢰 텍스처를 절차 생성")
    p.add_argument("--bolt-seed", type=int, default=0)
    p.add_argument("--orb", action="store_true", help="구슬 텍스처를 절차 생성")
    p.add_argument("--orb-size", type=int, default=192)
    p.add_argument("--cutout", help="검은 배경 생성물을 알파 컷아웃 (형태가 있는 대상)")
    p.add_argument("--cutout-disc", type=float, default=0.0,
                   help="중심 원 반지름 비율 — 본체가 어두운 구체용")
    p.add_argument("--cutout-size", type=int, default=256)
    p.add_argument("--beam-tube", action="store_true",
                   help="에너지파용 흰 통을 절차적으로 생성 (원본 불필요)")
    p.add_argument("--tube-sigma", type=float, default=0.42)
    p.add_argument("--tube-start", type=float, default=0.1,
                   help="시작에서 넓어지는 구간 비율 (직각 단면 방지)")
    p.add_argument("--beam-start-fade", type=float, default=0.0,
                   help="시작 구간 알파 램프인 비율 (잘라낸 단면 감추기)")
    a = p.parse_args()

    if a.frames_from:
        if not a.out_file:
            raise SystemExit("--out-file 이 필요합니다")
        fw, fh = (int(v) for v in a.frame_size.lower().split("x"))
        ramp = None
        if a.frames_ramp:
            h = a.frames_ramp.lstrip("#")
            ramp = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
        img = slice_frames(Path(a.frames_from), count=a.frames, out_w=fw, out_h=fh,
                           rotate=a.frames_rotate, ramp=ramp, hot=a.frames_ramp_hot,
                           pad=a.frames_pad)
        out = Path(a.out_file)
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out)
        print(f"플립북 시트: {out} ({img.width}x{img.height}, {a.frames}프레임 / {fw}x{fh})")
        return 0

    if a.sheet_slash:
        if not a.out_file:
            raise SystemExit("--out-file 이 필요합니다")
        img = sheet_slash(frames=a.sheet_frames)
        out = Path(a.out_file)
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out)
        print(f"참격 시트: {out} ({img.width}x{img.height}, {a.sheet_frames}프레임)")
        return 0

    if a.plume:
        if not a.out_file:
            raise SystemExit("--out-file 이 필요합니다")
        out = Path(a.out_file)
        out.parent.mkdir(parents=True, exist_ok=True)
        plume().save(out)
        print(f"꼬리: {out}")
        return 0

    if a.bolt:
        if not a.out_file:
            raise SystemExit("--out-file 이 필요합니다")
        out = Path(a.out_file)
        out.parent.mkdir(parents=True, exist_ok=True)
        bolt(seed=a.bolt_seed).save(out)
        print(f"낙뢰: {out} (seed={a.bolt_seed})")
        return 0

    if a.orb:
        if not a.out_file:
            raise SystemExit("--out-file 이 필요합니다")
        out = Path(a.out_file)
        out.parent.mkdir(parents=True, exist_ok=True)
        orb(size=a.orb_size).save(out)
        print(f"구슬: {out}")
        return 0

    if a.cutout:
        if not a.out_file:
            raise SystemExit("--out-file 이 필요합니다")
        out = Path(a.out_file)
        out.parent.mkdir(parents=True, exist_ok=True)
        img = cutout(Path(a.cutout), size=a.cutout_size, disc=a.cutout_disc)
        img.save(out)
        print(f"컷아웃: {out} ({img.width}x{img.height})")
        return 0

    if a.beam_tube:
        if not a.out_file:
            raise SystemExit("--out-file 이 필요합니다")
        out = Path(a.out_file)
        out.parent.mkdir(parents=True, exist_ok=True)
        beam_tube(sigma=a.tube_sigma, start=a.tube_start).save(out)
        print(f"에너지파 통: {out}")
        return 0

    if a.beam_core:
        if not a.out_file:
            raise SystemExit("--out-file 이 필요합니다")
        out = Path(a.out_file)
        out.parent.mkdir(parents=True, exist_ok=True)
        beam_core(Path(a.beam_core), sharpen=a.core_sharpen, floor=a.core_floor).save(out)
        print(f"검기 코어: {out}")
        return 0

    if a.beam:
        if not a.out_file:
            raise SystemExit("--out-file 이 필요합니다 (예: public/assets/fx/particles/sword-beam.png)")
        hue = None
        if a.beam_hue:
            h0, h1 = (float(v) for v in a.beam_hue.split(","))
            hue = (h0, h1)
        img = beam(Path(a.beam), width=a.beam_width, band=a.beam_band, arc=a.beam_arc, hue=hue,
                   sat=a.beam_sat, sat_floor=a.beam_sat_floor,
                   translucent=a.beam_translucent, tip=a.beam_tip,
                   start_fade=a.beam_start_fade)
        out = Path(a.out_file)
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out)
        print(f"검기 텍스처: {out} ({img.width}x{img.height})")
        return 0

    if a.sheet:
        files = sorted(Path(a.sheet).glob("*.png"))
        if not files:
            raise SystemExit(f"png 가 없습니다: {a.sheet}")
        out = Path(a.out_file or "particles.webp")
        sheet(files, out)
        print(f"비교 시트: {out} ({len(files)}장)")
        return 0

    if not a.out:
        raise SystemExit("--out 이 필요합니다")
    out_dir = Path(a.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    made = 0

    if a.src:
        for d in sorted(Path(a.src).iterdir()):
            if not d.is_dir():
                continue
            for i, f in enumerate(sorted(d.glob("*.png")), 1):
                dst = out_dir / f"{d.name}-{i}.png"
                to_alpha(f, a.size).save(dst)
                made += 1
                print(f"  {dst.name}")

    if a.procedural:
        for kind in ("glow", "spark", "ring", "streak", "shard", "petal", "arc"):
            dst = out_dir / f"proc-{kind}.png"
            procedural(kind, a.size).save(dst)
            made += 1
            print(f"  {dst.name}")

    print(f"\n{made}장 → {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
