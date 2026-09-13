#!/usr/bin/env python3
"""체스 말이 뭉쳐 큐브가 되었다가 터지는 시트를 **절차적으로** 그린다.

    C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/make-cube-sheet.py

## 왜 생성 모델을 안 쓰는가

40프레임짜리다. GPT Image 든 ComfyUI 든 프레임마다 다시 그리기 때문에 큐브의 면 개수와
체크무늬 위치가 프레임마다 달라져 재생하면 깜빡인다. 이건 "조각 54개가 모였다가 흩어진다"는
**기하 문제**라 코드로 그리는 쪽이 정확하고 더 싸다 (`fx-particle.py` 의 bolt·slash 와 같다).

## 구조 — 조각 하나로 전부 설명된다

정육면체의 6면을 3×3 으로 쪼갠 **타일 54장**(루빅스 큐브와 같은 칸 수)이 이 연출의 전부다.

  모임   흩어져 있던 54장이 제자리로 빨려 들어온다  → "체스 말이 모여 뭉친다"
  결합   제자리에 닿는 순간 흰 섬광, 큐브가 된다
  충전   천천히 돌며 금빛이 틈에서 새어 나오고 잔떨림이 커진다
  폭발   같은 24장이 밖으로 튀며 회전·축소·소멸, 충격파 링과 불똥

같은 조각이 모였다 흩어지므로 앞뒤가 자연스럽게 이어진다. 조각을 따로 만들면
'모인 것'과 '터진 것'이 다른 물건으로 보인다.

## 그리기

정투영에 약한 원근을 섞고(`PERSP`), 타일을 **평균 z 로 정렬해 먼 것부터** 칠한다
(화가 알고리즘 — 볼록한 육면체라 이걸로 충분하다. 백페이스 컬링이 따로 필요 없다).
가장자리 계단을 없애려고 {SS}배로 크게 그린 뒤 줄인다.

## 출력

`public/assets/fx/sheets/cubeburst_192x192.png` — 8열 × 5행 격자.
한 줄로 늘어놓으면 7680px 라 구형 모바일 GPU 의 텍스처 한계(4096)를 넘는다.
기존 긴 시트(impact 6×5, puffstars 7×6)도 전부 격자인 이유가 이것이다.
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "fx" / "sheets" / "cubeburst_192x192.png"

FW = FH = 192
FRAMES = 40
COLS, ROWS = 8, 5
SS = 3                      # 슈퍼샘플 배율

CUBE_PX = 30                # 큐브 반지름(픽셀). '작은 큐브'라 프레임의 1/3 을 넘지 않는다
SPLIT = 3                   # 면을 N×N 으로 쪼갠다. 3 이면 루빅스처럼 6×3×3 = 54 조각
PERSP = 7.0                 # 원근 거리. 작을수록 왜곡이 커진다
BLAST_PX = 74               # 폭발 조각이 날아가는 최대 거리. 프레임(반폭 96)을 넘지 않는다

IVORY = (238, 232, 216)
BLACK = (34, 30, 28)
GOLD = (255, 176, 58)
HOT = (255, 244, 214)

# 프레임 구간 (끝 포함하지 않음)
T_GATHER = (0, 15)          # 모임
T_LOCK = (14, 19)           # 결합 섬광
T_CHARGE = (19, 28)         # 충전
T_BURST = (28, FRAMES)      # 폭발


def ramp(i: int, a: int, b: int) -> float:
    """구간 [a, b) 안에서의 진행도 0~1 (밖이면 0 또는 1)."""
    if b <= a:
        return 1.0
    return min(1.0, max(0.0, (i - a) / (b - a)))


def ease_out(t: float) -> float:
    return 1.0 - (1.0 - t) ** 3


def ease_in(t: float) -> float:
    return t * t


# ── 정육면체 타일 24장 ────────────────────────────────────────────────────────

def face_basis() -> list[tuple[tuple[float, float, float], ...]]:
    """면마다 (중심, u축, v축). u·v 는 면 위의 단위 방향이다."""
    return [
        ((1, 0, 0), (0, 1, 0), (0, 0, 1)),
        ((-1, 0, 0), (0, 0, 1), (0, 1, 0)),
        ((0, 1, 0), (0, 0, 1), (1, 0, 0)),
        ((0, -1, 0), (1, 0, 0), (0, 0, 1)),
        ((0, 0, 1), (1, 0, 0), (0, 1, 0)),
        ((0, 0, -1), (0, 1, 0), (1, 0, 0)),
    ]


def build_tiles() -> list[dict]:
    """6면 × SPLIT×SPLIT 장. 각 타일은 제자리(home)·모서리 4개·색을 들고 있다.

    면은 u,v 로 [-1, 1] 을 덮는다. N 등분하면 칸 중심은 (2i+1)/N - 1, 반폭은 1/N 이다.
    """
    tiles = []
    rng = random.Random(7)
    half = 1.0 / SPLIT
    for fi, (c, u, v) in enumerate(face_basis()):
        for iu in range(SPLIT):
            for iv in range(SPLIT):
                ou = (2 * iu + 1) / SPLIT - 1
                ov = (2 * iv + 1) / SPLIT - 1
                home = tuple(c[k] + u[k] * ou + v[k] * ov for k in range(3))
                corners = []
                for du, dv in ((-half, -half), (half, -half), (half, half), (-half, half)):
                    corners.append(tuple(u[k] * du + v[k] * dv for k in range(3)))
                # 밖에서 빨려 들어오는 출발점 — 제자리 방향으로 멀리, 조금 흩뜨린다
                n = math.sqrt(sum(t * t for t in home)) or 1.0
                far = 3.4 + rng.uniform(0.0, 2.2)
                start = tuple(home[k] / n * far + rng.uniform(-0.7, 0.7) for k in range(3))
                tiles.append({
                    "home": home,
                    "start": start,
                    "corners": corners,
                    "normal": tuple(x / n for x in home),
                    "color": IVORY if (iu + iv + fi) % 2 == 0 else BLACK,
                    "spin": (rng.uniform(-1, 1), rng.uniform(-1, 1)),
                    "delay": rng.uniform(0.0, 0.30),      # 한 박자로 모이면 기계처럼 보인다
                    "blast": rng.uniform(0.55, 1.0),
                })
    return tiles


def rot3(p, yaw: float, pitch: float):
    x, y, z = p
    cy, sy = math.cos(yaw), math.sin(yaw)
    x, z = x * cy + z * sy, -x * sy + z * cy
    cp, sp = math.cos(pitch), math.sin(pitch)
    y, z = y * cp - z * sp, y * sp + z * cp
    return x, y, z


def project(p, scale: float, cx: float, cy: float):
    f = PERSP / (PERSP - p[2])
    return cx + p[0] * scale * f, cy + p[1] * scale * f


def shade(color, nz: float) -> tuple[int, int, int]:
    """면이 정면을 볼수록 밝다. 평면 색만 칠하면 큐브가 도형으로 안 읽힌다."""
    k = 0.62 + 0.38 * max(0.0, nz)
    return tuple(min(255, int(c * k)) for c in color)


# ── 한 프레임 ────────────────────────────────────────────────────────────────

def radial(size: int, r: float, color, alpha: float) -> Image.Image:
    """부드러운 원형 발광.

    **원을 채우고 블러** 하는 방식은 쓸 수 없다. 반지름이 프레임보다 커지면 가운데가
    평평한 판이 되고, 그게 프레임 경계에서 잘려 **사각형 섬광**으로 보인다.
    여기서는 중심에서 0 까지 떨어지는 감쇠를 직접 계산해 끝이 반드시 0 이 되게 한다.
    반지름도 프레임 안으로 묶는다.
    """
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if alpha <= 0 or r <= 0:
        return im
    r = min(r, size * 0.46)                     # 프레임 밖으로 새면 모서리가 각지게 잘린다
    ax = np.arange(size) - (size - 1) / 2
    d = np.sqrt(ax[None, :] ** 2 + ax[:, None] ** 2) / r
    fall = np.clip(1.0 - d, 0.0, 1.0) ** 2.2    # 가장자리에서 정확히 0
    a = (fall * 255 * min(1.0, alpha)).astype(np.uint8)
    rgba = np.zeros((size, size, 4), np.uint8)
    rgba[:, :, 0], rgba[:, :, 1], rgba[:, :, 2] = color
    rgba[:, :, 3] = a
    return Image.fromarray(rgba)


def draw_frame(i: int, tiles: list[dict]) -> Image.Image:
    size = FW * SS
    cx = cy = size / 2
    scale = CUBE_PX * SS
    rng = random.Random(1000 + i)

    g = ramp(i, *T_GATHER)
    lock = ramp(i, *T_LOCK)
    charge = ramp(i, *T_CHARGE)
    burst = ramp(i, *T_BURST)

    # 큐브는 계속 돈다. 충전 구간에서 빨라졌다가 터질 때 멈춘다
    yaw = 0.5 + 1.5 * g + 2.6 * charge
    pitch = -0.52 + 0.18 * math.sin(i * 0.21)

    # 충전 잔떨림 — 커질수록 곧 터진다는 신호가 된다
    jitter = charge * (1 - burst) * 2.6 * SS
    ox = rng.uniform(-jitter, jitter)
    oy = rng.uniform(-jitter, jitter)

    # 결합 직후 눌렸다 펴지는 숨. 1.0 을 넘겼다 돌아온다
    puff = 1.0 + 0.12 * math.sin(lock * math.pi) + 0.06 * math.sin(charge * math.pi * 3)
    scale *= puff

    layers = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # 뒤쪽 금빛 — 충전하며 커지고, 터지는 순간 가장 밝다
    glow_a = 0.55 * charge * (1 - burst) + 0.9 * max(0.0, 1 - burst * 3)  * (1 if i >= T_BURST[0] else 0)
    if glow_a > 0:
        layers.alpha_composite(radial(size, scale * (1.5 + 1.2 * charge), GOLD, glow_a * 0.55))

    # ── 타일 ──
    quads = []
    for t in tiles:
        # 모임: 출발점 → 제자리. 타일마다 시작이 어긋난다
        gt = ease_out(min(1.0, max(0.0, (g - t["delay"]) / max(1e-3, 1 - t["delay"]))))
        pos = [t["start"][k] + (t["home"][k] - t["start"][k]) * gt for k in range(3)]

        # 폭발: 제자리 → 바깥. 법선 방향으로 튀어 나간다
        bt = ease_in(burst) * t["blast"]
        if bt > 0:
            d = BLAST_PX / CUBE_PX * bt
            pos = [pos[k] + t["normal"][k] * d for k in range(3)]

        # 조각 자체의 회전 — 모일 때 격하게, 붙으면 멈추고, 터지면 다시 돈다
        spin = (1 - gt) * 2.4 + burst * 3.0
        sx = t["spin"][0] * spin
        sy = t["spin"][1] * spin

        # 크기: 모이며 커지고, 터지며 줄어든다
        sz = (0.35 + 0.65 * gt) * (1 - 0.65 * burst)

        pts, zs = [], []
        for c in t["corners"]:
            local = rot3([c[k] * sz for k in range(3)], sx, sy)
            world = rot3([pos[k] + local[k] for k in range(3)], yaw, pitch)
            zs.append(world[2])
            pts.append(project(world, scale, cx + ox, cy + oy))

        nz = rot3(t["normal"], yaw, pitch)[2]
        alpha = min(1.0, gt * 1.6) * max(0.0, 1 - burst ** 1.25) ** 1.4
        quads.append((sum(zs) / 4, pts, shade(t["color"], nz), alpha))

    # 먼 것부터 칠한다 (화가 알고리즘)
    quads.sort(key=lambda q: q[0])
    cube = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cube)
    for _, pts, col, alpha in quads:
        if alpha <= 0.01:
            continue
        a = int(255 * alpha)
        cd.polygon(pts, fill=(*col, a), outline=(*GOLD, int(a * (0.25 + 0.75 * charge))))
    layers.alpha_composite(cube)

    # 결합 섬광 — 제자리에 닿는 순간 한 번
    flash = math.sin(lock * math.pi) ** 2 * (1 - charge)
    if flash > 0.01:
        layers.alpha_composite(radial(size, scale * 1.9, HOT, flash * 0.85))

    # ── 폭발 ──
    if burst > 0:
        # 흰 섬광: 터지는 첫 두세 프레임에만. 길게 끌면 화면이 하얘진다
        wf = max(0.0, 1 - burst * 4.5)
        if wf > 0:
            layers.alpha_composite(radial(size, scale * (1.6 + 3.0 * burst), HOT, wf))

        # 충격파 링 — 넓어지며 얇아진다
        r = min(scale * (1.0 + 4.4 * ease_out(burst)), size * 0.46)
        w = max(1, int(SS * 5 * (1 - burst)))
        ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        rd = ImageDraw.Draw(ring)
        ra = int(230 * (1 - burst) ** 1.4)
        if ra > 2:
            rd.ellipse([cx - r, cy - r * 0.72, cx + r, cy + r * 0.72],
                       outline=(*GOLD, ra), width=w)
            layers.alpha_composite(ring.filter(ImageFilter.GaussianBlur(SS * 1.2)))

        # 불똥 — 조각보다 멀리, 가늘게
        sp = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sp)
        srng = random.Random(99)
        for k in range(26):
            ang = srng.uniform(0, math.tau)
            spd = srng.uniform(0.6, 1.5)
            d0 = min(scale * 1.1 + BLAST_PX * SS * 1.15 * ease_out(burst) * spd, size * 0.47)
            x0 = cx + math.cos(ang) * d0
            y0 = cy + math.sin(ang) * d0 * 0.78
            tail = SS * 9 * (1 - burst)
            x1 = cx + math.cos(ang) * (d0 - tail)
            y1 = cy + math.sin(ang) * (d0 - tail) * 0.78
            sa = int(255 * (1 - burst) ** 1.6)
            if sa > 3:
                sd.line([x0, y0, x1, y1], fill=(*GOLD, sa), width=max(1, int(SS * 1.4)))
        layers.alpha_composite(sp)

    return layers.resize((FW, FH), Image.LANCZOS)


def main() -> int:
    tiles = build_tiles()
    sheet = Image.new("RGBA", (FW * COLS, FH * ROWS), (0, 0, 0, 0))
    for i in range(FRAMES):
        f = draw_frame(i, tiles)
        sheet.paste(f, ((i % COLS) * FW, (i // COLS) * FH))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT)
    print(f"{OUT}  {sheet.size}  {FRAMES}프레임 / {FW}x{FH}  "
          f"{COLS}열 x {ROWS}행  {OUT.stat().st_size // 1024}KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
