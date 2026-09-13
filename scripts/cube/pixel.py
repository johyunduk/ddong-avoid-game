#!/usr/bin/env python3
"""테드 체스 큐브 — **픽셀 판본**. 네이티브 픽셀 격자 위에 직접 그린다.

    PY=C:\\ComfyUI\\.venv\\Scripts\\python.exe
    $PY scripts/cube/pixel.py --palette          # 채택 기준 이미지에서 팔레트 추출 → palette.json
    $PY scripts/cube/pixel.py --phase forge --out build/cube/px_forge
    $PY scripts/cube/pixel.py --phase blast --out build/cube/px_blast

기준 아트 디렉션: `creative/_fx/ted-cube/pixel-chatgpt/` 의 채택 4장
시간 축: `scripts/cube/timeline.py` (3D 판본과 **같은 프레임 수·길이** — TS 상수를 안 건드린다)

## 원칙 (지시 그대로)

1. **줄이지 않는다.** 최종 프레임 크기(192 / 256)에서 바로 그린다. 폴리곤은 안티에일리어싱
   없이 채우므로 모든 모서리가 픽셀 격자에 정확히 떨어진다. 고해상도로 그려 줄이면
   픽셀이 아니라 줄인 그림이 된다.
2. **제한 팔레트.** 색을 눈대중으로 고르지 않는다. 채택 4장에서 k-means(고정 시드)로 뽑아
   `palette.json` 에 박아 두고, 모든 프레임이 그 색만 쓴다.
3. **하드 엣지 + 검은 1px 외곽선.** 반투명 픽셀은 쓰지 않는다 (0% 를 목표로 한다).
4. **면당 단색.** 아이소메트릭 세 면(윗면·좌면·우면)에 각각 한 톤. 그라데이션 없음.
5. **회전 없음.** 임의 각도 회전은 픽셀을 뭉갠다. 채택 4장도 전부 같은 각이다 —
   충전감은 이음새 밝기·압축·각진 광선으로 만든다.

## 왜 네이티브가 192 인가 (실측)

| 기준 파일 | 크기 | 정수배 확대? | 외곽선 |
|---|---|---|---|
| `public/assets/fx/sheets/chess_96x128.png` | 96×128/프레임 | **아니오 (1:1)** | 1px |
| `public/assets/players/ted_front.webp` | 212×312 | **아니오 (1:1)** | 1px |
| 채택 기준 이미지 | 1254px, 픽셀 덩어리 ≈ 8px | 네이티브 ≈ 157px | — |

저장소의 픽셀 기준 두 개가 **네이티브 1:1 · 1px 외곽선**이고, 채택 이미지의 네이티브
해상도(≈157)도 우리 프레임(192)과 같은 자리수다. 그래서 192 에서 1px 격자로 그린다.
96 에 그려 ×2 로 키우면 픽셀이 체스 말보다 두 배 거칠어져 나란히 놓았을 때 따로 논다.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.append(str(Path(__file__).resolve().parent))
import timeline as T  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent.parent
REF_DIR = ROOT / "creative" / "_fx" / "ted-cube" / "pixel-chatgpt"
REF_NAMES = ["01_gather", "02_assemble", "03_charge", "04_burst"]
PALETTE_JSON = Path(__file__).resolve().parent / "palette.json"
CHESS_SHEET = ROOT / "public" / "assets" / "fx" / "sheets" / "chess_96x128.png"
CHESS_FRAME = (96, 128)

# ── 아이소메트릭 격자 ────────────────────────────────────────────────────────
# 정수 2:1 아이소. 가로 2px 갈 때 세로 1px 내려가므로 **모든 모서리가 격자에 떨어진다**.
# 임의 각도로 돌리면 이게 깨져서 계단이 지저분해진다.
CELL = 20                   # 칸 하나의 아이소 반폭(px). 3칸 → 큐브 폭 6*CELL = 120px
GAP = 2                     # 칸 사이 틈(px). 여기로 이음새 빛이 보인다
NEAR_FADE_STEPS = 3         # 파편이 사라질 때 알파가 아니라 **크기를 단계로** 줄인다
CUBIE_FILL = 0.76           # 칸이 자기 자리에서 차지하는 비율. 나머지가 이음새 틈이다


def iso(x: float, y: float, z: float) -> tuple[int, int]:
    """격자 좌표 → 화면 좌표(정수). 원점은 큐브 중심."""
    sx = (x - y) * CELL
    sy = (x + y) * CELL * 0.5 - z * CELL
    return int(round(sx)), int(round(sy))


# ─────────────────────────────────────────────────────────────────────────────
# 팔레트 — 채택 기준 이미지에서 뽑는다 (눈대중 금지)
# ─────────────────────────────────────────────────────────────────────────────

def extract_palette(k: int = 14) -> dict:
    """`creative/_fx/ted-cube/pixel-chatgpt/` 의 채택 4장에서 고정 팔레트를 뽑는다.

    절차 (재현 가능하도록 전부 여기 적는다):
      1. 네 장의 RGB 를 모은다
      2. **배경색을 뺀다.** 가장 흔한 두 색(#141C1C, #1C1C24)이 배경 판이고,
         이 시트는 배경이 투명하므로 팔레트에 들어가면 안 된다
      3. 고정 시드(7) k-means, k=14
      4. 채도·명도로 세 계열(금·아이보리·암부)로 나누고 각 계열을 명도순 램프로 정렬
      5. 가장 어두운 중심을 외곽선 색으로 쓴다 (실측 #040303 ≈ 순수 검정)
    """
    bg = [np.array([20, 28, 28]), np.array([28, 28, 36])]
    px = []
    for n in REF_NAMES:
        a = np.asarray(Image.open(REF_DIR / f"{n}.png").convert("RGB")).reshape(-1, 3).astype(int)
        d = np.minimum(*[np.abs(a - b).sum(1) for b in bg])
        px.append(a[d > 42])
    px = np.concatenate(px)

    rng = np.random.default_rng(7)
    s = px[rng.choice(len(px), min(60000, len(px)), replace=False)].astype(float)
    c = s[rng.choice(len(s), k, replace=False)].copy()
    for _ in range(40):
        lab = np.argmin(((s[:, None, :] - c[None]) ** 2).sum(2), axis=1)
        for i in range(k):
            m = lab == i
            if m.any():
                c[i] = s[m].mean(0)
    centers = [tuple(int(v) for v in row.round()) for row in c]

    def lum(t):
        return 0.299 * t[0] + 0.587 * t[1] + 0.114 * t[2]

    def sat(t):
        return (max(t) - min(t)) / max(max(t), 1)

    gold = sorted(dict.fromkeys(t for t in centers if sat(t) > 0.30), key=lum)
    rest = sorted([t for t in centers if sat(t) <= 0.30], key=lum)
    outline = rest[0]
    # 외곽선과 거의 같은 어두운 중심은 버린다 — 칸의 어두운 면이 외곽선에 묻히면
    # 입체가 아니라 검은 덩어리로 보인다
    rest = [t for t in rest[1:] if lum(t) >= 20]
    dark = [t for t in rest if lum(t) < 110]
    ivory = [t for t in rest if lum(t) >= 110]

    def pick(ramp, n):
        """램프에서 n 단계를 고르게 뽑는다 (부족하면 양끝을 반복)."""
        if not ramp:
            return [(128, 128, 128)] * n
        return [ramp[min(len(ramp) - 1, round(i * (len(ramp) - 1) / max(n - 1, 1)))] for i in range(n)]

    pal = {
        "_source": "creative/_fx/ted-cube/pixel-chatgpt/ 채택 4장, k-means(seed=7, k=14), 배경 제외",
        "outline": outline,
        # 어두운 칸: 어두움 → 밝음 (우면 / 좌면 / 윗면)
        "dark": pick(dark, 3),
        # 아이보리 칸: 어두움 → 밝음
        "ivory": pick(ivory, 3),
    }
    # 가장 밝은 아이보리를 섬광의 코어로 쓴다 (흰색을 새로 만들지 않는다)
    pal["hot"] = pal["ivory"][-1]
    # 금: 어두움 → 뜨거움. 이음새 충전이 이 램프를 **한 칸씩** 타고 올라가고,
    # 맨 위는 아이보리 최상단과 같은 색이라 섬광에서 두 계열이 하나로 만난다
    pal["gold"] = gold + [pal["hot"]]
    return pal


def load_palette() -> dict:
    if not PALETTE_JSON.exists():
        raise SystemExit("palette.json 이 없다. 먼저 `pixel.py --palette` 를 돌려라")
    p = json.loads(PALETTE_JSON.read_text(encoding="utf-8"))
    for key in ("outline", "hot"):
        p[key] = tuple(p[key])
    for key in ("dark", "ivory", "gold"):
        p[key] = [tuple(c) for c in p[key]]
    return p


# ─────────────────────────────────────────────────────────────────────────────
# 그리기 — 전부 안티에일리어싱 없는 폴리곤이다
# ─────────────────────────────────────────────────────────────────────────────

class Canvas:
    def __init__(self, size: int, pal: dict):
        self.size = size
        self.pal = pal
        self.im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
        self.cx = size // 2
        self.cy = size // 2

    def poly(self, pts, fill, outline=True):
        pts = [(self.cx + x, self.cy + y) for x, y in pts]
        self.d.polygon(pts, fill=fill + (255,),
                       outline=(self.pal["outline"] + (255,)) if outline else None)

    def cubie(self, gx: float, gy: float, gz: float, kind: str, scale: float = 1.0,
              seam_only: bool = False) -> None:
        """칸 하나. 아이소 세 면을 각각 **단색**으로 칠하고 검은 1px 외곽선을 두른다.

        `kind` 는 'dark' / 'ivory'. 면 순서는 (우면, 좌면, 윗면) = 어두움 → 밝음.
        """
        ramp = self.pal[kind]
        h = 0.5 * scale                       # 칸 반변 (격자 단위)
        # 여덟 꼭짓점 중 보이는 세 면만 쓴다
        p = {}
        for dx in (-h, h):
            for dy in (-h, h):
                for dz in (-h, h):
                    p[(dx > 0, dy > 0, dz > 0)] = iso(gx + dx, gy + dy, gz + dz)
        top = [p[(0, 0, 1)], p[(1, 0, 1)], p[(1, 1, 1)], p[(0, 1, 1)]]
        left = [p[(0, 1, 1)], p[(1, 1, 1)], p[(1, 1, 0)], p[(0, 1, 0)]]
        right = [p[(1, 0, 1)], p[(1, 1, 1)], p[(1, 1, 0)], p[(1, 0, 0)]]
        if seam_only:
            return
        self.poly(right, ramp[0])
        self.poly(left, ramp[1])
        self.poly(top, ramp[2])

    def iso_block(self, gx: float, gy: float, gz: float, half: float, color) -> None:
        """단색 아이소 덩어리 (이음새 빛의 심지). 외곽선 없이 채우기만 한다."""
        p = {}
        for dx in (-half, half):
            for dy in (-half, half):
                for dz in (-half, half):
                    p[(dx > 0, dy > 0, dz > 0)] = iso(gx + dx, gy + dy, gz + dz)
        for face in ([p[(0, 0, 1)], p[(1, 0, 1)], p[(1, 1, 1)], p[(0, 1, 1)]],
                     [p[(0, 1, 1)], p[(1, 1, 1)], p[(1, 1, 0)], p[(0, 1, 0)]],
                     [p[(1, 0, 1)], p[(1, 1, 1)], p[(1, 1, 0)], p[(1, 0, 0)]]):
            self.poly(face, color, outline=False)

    def spike(self, ang: float, length: float, width: float, color) -> None:
        """각진 광선 하나. **뾰족한 삼각형**이라 가장자리가 계단으로 떨어진다
        (부드러운 감쇠를 쓰면 픽셀이 아니게 된다)."""
        if length < 2:
            return
        ca, sa = math.cos(ang), math.sin(ang)
        px, py = -sa, ca
        tip = (ca * length, sa * length)
        b1 = (px * width, py * width)
        b2 = (-px * width, -py * width)
        self.poly([b1, tip, b2], color, outline=False)

    def diamond(self, x: float, y: float, r: float, color, outline=True) -> None:
        if r < 1:
            return
        self.poly([(x, y - r), (x + r, y), (x, y + r), (x - r, y)], color, outline=outline)


# ─────────────────────────────────────────────────────────────────────────────
# 칸 배치 — 3×3×3 에서 가운데를 뺀 26개
# ─────────────────────────────────────────────────────────────────────────────

def build_cubies() -> list[dict]:
    rng = random.Random(7)
    out = []
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for k in (-1, 0, 1):
                if i == j == k == 0:
                    continue
                n = math.sqrt(i * i + j * j + k * k)
                out.append({
                    "g": (i, j, k),
                    "dir": (i / n, j / n, k / n),
                    "kind": "ivory" if (i + j + k) % 2 == 0 else "dark",
                    "delay": rng.randrange(0, 5),          # 프레임 단위 — 한 박자로 모이면 기계다
                    "speed": rng.uniform(0.75, 1.20),
                    "start_ang": rng.uniform(0, math.tau),
                    "start_r": rng.uniform(3.2, 5.4),
                })
    # 화가 알고리즘: 먼 것부터. 아이소에서 가까운 것은 (i+j+k) 가 큰 쪽이다
    out.sort(key=lambda c: c["g"][0] + c["g"][1] + c["g"][2])
    return out


CUBIES = build_cubies()


# ─────────────────────────────────────────────────────────────────────────────
# 체스 말 → 조각 분해
# ─────────────────────────────────────────────────────────────────────────────

def load_chess_pieces(pal: dict) -> list[list[dict]]:
    """실제 체스 말 시트를 **1:1 로** 읽어 8px 블록으로 자른다.

    게임에 이미 있는 스프라이트를 그대로 쓰므로 팔레트·외곽선·픽셀 밀도가
    자동으로 같아진다. 크기를 바꾸지 않는다 (줄이면 픽셀이 깨진다).
    """
    sheet = Image.open(CHESS_SHEET).convert("RGBA")
    fw, fh = CHESS_FRAME
    rng = random.Random(11)
    pieces = []
    # 폰·나이트·비숍 위주 — 킹/퀸은 프레임의 절반을 먹어 서로 겹친다
    for idx in (0, 6, 7, 1):                      # 흑폰 / 백나이트 / 백비숍 / 흑나이트
        fr = sheet.crop((idx * fw, 0, (idx + 1) * fw, fh))
        a = np.asarray(fr)
        ys, xs = np.nonzero(a[..., 3] > 24)
        if len(xs) == 0:
            continue
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        body = fr.crop((int(x0), int(y0), int(x1), int(y1)))
        B = 8
        blocks = []
        for by in range(0, body.height, B):
            for bx in range(0, body.width, B):
                tile = body.crop((bx, by, min(bx + B, body.width), min(by + B, body.height)))
                if np.asarray(tile)[..., 3].max() <= 24:
                    continue
                blocks.append({
                    "img": tile,
                    "ox": bx - body.width // 2,   # 말 중심 기준 오프셋
                    "oy": by - body.height // 2,
                    "jit": (rng.uniform(-1, 1), rng.uniform(-1, 1)),
                    "delay": rng.randrange(0, 4),
                })
        pieces.append(blocks)
    return pieces


# ─────────────────────────────────────────────────────────────────────────────
# 시간 → 상태
# ─────────────────────────────────────────────────────────────────────────────

def clamp01(v: float) -> float:
    return 0.0 if v < 0 else (1.0 if v > 1 else v)


def span(t: float, a: float, b: float) -> float:
    return 0.0 if b <= a else clamp01((t - a) / (b - a))


def ease_out(u: float) -> float:
    return 1.0 - (1.0 - u) ** 3


def qstep(v: float, step: float = 1.0) -> float:
    """압축·떨림을 **정수 픽셀 단계**로 끊는다. 0.3px 씩 움직이면 가장자리가 떨린다."""
    return round(v / step) * step


def seam_tone(pal: dict, u: float):
    """이음새 빛의 단계. 연속 보간이 아니라 **램프에서 한 칸씩** 올라간다."""
    ramp = pal["gold"]
    i = int(clamp01(u) * (len(ramp) - 1) + 0.5)
    return ramp[i]


# ── forge ───────────────────────────────────────────────────────────────────
F_PIECES = (0, 9)        # 체스 말이 보이는 구간
F_SHATTER = (7, 14)      # 말이 블록으로 분해
F_SNAP = (12, 18)        # 블록이 칸으로 바뀌어 제자리에
F_LOCK = T.F_LOCK        # 18 — 십자 섬광
F_FREEZE = T.F_FREEZE    # 19~20
F_CHARGE = T.F_CHARGE    # 21~32
F_ANTIC = T.F_ANTICIPATE  # 33~35


def forge_frame(i: int, pal: dict, pieces) -> Image.Image:
    c = Canvas(T.FORGE_PX, pal)

    charge = span(i, F_CHARGE[0], F_ANTIC[1] - 1)
    lock = 1.0 if i == F_LOCK else 0.0
    assembled = i >= F_SNAP[1] - 1

    # 압축 — 커지지 않고 **작아지면서** 밝아진다. 1px 단계로 끊는다
    shrink = 1.0 - 0.14 * ease_out(charge)
    jit = (0, 0)
    if F_CHARGE[0] <= i < T.FORGE_FRAMES:
        amp = 1 + int(2 * charge)
        jit = (int(qstep(amp * math.sin(i * 1.7))), int(qstep(amp * math.cos(i * 2.3))))

    # ── 충전 광선 — **큐브 뒤에** 깔아야 빛이 뒤에서 새어 나오는 것으로 읽힌다 ──
    if charge > 0:
        draw_spikes(c, pal, charge, seed=i)

    # ── 이음새 빛 (칸 뒤에 깔린 금색 심지 — 틈으로만 보인다) ──
    if assembled:
        u = 0.12 + 0.88 * charge
        if lock:
            u = 1.0
        c.cx += jit[0]
        c.cy += jit[1]
        c.iso_block(0, 0, 0, 1.5 * shrink, seam_tone(pal, u))

    # ── 칸 ──
    if assembled:
        tone = seam_tone(pal, 1.0 if lock else 0.12 + 0.88 * charge)
        for cu in CUBIES:
            gx, gy, gz = cu["g"]
            # **칸마다 금색 껍질을 먼저 깔고 그 위에 칸을 얹는다.**
            # 큰 심지 하나만 두면 틈(2px)이 양쪽 외곽선(1px+1px)에 다 먹혀 이음새가 안 보인다.
            # 칸보다 한 치수 큰 껍질이 사방으로 삐져나와야 틈이 금색으로 남는다
            # 검은 1px 외곽선은 금색 껍질보다 **한 치수 더 큰 검은 껍질**로 만든다
            # (CELL=20 이므로 격자 0.05 = 1px)
            c.iso_block(gx * shrink, gy * shrink, gz * shrink, 0.5 * shrink + 0.06,
                        c.pal["outline"])
            c.iso_block(gx * shrink, gy * shrink, gz * shrink, 0.5 * shrink, tone)
            c.cubie(gx * shrink, gy * shrink, gz * shrink, cu["kind"], scale=shrink * CUBIE_FILL)
        c.cx -= jit[0]
        c.cy -= jit[1]
    else:
        # 분해 → 수렴. 블록이 제 시각에 칸으로 **바뀐다** (섞지 않는다 — 하드 스왑)
        draw_shatter(c, i, pal, pieces)

    # ── 결합 섬광 — 십자형 ──
    if lock:
        draw_cross(c, pal, 1.0)

    return c.im


def draw_shatter(c: Canvas, i: int, pal: dict, pieces) -> None:
    """말 → 블록 → 칸. 세 상태가 **겹치지 않고 순서대로** 바뀐다."""
    n = len(pieces)
    for pi, blocks in enumerate(pieces):
        ang = math.tau * pi / n + 0.4
        # 말 자체가 안쪽으로 들어온다 (정수 픽셀 이동)
        approach = span(i, F_PIECES[0], F_SHATTER[1])
        r = 56 - 40 * approach
        px, py = int(round(math.cos(ang) * r * 1.15)), int(round(math.sin(ang) * r * 0.72))

        for bi, b in enumerate(blocks):
            t = i - b["delay"]
            broke = span(t, F_SHATTER[0], F_SHATTER[1])
            home = CUBIES[(pi * 7 + bi) % len(CUBIES)]
            hx, hy = iso(*home["g"])

            if broke >= 1.0:
                # 칸으로 바뀐 뒤 — 제자리로 파고든다
                s = span(t, F_SHATTER[1], F_SNAP[1])
                bx = px + b["ox"] + b["jit"][0] * 8
                by = py + b["oy"] + b["jit"][1] * 8
                x = bx + (hx - bx) * ease_out(s)
                y = by + (hy - by) * ease_out(s)
                sz = 0.34 + 0.46 * s
                # 아이소 칸을 화면 좌표에 직접 놓기 위해 중심을 잠시 옮긴다
                ox, oy = c.cx, c.cy
                c.cx, c.cy = ox + int(round(x)), oy + int(round(y))
                c.cubie(0, 0, 0, home["kind"], scale=sz)
                c.cx, c.cy = ox, oy
            else:
                # 아직 말 조각 — 원래 스프라이트를 그대로 붙인다 (크기 변경 없음)
                bx = int(round(px + b["ox"] + b["jit"][0] * 8 * broke))
                by = int(round(py + b["oy"] + b["jit"][1] * 8 * broke))
                c.im.alpha_composite(b["img"], (c.cx + bx, c.cy + by))


def draw_spikes(c: Canvas, pal: dict, amount: float, seed: int, front: bool = False) -> None:
    """기준 이미지 03 의 방사 광선. 길이를 고정 표에서 뽑아 프레임마다 떨지 않게 한다."""
    base = ([1.00, 0.55, 0.80, 0.45, 0.95, 0.50, 0.75, 0.60, 0.88, 0.42, 0.70, 0.52]
            if not front else [0.74, 0.0, 0.62, 0.0, 0.70, 0.0, 0.0, 0.58, 0.0, 0.0, 0.66, 0.0])
    # 맨 위(#FCF3DD)까지 올리면 광선이 흰 덩어리가 된다 — 금색 구간 안에서만 달군다
    hot = seam_tone(pal, 0.35 + 0.45 * amount)
    for k, f in enumerate(base):
        ang = math.tau * k / len(base)
        # 프레임마다 길이가 한 칸씩 널뛰게 — 연속 보간은 픽셀에서 미끄러져 보인다
        pulse = 1.0 + 0.12 * ((seed + k) % 3 - 1)
        # **큐브 반폭(60px)보다 길어야 한다.** 짧으면 큐브 뒤에 완전히 가려 안 보인다
        # 프레임 경계에 닿으면 거기서 잘려 직선 자국이 남는다 — 반드시 안에서 끝낸다
        ln = min(qstep(f * (52 + 38 * amount) * pulse, 2), c.size * 0.45)
        c.spike(ang, ln, max(1.0, qstep(1 + 2 * amount)), hot)
    if front:
        return
    # 작은 마름모 부스러기
    rng = random.Random(1000 + seed)
    for _ in range(int(4 + 8 * amount)):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(40, 74)
        c.diamond(math.cos(a) * d, math.sin(a) * d * 0.8,
                  rng.choice([2, 2, 3]), seam_tone(pal, 0.8), outline=False)


def draw_cross(c: Canvas, pal: dict, amount: float) -> None:
    """**십자형 섬광.** 네 방향 긴 광선 + 대각 짧은 광선 + 가운데 마름모."""
    hot = pal["hot"]
    mid = pal["gold"][-1]
    R = c.size * 0.45 * amount      # 프레임 안에서 끝나야 한다 (경계에서 잘리면 자국이 남는다)
    for k in range(4):
        ang = math.tau * k / 4
        c.spike(ang, R, 6 * amount, mid)
        c.spike(ang, R * 0.78, 3 * amount, hot)
    for k in range(4):
        ang = math.tau * k / 4 + math.pi / 4
        c.spike(ang, R * 0.42, 3 * amount, mid)
    c.diamond(0, 0, int(30 * amount), hot, outline=False)


# ── blast ───────────────────────────────────────────────────────────────────
B_BURST = T.B_BURST          # 1~2
B_AFTER = T.B_AFTERGLOW      # 14~


def blast_frame(j: int, pal: dict) -> Image.Image:
    c = Canvas(T.BLAST_PX, pal)

    if j == 0:
        # 이음새 — forge 마지막 프레임과 **같은 그림**이어야 한다
        f = forge_frame(T.FORGE_FRAMES - 1, pal, None)
        c.im.alpha_composite(f, ((T.BLAST_PX - T.FORGE_PX) // 2,) * 2)
        return c.im

    u = span(j, 1, T.BLAST_FRAMES - 1)
    # 절반 거리를 첫 두 프레임에 간다 — 중간 속도를 보여주지 않는 게 타격감이다
    reach = (1.0 - (1.0 - u) ** 6)

    for cu in CUBIES:
        d = 5.4 * cu["speed"] * reach
        gx = cu["g"][0] + cu["dir"][0] * d
        gy = cu["g"][1] + cu["dir"][1] * d
        gz = cu["g"][2] + cu["dir"][2] * d
        sx, sy = iso(gx, gy, gz)
        # 프레임 경계에서 **잘려 사라지면 안 된다** — 스프라이트 가장자리에 직선 자국이 남는다.
        # 알파로 지울 수도 없으니(픽셀아트) 경계에 닿기 전에 크기를 단계로 줄여 없앤다
        r = max(abs(sx), abs(sy)) / c.size
        edge = 1.0 - clamp01((r - 0.30) / 0.13)
        # **날아가는 내내 큼직해야 한다.** 처음부터 줄이면 파열이 아니라 먼지로 보인다 —
        # 후반(잔광)에 들어서야 단계로 줄어든다. `speed` 는 거리에만 쓴다(크기에 섞으면
        # 시작부터 조각 크기가 제각각이 되어 덩어리감이 사라진다)
        late = clamp01((u - 0.45) / 0.55)
        step = 1.0 - round(late * NEAR_FADE_STEPS) / NEAR_FADE_STEPS * 0.62
        sc = round(min(step, edge) * NEAR_FADE_STEPS) / NEAR_FADE_STEPS
        if sc < 1.0 / NEAR_FADE_STEPS:
            continue
        c.cubie(gx, gy, gz, cu["kind"], scale=sc)

    flash = max(0.0, 1.0 - span(j, B_BURST[0], 7))
    if flash > 0:
        draw_cross(c, pal, flash)
    if j < B_AFTER[0]:
        draw_spikes(c, pal, 1.0 - span(j, 1, B_AFTER[0]), seed=100 + j)
    else:
        # 잔광 — 조각만 남으면 정지 화면처럼 보인다. 작은 마름모가 계속 흩어진다
        rng = random.Random(500 + j)
        fade = 1.0 - span(j, B_AFTER[0], T.BLAST_FRAMES - 1)
        for _ in range(int(3 + 9 * fade)):
            ang = rng.uniform(0, math.tau)
            d = rng.uniform(30, 108)
            c.diamond(math.cos(ang) * d, math.sin(ang) * d * 0.8,
                      2 if fade > 0.5 else 1, seam_tone(pal, 0.3 + 0.5 * fade), outline=False)
    return c.im


# ─────────────────────────────────────────────────────────────────────────────

def quantize_check(im: Image.Image, pal: dict) -> tuple[int, int]:
    a = np.asarray(im)
    al = a[..., 3]
    return int(((al > 8) & (al < 248)).sum()), int((al >= 248).sum())


ICON_PX = 32
ICON_DIR = ROOT / "public" / "assets" / "fx" / "particles"


def write_icons(pal: dict) -> None:
    """코드가 뿌리는 **'말 → 칸' 전환 조각**용 낱장 텍스처.

    이 조각은 시트가 아니라 TedAbility 가 스프라이트로 직접 뿌린다(말 7개 × 4 = 28장).
    기존에 쓰던 `proc-shard` 는 알파가 부드러운 그림이라 픽셀 판본 옆에 붙으면 튄다 —
    같은 팔레트·같은 외곽선으로 칸 하나를 그려 둔다. 24×24 두 장이라 VRAM 은 6KB 다.
    """
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    for kind, name in (("ivory", "px-cubie-ivory.png"), ("dark", "px-cubie-dark.png")):
        c = Canvas(ICON_PX, pal)
        c.iso_block(0, 0, 0, 0.36 + 0.06, pal["outline"])
        c.cubie(0, 0, 0, kind, scale=0.72)
        c.im.save(ICON_DIR / name)
        print(f"  {name}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", action="store_true", help="채택 기준 이미지에서 팔레트 재추출")
    ap.add_argument("--icons", action="store_true", help="전환 조각 낱장 텍스처 생성")
    ap.add_argument("--phase", choices=("forge", "blast"))
    ap.add_argument("--out", default="")
    a = ap.parse_args()

    if a.palette:
        pal = extract_palette()
        PALETTE_JSON.write_text(json.dumps(pal, indent=2, ensure_ascii=False) + "\n",
                                encoding="utf-8")
        print(f"{PALETTE_JSON.relative_to(ROOT)} 갱신")
        for key in ("outline", "hot"):
            print(f"  {key:8s} #{pal[key][0]:02X}{pal[key][1]:02X}{pal[key][2]:02X}")
        for key in ("dark", "ivory", "gold"):
            print(f"  {key:8s} " + " ".join(f"#{c[0]:02X}{c[1]:02X}{c[2]:02X}" for c in pal[key]))
        if not a.phase:
            return 0

    if a.icons:
        write_icons(load_palette())
        if not a.phase:
            return 0

    if not a.phase or not a.out:
        ap.error("--phase 와 --out 이 필요하다")

    pal = load_palette()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    pieces = load_chess_pieces(pal) if a.phase == "forge" else None
    semi = opaque = 0
    if a.phase == "forge":
        for i in range(T.FORGE_FRAMES):
            im = forge_frame(i, pal, pieces)
            im.save(out / f"f{i:04d}.png")
            s, o = quantize_check(im, pal)
            semi += s
            opaque += o
    else:
        for j in range(T.BLAST_FRAMES):
            im = blast_frame(j, pal)
            im.save(out / f"f{j:04d}.png")
            s, o = quantize_check(im, pal)
            semi += s
            opaque += o

    print(f"[pixel] {a.phase} → {out}  반투명 {semi} / 불투명 {opaque} "
          f"({100 * semi / max(opaque, 1):.2f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
