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
         translucent: float = 0.0) -> Image.Image:
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
    a *= (bow ** taper)[None, :]
    yy = np.abs(np.arange(height)[:, None] - (lift - shift)[None, :] - band / 2) / (band / 2)
    a *= np.clip(1.0 - (yy ** 3) * 0.85, 0.0, 1.0)
    a = np.clip(a * 1.25, 0.0, 1.0)

    rgb = np.clip(canvas, 0, 255).astype(np.uint8)
    out = np.dstack([rgb, (a * 255).astype(np.uint8)])
    img = Image.fromarray(out, "RGBA")
    if hue is not None:
        img = _aurora_grade(img, hue[0], hue[1], sat, sat_floor)
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


def beam_core(src: Path, sharpen: float = 2.4) -> Image.Image:
    """검기 코어 — 같은 형태를 **흰색 하드 엣지**로 뽑는다.

    애니메 이펙트는 '납작한 형태 + 늘어난 흰 선'이 있어야 작은 크기에서 읽힌다.
    알파에 지수를 먹여 흐린 가장자리를 깎아내고 RGB 는 흰색으로 통일한다.
    """
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im.getchannel("A"), dtype=np.float32) / 255.0
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
    p.add_argument("--beam-hue", help="색상 그라데이션 \"시작,끝\" (도). 예: 150,310")
    p.add_argument("--beam-sat", type=float, default=1.0, help="채도 배율")
    p.add_argument("--beam-sat-floor", type=float, default=0.0, help="흰 코어를 뺀 영역의 채도 하한(0-255)")
    p.add_argument("--beam-translucent", type=float, default=0.0,
                   help="내부를 비워 반투명하게 (0=끄기, 0.3~0.5 권장). 코어 판을 먼저 뽑고 나서 쓴다")
    p.add_argument("--beam-core", help="검기 코어(흰 하드엣지)로 가공할 png")
    a = p.parse_args()

    if a.beam_core:
        if not a.out_file:
            raise SystemExit("--out-file 이 필요합니다")
        out = Path(a.out_file)
        out.parent.mkdir(parents=True, exist_ok=True)
        beam_core(Path(a.beam_core)).save(out)
        print(f"검기 코어: {out}")
        return 0

    if a.beam:
        if not a.out_file:
            raise SystemExit("--out-file 이 필요합니다 (예: public/assets/fx/particles/sword-beam.png)")
        hue = None
        if a.beam_hue:
            h0, h1 = (float(v) for v in a.beam_hue.split(","))
            hue = (h0, h1)
        img = beam(Path(a.beam), width=a.beam_width, arc=a.beam_arc, hue=hue,
                   sat=a.beam_sat, sat_floor=a.beam_sat_floor,
                   translucent=a.beam_translucent)
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
