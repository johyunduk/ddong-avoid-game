"""테드 큐브 이펙트 — 2차안(저장소 화풍) 후보 생성기.

fx(w7) 의 1차안이 실사 3D 렌더풍이라 저장소 화풍과 이질적이라는 판단에서 나온 대안이다.
게임 코드는 건드리지 않는다 — 후보 프레임과 검증 이미지만 만든다.

## 화풍 근거 (실측)
  ted_front     212x312 네이티브 -> 50x80 표시 (0.26x 축소) · 반투명 1.3% = 하드 엣지
  chess 말      96x128  네이티브 -> 72px 표시 (0.56x 축소) · 반투명 1.5% = 하드 엣지
  lotus/foxfire 192px   네이티브 -> 약 1:1       · 반투명 14~19% = 부드러운 발광
  큐브(목표)    192px 프레임 x chessCubeScale 0.95 -> 약 182px 표시

  즉 이 저장소는 **오브젝트는 하드 엣지 + 한정 팔레트로 그려 축소해 쓰고,
  발광만 부드럽게 쌓는다.** 확대된 픽셀 블록은 어디에도 없다.

## 팔레트 (chess_96x128.png 에서 직접 추출)
  흑말 #0b0b0b~#0e0e0e / 외곽선 #000000 / 하이라이트 #ffffff
  백말 #f1e4cc~#f2e5cd / 하이라이트 #ffffff

## 후보
  A(cel)   4x 슈퍼샘플 후 축소 — 체스 말과 같은 처리. 하드 엣지, 셀 셰이딩
  B(pixel) 48px 네이티브를 NEAREST 로 4x 확대 — 고전 픽셀아트(블록이 보임)

사용:
  C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/make-ted-cube-pixel.py
"""
from __future__ import annotations

import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join("creative", "_fx", "ted-cube", "pixel")
FRAME = 192          # 시트 한 프레임 (게임에서 0.95배 -> 약 182px)
FRAMES = 8           # lotus / legacyburn 과 같은 장수
DISPLAY = 182        # 실제 게임 표시 크기 — 축소 검증에 쓴다

# chess_96x128.png 에서 뽑은 값 그대로
BLACK = (13, 13, 13)
BLACK_TOP = (58, 58, 64)
BLACK_RIGHT = (26, 26, 29)
BLACK_LEFT = (5, 5, 5)
IVORY = (241, 228, 204)
IVORY_TOP = (255, 255, 255)
IVORY_RIGHT = (226, 211, 182)
IVORY_LEFT = (185, 171, 144)
OUTLINE = (0, 0, 0)
GOLD = (255, 201, 92)
GOLD_HOT = (255, 246, 214)


def iso(u: float, v: float, w: float, cell: float) -> tuple[float, float]:
    """(u,v,w) 격자 좌표를 아이소메트릭 화면 좌표로."""
    return ((u - v) * cell * 0.866, (u + v) * cell * 0.5 - w * cell)


# 큐브 한 칸의 세 보이는 면. 각 면은 중심에서의 오프셋 4개.
FACES = (
    ("top", ((-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1))),
    ("right", ((1, -1, 1), (1, 1, 1), (1, 1, -1), (1, -1, -1))),
    ("left", ((-1, 1, 1), (1, 1, 1), (1, 1, -1), (-1, 1, -1))),
)


def shade(is_black: bool, face: str) -> tuple[int, int, int]:
    if is_black:
        return {"top": BLACK_TOP, "right": BLACK_RIGHT, "left": BLACK_LEFT}[face]
    return {"top": IVORY_TOP, "right": IVORY_RIGHT, "left": IVORY_LEFT}[face]


def draw_subcube(dr: ImageDraw.ImageDraw, cx: float, cy: float,
                 c: tuple[float, float, float], half: float, cell: float,
                 is_black: bool, line: int) -> None:
    """칸 하나를 아이소 큐브로 그린다. 세 면 + 검은 외곽선."""
    for name, corners in FACES:
        pts = []
        for du, dv, dw in corners:
            x, y = iso(c[0] + du * half, c[1] + dv * half, c[2] + dw * half, cell)
            pts.append((cx + x, cy + y))
        dr.polygon(pts, fill=shade(is_black, name),
                   outline=OUTLINE if line else None, width=line)


def radial(size: int, cx: float, cy: float, r: float,
           inner: tuple[int, int, int], outer: tuple[int, int, int]) -> Image.Image:
    """빛샘 코어 — 큐브보다 **먼저** 깔아서 칸 사이 틈으로 새어 보이게 한다."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    steps = 26
    for s in range(steps, 0, -1):
        f = s / steps
        rr = r * f
        a = int(235 * (1.0 - f) ** 1.5)
        col = tuple(int(inner[i] * (1 - f) + outer[i] * f) for i in range(3))
        dr.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=(*col, a))
    return img


def frame_params(i: int) -> dict:
    """8장의 연출 구간. 모임 -> 뭉침 -> 충전 -> 파열."""
    # gap 을 크게 벌리면 큐브가 격자로 풀려 실루엣이 죽는다. 충전 구간에서도
    # 0.26 을 넘기지 않고, 대신 코어를 올려 '틈으로 새는 빛'으로 읽히게 한다.
    # 파열 구간은 조각을 오히려 키운다 — 작아지면 큐브였다는 게 안 읽힌다.
    return [
        dict(explode=2.40, gap=0.30, core=0.10, coreR=0.16, scale=0.86, spin=1.0, flash=0.00),
        dict(explode=1.15, gap=0.22, core=0.18, coreR=0.20, scale=0.94, spin=0.6, flash=0.00),
        dict(explode=0.00, gap=0.08, core=0.22, coreR=0.24, scale=1.00, spin=0.0, flash=0.00),
        dict(explode=0.02, gap=0.13, core=0.55, coreR=0.32, scale=1.02, spin=0.0, flash=0.00),
        dict(explode=0.05, gap=0.18, core=0.82, coreR=0.40, scale=1.04, spin=0.0, flash=0.00),
        dict(explode=0.10, gap=0.24, core=1.00, coreR=0.50, scale=1.07, spin=0.0, flash=0.18),
        dict(explode=0.72, gap=0.26, core=0.95, coreR=0.78, scale=1.16, spin=0.3, flash=0.70),
        dict(explode=1.70, gap=0.28, core=0.40, coreR=1.05, scale=1.06, spin=0.7, flash=0.34),
    ][i]


def render(i: int, size: int, line: int, soft: bool) -> Image.Image:
    p = frame_params(i)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cx = cy = size / 2
    cell = size * 0.115 * p["scale"]
    # 아이소 큐브는 세로로 길어 보인다 — 중심을 살짝 내려 프레임 가운데에 앉힌다
    cy += cell * 0.35

    # 1) 코어를 먼저 — 칸 사이 틈으로 새어 나오는 빛
    core_r = size * p["coreR"]
    if p["core"] > 0:
        g = radial(size, cx, cy, core_r, GOLD_HOT, GOLD)
        if soft:
            g = g.filter(ImageFilter.GaussianBlur(size * 0.012))
        img.alpha_composite(Image.blend(Image.new("RGBA", (size, size), (0, 0, 0, 0)),
                                        g, p["core"]))

    # 2) 27칸을 뒤에서 앞으로
    rnd = random.Random(20260911)
    cells = []
    for gi in range(3):
        for gj in range(3):
            for gk in range(3):
                cells.append((gi, gj, gk))
    cells.sort(key=lambda t: t[0] + t[1] + t[2])

    dr = ImageDraw.Draw(img)
    half = 0.5 * (1.0 - p["gap"])
    for gi, gj, gk in cells:
        base = (gi - 1, gj - 1, gk - 1)
        if p["explode"] > 0:
            # 흩어질 때는 중심에서 밖으로. 칸마다 조금씩 다르게 흔들어 기계적으로 안 보이게
            jit = [rnd.uniform(-0.35, 0.35) for _ in range(3)]
            d = [base[n] + jit[n] * p["spin"] for n in range(3)]
            norm = math.sqrt(sum(x * x for x in d)) or 1.0
            c = tuple(base[n] + d[n] / norm * p["explode"] * 1.5 for n in range(3))
        else:
            c = base
        is_black = (gi + gj + gk) % 2 == 0
        draw_subcube(dr, cx, cy, c, half, cell, is_black, line)

    # 3) 파열 섬광 — 위에 덧대는 가산 발광
    if p["flash"] > 0:
        fl = radial(size, cx, cy, size * 0.5 * (0.5 + p["flash"]), GOLD_HOT, GOLD)
        if soft:
            fl = fl.filter(ImageFilter.GaussianBlur(size * 0.02))
        img.alpha_composite(Image.blend(Image.new("RGBA", (size, size), (0, 0, 0, 0)),
                                        fl, min(1.0, p["flash"] * 0.75)))
    return img


def build_cel() -> Image.Image:
    """후보 A — 4x 슈퍼샘플 후 축소. 체스 말과 같은 처리(하드 엣지 + 축소)."""
    ss = 4
    sheet = Image.new("RGBA", (FRAME * FRAMES, FRAME), (0, 0, 0, 0))
    for i in range(FRAMES):
        big = render(i, FRAME * ss, line=max(2, ss * 2), soft=True)
        sheet.alpha_composite(big.resize((FRAME, FRAME), Image.LANCZOS), (FRAME * i, 0))
    return sheet


def build_pixel() -> Image.Image:
    """후보 B — 저해상도 네이티브를 NEAREST 로 확대. 블록이 보이는 고전 픽셀아트.

    48px 로는 한 칸이 10px 도 안 돼 3x3 이 뭉갰다. 64px 이 최소선이다.
    """
    native = 64
    sheet = Image.new("RGBA", (FRAME * FRAMES, FRAME), (0, 0, 0, 0))
    for i in range(FRAMES):
        small = render(i, native, line=1, soft=False)
        sheet.alpha_composite(small.resize((FRAME, FRAME), Image.NEAREST), (FRAME * i, 0))
    return sheet


def on_dark(im: Image.Image) -> Image.Image:
    bg = Image.new("RGBA", im.size, (24, 24, 28, 255))
    bg.alpha_composite(im)
    return bg.convert("RGB")


def build_comparison(sheets: dict[str, Image.Image]) -> None:
    """기존 에셋과 **실제 게임 상대 크기**로 나란히 놓는다.

    크기는 코드에서 읽은 값 그대로다 —
      플레이어 50x80 (GameScene playerDisplaySize 기본값)
      체스 말 72px 높이 (TED_PARAMS.chessHeight)
      큐브 182px (192 프레임 x chessCubeScale 0.95)
    이 비율로 놓아야 '게임 화면에서 같이 보일 때' 붙는지가 보인다.
    """
    items: list[tuple[str, Image.Image]] = []

    ted = os.path.join("public", "assets", "players", "ted_front.webp")
    if os.path.exists(ted):
        items.append(("ted_front\n50x80", Image.open(ted).convert("RGBA").resize((50, 80), Image.LANCZOS)))

    chess = os.path.join("public", "assets", "fx", "sheets", "chess_96x128.png")
    if os.path.exists(chess):
        pc = Image.open(chess).convert("RGBA").crop((96 * 6, 0, 96 * 7, 128))
        items.append(("chess 말\n72px", pc.resize((54, 72), Image.LANCZOS)))

    lotus = os.path.join("public", "assets", "fx", "sheets", "lotus_192x192.png")
    if os.path.exists(lotus):
        lf = Image.open(lotus).convert("RGBA").crop((192 * 5, 0, 192 * 6, 192))
        items.append(("lotus\n182px", lf.resize((182, 182), Image.LANCZOS)))

    fox = os.path.join("public", "assets", "fx", "sheets", "foxfire_128x192.png")
    if os.path.exists(fox):
        ff = Image.open(fox).convert("RGBA").crop((128 * 4, 0, 128 * 5, 192))
        # foxfire 는 단색 시트라 런타임에 착색해 쓴다 — 금빛으로 물들여 실제 모습에 맞춘다
        tint = Image.new("RGBA", ff.size, (*GOLD, 255))
        tint.putalpha(ff.split()[3])
        items.append(("foxfire (착색)\n121x182", tint.resize((121, 182), Image.LANCZOS)))

    for name, sheet in sheets.items():
        f = sheet.crop((FRAME * 5, 0, FRAME * 6, FRAME))  # 충전 최대 프레임
        items.append((f"{name}\n182px", f.resize((DISPLAY, DISPLAY), Image.LANCZOS)))

    pad, label_h = 26, 34
    w = sum(im.width for _, im in items) + pad * (len(items) + 1)
    h = max(im.height for _, im in items) + pad * 2 + label_h
    canvas = Image.new("RGBA", (w, h), (24, 24, 28, 255))
    dr = ImageDraw.Draw(canvas)
    x = pad
    base = max(im.height for _, im in items) + pad
    for label, im in items:
        canvas.alpha_composite(im, (x, base - im.height))
        for n, line in enumerate(label.split("\n")):
            dr.text((x, base + 6 + n * 13), line, fill=(190, 190, 200))
        x += im.width + pad
    canvas.convert("RGB").save(os.path.join(OUT, "_comparison_gamescale.png"))
    print("  비교: creative/_fx/ted-cube/pixel/_comparison_gamescale.png")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    made = []
    sheets = {"A_cel": build_cel(), "B_pixel": build_pixel()}
    for name, sheet in sheets.items():
        path = os.path.join(OUT, f"{name}_{FRAME}x{FRAME}.png")
        sheet.save(path)
        on_dark(sheet).save(os.path.join(OUT, f"{name}_contact.png"))
        # 실제 게임 크기로 줄여본 검증 — 여기서 3x3 이 안 읽히면 실패다
        d = Image.new("RGBA", (DISPLAY * FRAMES, DISPLAY), (0, 0, 0, 0))
        for i in range(FRAMES):
            f = sheet.crop((FRAME * i, 0, FRAME * (i + 1), FRAME))
            d.alpha_composite(f.resize((DISPLAY, DISPLAY), Image.LANCZOS), (DISPLAY * i, 0))
        on_dark(d).save(os.path.join(OUT, f"{name}_at{DISPLAY}px.png"))
        made.append(path)
        print(f"  {name}: {path}")
    build_comparison(sheets)
    print(f"프레임 {FRAME}px x {FRAMES}장 · 표시 {DISPLAY}px 검증본 동봉")


if __name__ == "__main__":
    main()
