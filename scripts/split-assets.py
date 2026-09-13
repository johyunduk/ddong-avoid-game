#!/usr/bin/env python3
"""여러 대상이 한 장에 그려진 시안을 **대상별 PNG 로 쪼갠다**.

    C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/split-assets.py \\
        --in <시안.png> --out creative/_fx/red --prefix red --min-area 8000

컨셉 시안은 티라노·로봇·참새 5마리처럼 여러 대상을 한 장에 몰아 그려서 온다.
이걸 능력 이펙트로 쓰려면 대상마다 따로 떼어내야 한다.

배경 처리: 생성물의 '투명'은 대개 **격자무늬가 픽셀로 그려진 것**이라 알파가 없다.
그래서 테두리에서 **밝고 무채색인 영역을 타고 흘려보내(flood fill)** 배경을 정한다.
윤곽 안쪽의 흰 옷·흰 장갑은 테두리와 끊겨 있어 닿지 않으므로 살아남는다.

분리: 배경을 뺀 뒤 **연결 요소**로 덩어리를 찾는다. `--min-area` 보다 작은 조각은
버린다 (점·부스러기). 덩어리마다 bbox 로 잘라 개별 PNG 로 저장하고, 확인용으로
번호를 붙인 대조표(contact sheet)를 함께 낸다 — 어떤 번호가 무엇인지 눈으로 보고
이름을 붙이면 된다.
"""
from __future__ import annotations

import argparse
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def background_mask(rgb: np.ndarray, thr: int, sat: int) -> np.ndarray:
    """테두리에서 흘려보내 배경을 찾는다 (격자무늬의 두 톤을 모두 덮도록 느슨하게)."""
    h, w = rgb.shape[:2]
    light = (rgb.min(axis=2) >= thr) & (rgb.max(axis=2) - rgb.min(axis=2) <= sat)
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if light[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if light[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and light[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))
    return bg


def components(mask: np.ndarray, min_area: int) -> list[np.ndarray]:
    """8방향 연결 요소. 작은 조각은 버린다."""
    h, w = mask.shape
    seen = np.zeros((h, w), bool)
    out = []
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            comp = []
            stack = [(sy, sx)]
            seen[sy, sx] = True
            while stack:
                y, x = stack.pop()
                comp.append((y, x))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            if len(comp) >= min_area:
                m = np.zeros((h, w), bool)
                ys, xs = zip(*comp)
                m[np.array(ys), np.array(xs)] = True
                out.append(m)
    out.sort(key=lambda m: -int(m.sum()))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", required=True, help="결과를 담을 디렉터리")
    ap.add_argument("--prefix", default="asset")
    ap.add_argument("--min-area", type=int, default=8000, help="이보다 작은 덩어리는 버린다")
    ap.add_argument("--thr", type=int, default=190, help="배경으로 볼 밝기 하한")
    ap.add_argument("--sat", type=int, default=18, help="배경으로 볼 채도 상한")
    a = ap.parse_args()

    im = Image.open(a.src).convert("RGB")
    rgb = np.array(im).astype(int)
    bg = background_mask(rgb, a.thr, a.sat)
    fg = ~bg
    print(f"{Path(a.src).name}: {im.size} · 전경 {int(fg.sum())}px")

    comps = components(fg, a.min_area)
    print(f"덩어리 {len(comps)}개")

    out_dir = Path(a.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    rgba = np.dstack([np.array(im), np.zeros(fg.shape, np.uint8)])

    tiles = []
    for i, m in enumerate(comps):
        arr = rgba.copy()
        arr[:, :, 3] = np.where(m, 255, 0)
        piece = Image.fromarray(arr)
        piece = piece.crop(piece.getbbox())
        p = out_dir / f"{a.prefix}_{i:02d}.png"
        piece.save(p)
        print(f"  {p.name}: {piece.size} ({int(m.sum())}px)")
        tiles.append((i, piece))

    # 대조표 — 번호를 보고 이름을 붙이기 위한 것
    if tiles:
        cell = max(max(t.width, t.height) for _, t in tiles) + 16
        cols = min(4, len(tiles))
        rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cell * cols, cell * rows), (90, 150, 210))
        for n, (i, t) in enumerate(tiles):
            cx = (n % cols) * cell + (cell - t.width) // 2
            cy = (n // cols) * cell + (cell - t.height) // 2
            sheet.paste(t, (cx, cy), t)
        cs = out_dir / f"{a.prefix}_contact.png"
        sheet.save(cs)
        print(f"대조표: {cs.name} ({cols}열, 큰 것부터 0번)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
