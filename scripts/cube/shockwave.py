#!/usr/bin/env python3
"""파열 파동 — **흑백 각진 링**. 네이티브 픽셀 격자 위에 직접 그린다.

    PY=C:\\ComfyUI\\.venv\\Scripts\\python.exe
    $PY scripts/cube/shockwave.py --out build/cube/wave
    $PY scripts/cube/pack-sheet.py --in build/cube/wave --cols 3 --frame 320x320 --name shockwave

## 왜 시트로 굽는가

링을 코드에서 키우려면 스프라이트를 배율로 늘려야 하는데, 픽셀아트에서 **임의 배율은 금지**다.
정수배(×2, ×3)로만 키우면 커지는 단계가 너무 거칠다. 프레임마다 반지름을 **픽셀 단위로 직접
그려 두면** 배율을 한 번도 건드리지 않고 매끄럽게 퍼진다.

## 왜 팔각형인가

부드러운 원형 그라데이션 링은 이미 한 번 퇴짜를 맞았다("평범한 금색 원"). 원을 흑백으로
바꾼다고 달라지지 않는다. 팔각형은 **모서리가 픽셀 격자에 떨어지는 각진 형태**라
큐브 원화의 하드 엣지와 같은 화풍이고, 원이 아니라 '판'이 퍼지는 것으로 읽힌다.

    d(x, y) = max(|x|, |y|, (|x| + |y|) · 0.7071)      ← 정팔각형까지의 거리

이 값에 정수 문턱을 걸면 가장자리가 정확히 픽셀에서 끊긴다. 안티에일리어싱이 없다.

## 왜 흰색 + 검은 외곽선인가

밝은 배경(background2 평균 192/255)에서 **흰색 가산은 사라진다**. 반대로 어두운 배경에서는
검정이 사라진다. 그래서 **흰 띠에 검은 1px 외곽선**을 둘러 일반 블렌드로 얹는다 —
밝은 배경에서는 검은 테두리가, 어두운 배경에서는 흰 띠가 형태를 잡아 준다.
체스 말 스프라이트가 어느 배경에서나 읽히는 이유와 같다.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PX = 320                 # 프레임 한 변. 링 최대 반지름 156 + 외곽선이 들어간다
FRAMES = 6               # 30fps 기준 200ms — 파동은 짧고 빠른 게 맞다

# 제한 팔레트, 흑백만. 금색을 쓰지 않는다
OUTLINE = (5, 5, 5)
WHITE = (255, 255, 255)
LIGHT = (198, 198, 198)
MID = (130, 130, 130)
DARK = (72, 72, 72)

# 프레임별 (반지름, 두께, 색) — 눈대중이 아니라 표다. 여기만 고치면 박자가 바뀐다
#   빠른 링: 얇고 멀리, 앞서 나간다
FAST = [(38, 7, WHITE), (72, 6, WHITE), (104, 5, LIGHT),
        (128, 4, LIGHT), (142, 3, MID), (150, 2, MID)]
#   느린 링: 두껍고 뒤따라온다. 안쪽에 흰 심지를 남겨 두 겹으로 읽히게 한다
SLOW = [(14, 13, WHITE), (40, 14, WHITE), (66, 13, LIGHT),
        (88, 11, LIGHT), (108, 8, MID), (122, 6, DARK)]
#   부스러기: 팔각형 꼭짓점 방향으로 튀는 작은 사각 (각진 형태를 한 번 더 확인시킨다)
CHIP = [(50, 6), (84, 6), (112, 5), (132, 4), (144, 3), (150, 2)]


def octagon_distance(size: int) -> np.ndarray:
    """중심에서의 **팔각형 거리**. 정수 문턱을 걸면 가장자리가 픽셀에서 끊긴다."""
    ax = np.abs(np.arange(size) - (size - 1) / 2.0)
    gx, gy = np.meshgrid(ax, ax)
    return np.maximum(np.maximum(gx, gy), (gx + gy) * 0.7071)


D = octagon_distance(PX)


def band(lo: float, hi: float) -> np.ndarray:
    return (D >= lo) & (D < hi)


def put(rgb: np.ndarray, a: np.ndarray, mask: np.ndarray, color) -> None:
    rgb[mask] = color
    a[mask] = 255


OUTLINE_W = 2      # 밝은 배경에서 형태를 잡아 주는 게 이 선이다. 1px 이면 얇아서 묻힌다


def ring(rgb, a, r: float, thick: float, color) -> None:
    """띠 하나 + **양쪽에 검은 외곽선**. 외곽선을 먼저 깔고 그 안에 색을 채운다."""
    put(rgb, a, band(r - thick - OUTLINE_W, r + OUTLINE_W), OUTLINE)
    put(rgb, a, band(r - thick, r), color)


def chips(rgb, a, r: float, size: int) -> None:
    """팔각형 8방향으로 튀는 작은 사각. 외곽선 포함."""
    c = PX // 2
    dirs = [(1, 0), (-1, 0), (0, 1), (0, -1),
            (0.7071, 0.7071), (-0.7071, 0.7071), (0.7071, -0.7071), (-0.7071, -0.7071)]
    for dx, dy in dirs:
        x = int(round(c + dx * r))
        y = int(round(c + dy * r))
        s = size
        x0, x1 = max(x - s - 1, 0), min(x + s + 1, PX)
        y0, y1 = max(y - s - 1, 0), min(y + s + 1, PX)
        if x1 <= x0 or y1 <= y0:
            continue
        rgb[y0:y1, x0:x1] = OUTLINE
        a[y0:y1, x0:x1] = 255
        x0, x1 = max(x - s, 0), min(x + s, PX)
        y0, y1 = max(y - s, 0), min(y + s, PX)
        if x1 > x0 and y1 > y0:
            rgb[y0:y1, x0:x1] = WHITE
            a[y0:y1, x0:x1] = 255


def frame(k: int) -> Image.Image:
    rgb = np.zeros((PX, PX, 3), np.uint8)
    a = np.zeros((PX, PX), np.uint8)

    r, t, c = SLOW[k]
    ring(rgb, a, r, t, c)
    if t >= 8:                       # 두꺼운 동안만 안쪽 심지를 남긴다
        put(rgb, a, band(r - t, r - t + 3), WHITE)

    r, t, c = FAST[k]
    ring(rgb, a, r, t, c)

    cr, cs = CHIP[k]
    if cr + cs + 1 < PX // 2:
        chips(rgb, a, cr, cs)

    out = np.dstack([rgb, a])
    return Image.fromarray(out, "RGBA")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    semi = op = 0
    for k in range(FRAMES):
        im = frame(k)
        im.save(out / f"f{k:04d}.png")
        al = np.asarray(im)[..., 3]
        semi += int(((al > 8) & (al < 248)).sum())
        op += int((al >= 248).sum())

    cols = 3
    rows = (FRAMES + cols - 1) // cols
    print(f"[shockwave] {FRAMES}프레임 {PX}px → {out}")
    print(f"  격자 {cols}×{rows} → {PX * cols}×{PX * rows} · "
          f"VRAM {PX * cols * PX * rows * 4 / 1048576:.2f}MB")
    print(f"  반투명 {semi} / 불투명 {op} ({100 * semi / max(op, 1):.2f}%) — 0% 여야 한다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
