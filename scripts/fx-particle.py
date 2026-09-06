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
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    raise SystemExit("Pillow 필요: C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/fx-particle.py ...")

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
    a = p.parse_args()

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
