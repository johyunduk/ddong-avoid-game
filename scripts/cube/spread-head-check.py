r"""퍼질 때 **머리가 진행 방향 앞**인지 검수 그림.

두 장을 낸다.
  1. head_pixels.png  — 말을 임의 각도로 돌렸을 때 픽셀이 뭉개지는지 (연속 vs 8/16방향 양자화)
  2. head_trace.png   — 하네스가 **실제로 돌린** 좌표·회전(build/cube/spread_trace.json)을
                        그대로 그리고, 그 위에 판정 선분·반경과 똥의 생존 여부를 겹친다

    C:\ComfyUI\.venv\Scripts\python.exe scripts/cube/spread-head-check.py
"""
import json
import math
import pathlib

from PIL import Image, ImageDraw

SHEET = 'public/assets/fx/sheets/chess_96x128.png'
FW, FH = 96, 128
DISP_W, DISP_H = 54, 72          # chessHeight 72 × 0.75 — 게임이 실제로 그리는 크기
HEAD = [0.4688, 0.3281, 0.1953, 0.1484, 0.0547,
        0.4375, 0.3125, 0.1953, 0.1484, 0.0625]
OUT = pathlib.Path('creative/_fx/ted-cube')
OUT.mkdir(parents=True, exist_ok=True)

sheet = Image.open(SHEET).convert('RGBA')
FRAMES = [sheet.crop((i * FW, 0, (i + 1) * FW, FH)) for i in range(sheet.width // FW)]


def piece(frame, rot, w=DISP_W, h=DISP_H, pad=2.2):
    """표시 크기로 줄인 뒤 **머리 원점**을 중심으로 돌린 그림. 캔버스 한가운데가 원점이다."""
    small = FRAMES[frame].resize((max(1, round(w)), max(1, round(h))), Image.BILINEAR)
    s = int(max(w, h) * pad)
    canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    # 원점(0.5, HEAD[frame]) 이 캔버스 중앙에 오도록 놓는다
    canvas.alpha_composite(small, (s // 2 - small.width // 2,
                                   s // 2 - round(HEAD[frame] * small.height)))
    # Phaser 회전은 화면에서 시계방향, PIL 은 반시계 → 부호를 뒤집는다
    return canvas.rotate(-math.degrees(rot), resample=Image.BICUBIC, center=(s / 2, s / 2))


def quant(r, steps):
    if steps < 2:
        return r
    q = 2 * math.pi / steps
    return round(r / q) * q


# ── 1. 픽셀 검수 ──────────────────────────────────────────────────────────────
DIRS = 16
CELL = 128
rows = [('연속 (채택)', 0), ('16방향 양자화', 16), ('8방향 양자화', 8)]
pix = Image.new('RGB', (DIRS * CELL + 8, len(rows) * CELL + 8), (18, 18, 20))
for ri, (_, steps) in enumerate(rows):
    for di in range(DIRS):
        th = di / DIRS * 2 * math.pi                 # 진행 방향
        rot = quant(th + math.pi / 2, steps)         # 머리가 앞 → r = θ + π/2
        cell = Image.new('RGBA', (CELL, CELL), (18, 18, 20, 255))
        img = piece(4 if di % 2 == 0 else 0, rot)    # 킹/폰 번갈아 — 키 차이가 큰 둘
        cell.alpha_composite(img, (CELL // 2 - img.width // 2, CELL // 2 - img.height // 2))
        d = ImageDraw.Draw(cell)
        # 진행 방향 화살표 — 머리가 이쪽을 봐야 한다
        d.line([CELL / 2, CELL / 2,
                CELL / 2 + math.cos(th) * 46, CELL / 2 + math.sin(th) * 46],
               fill=(255, 90, 90, 255), width=2)
        pix.paste(cell.convert('RGB'), (4 + di * CELL, 4 + ri * CELL))
pix.save(OUT / 'head_pixels.png')
print('saved', OUT / 'head_pixels.png', pix.size, '· 행: 연속 / 16방향 / 8방향')

# ── 2. 궤적 검수 ──────────────────────────────────────────────────────────────
tr = json.load(open('build/cube/spread_trace.json'))
W, H = tr['screen']['w'], tr['screen']['h']
R = tr['hitRadius']
frames = tr['frames']
picks = [frames[i] for i in (0, len(frames) // 3, 2 * len(frames) // 3, len(frames) - 1)]

# 말은 **화면 밖까지** 날아간다. 화면만 그리면 나가는 순간을 못 보므로 여백을 두고
# 화면 경계를 선으로 표시한다
M = 130
shots = []
for fr in picks:
    im = Image.new('RGBA', (W + 2 * M, H + 2 * M), (10, 9, 12, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([M, M, M + W, M + H], fill=(24, 22, 28, 255))
    d.rectangle([M, M, M + W, M + H], outline=(90, 130, 160, 255), width=2)
    # 똥 — 지워진 것은 X, 살아남은 것은 채운 원
    for q in tr['poops']:
        c = (92, 58, 32, 255) if q['alive'] else (60, 30, 30, 255)
        d.ellipse([M + q['x'] - 9, M + q['y'] - 9, M + q['x'] + 9, M + q['y'] + 9], fill=c)
        if not q['alive']:
            d.line([M + q['x'] - 7, M + q['y'] - 7, M + q['x'] + 7, M + q['y'] + 7], fill=(255, 70, 70), width=2)
            d.line([M + q['x'] - 7, M + q['y'] + 7, M + q['x'] + 7, M + q['y'] - 7], fill=(255, 70, 70), width=2)
    for q in tr['special']:
        d.ellipse([M + q['x'] - 8, M + q['y'] - 8, M + q['x'] + 8, M + q['y'] + 8],
                  fill=(216, 176, 72, 255) if q['alive'] else (255, 0, 0, 255))
    # 판정 반경 — 원점(= 머리끝)을 중심으로 한다
    for p in fr['p']:
        d.ellipse([M + p['x'] - R, M + p['y'] - R, M + p['x'] + R, M + p['y'] + R], outline=(70, 200, 255, 160))
    for p in fr['p']:
        img = piece(p['f'] % len(HEAD), p['r'], p['w'], p['h'])
        if p['a'] < 1:
            img.putalpha(img.getchannel('A').point(lambda v, a=p['a']: int(v * a)))
        im.alpha_composite(img, (M + round(p['x']) - img.width // 2, M + round(p['y']) - img.height // 2))
        # 원점 = 판정 끝점. 이 점이 말의 **머리끝**에 있어야 한다
        d.ellipse([M + p['x'] - 2, M + p['y'] - 2, M + p['x'] + 2, M + p['y'] + 2], fill=(255, 240, 90, 255))
    shots.append((fr['t'], im))

cw = 300
ch = round((H + 2 * M) / (W + 2 * M) * cw)
sheet2 = Image.new('RGB', (len(shots) * (cw + 8) + 8, ch + 8), (12, 12, 14))
for i, (_, im) in enumerate(shots):
    sheet2.paste(im.convert('RGB').resize((cw, ch), Image.LANCZOS), (8 + i * (cw + 8), 4))
sheet2.save(OUT / 'head_trace.png')
print('saved', OUT / 'head_trace.png', sheet2.size,
      '· 시각(ms):', [t for t, _ in shots])
