r"""레드 참새 궤도 — 머리 위 여백과 참새 아래폭을 실측하고, 실제로 렌더해 겹침을 본다.

`RED_PARAMS.orbitHeadInsetH` / `orbitAbove` / `orbitRy` 의 출처다.
검수 그림 `creative/_fx/red-orbit/orbit_check.png` 를 같이 낸다.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/measure-orbit.py
"""
import glob
import math
import pathlib

from PIL import Image, ImageDraw

PW, PH = 47, 80          # character.ts 의 playerDisplaySize
SPARROW_FRAME = 128
SPARROW_DISP = 32        # RED_PARAMS.sparrowFrame
COUNT = 5                # sparrowCount
RX, RY = 52, 12          # orbitRx, orbitRy
ABOVE = 25               # orbitAbove
BACK_SCALE, BACK_ALPHA = 0.85, 0.82

OUT = pathlib.Path('creative/_fx/red-orbit')
OUT.mkdir(parents=True, exist_ok=True)


def alpha_bbox(im):
    return im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()


# ── 실측 ──────────────────────────────────────────────────────────────────────
insets = {}
for f in sorted(glob.glob('public/assets/players/red_*.webp')):
    im = Image.open(f).convert('RGBA')
    insets[pathlib.Path(f).name] = alpha_bbox(im)[1] / im.height
inset_h = min(insets.values())
print('머리 위 빈칸 (표시 높이 대비)')
for k, v in insets.items():
    print(f'  {k:20s} {v:.4f}  = 표시 {v * PH:.1f}px')
print(f'  → 가장 작은 값 {inset_h:.4f} ({inset_h * PH:.1f}px) 을 쓴다\n')

sheets = sorted(glob.glob('public/assets/fx/sheets/sparrow_*_128x128.png'))
below = 0.0
print('참새가 제 중심보다 아래로 내려오는 최대치 — 시트마다 다르다 (모자·망토)')
for f in sheets:
    im = Image.open(f).convert('RGBA')
    one = 0.0
    for i in range(im.width // SPARROW_FRAME):
        bb = alpha_bbox(im.crop((i * SPARROW_FRAME, 0,
                                 (i + 1) * SPARROW_FRAME, SPARROW_FRAME)))
        if bb:
            one = max(one, (bb[3] - SPARROW_FRAME / 2) * SPARROW_DISP / SPARROW_FRAME)
    below = max(below, one)
    print(f'  {pathlib.Path(f).name:32s} {one:5.1f}px  '
          f'(여유 {ABOVE - RY - one:+.1f}px)')
print(f'  → 가장 깊은 {below:.1f}px 로 계산한다')
gap = ABOVE - RY - below
print(f'여유 = orbitAbove({ABOVE}) - orbitRy({RY}) - {below:.1f} = {gap:.1f}px'
      f'  {"OK" if gap > 0 else "겹침!"}\n')

# ── 호 길이 등분 ──────────────────────────────────────────────────────────────
# 각도로 등분하면 납작한 타원의 좌우 끝에서 뭉친다. 그 지점의 두 마리는 x 가 같고
# y 만 다르므로 간격이 1.176 x RY 로 고정되고 RX 와 무관하다.
LUT_N = 2048
_cum = [0.0]
for k in range(1, LUT_N + 1):
    _tm = (k - 0.5) / LUT_N * 2 * math.pi
    _cum.append(_cum[-1] + math.hypot(RX * math.sin(_tm), RY * math.cos(_tm))
                * (2 * math.pi / LUT_N))


def arc_theta(u, even=True):
    if not even:
        return (u % 1.0) * 2 * math.pi
    target = (u % 1.0) * _cum[-1]
    lo, hi = 1, LUT_N
    while lo < hi:
        mid = (lo + hi) // 2
        if _cum[mid] < target:
            lo = mid + 1
        else:
            hi = mid
    a_, b_ = _cum[lo - 1], _cum[lo]
    f = (target - a_) / (b_ - a_) if b_ > a_ else 0.0
    return (lo - 1 + f) / LUT_N * 2 * math.pi


def min_sep(even, steps=720):
    best = 1e9
    for st in range(steps):
        u0 = st / steps
        pts = [(math.cos(arc_theta(u0 + i / COUNT, even)) * RX,
                math.sin(arc_theta(u0 + i / COUNT, even)) * RY) for i in range(COUNT)]
        for i in range(COUNT):
            for j in range(i + 1, COUNT):
                best = min(best, math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]))
    return best


print()
print(f'참새 5마리 최소 간격 — 등각 {min_sep(False):.1f}px '
      f'→ 호길이 등분 {min_sep(True):.1f}px  (참새 표시 폭 {SPARROW_DISP}px)')

# ── 렌더 ──────────────────────────────────────────────────────────────────────
player = Image.open('public/assets/players/red_front.webp').convert('RGBA')
player = player.resize((PW, PH), Image.LANCZOS)
birds = [Image.open(f).convert('RGBA').crop((0, 0, SPARROW_FRAME, SPARROW_FRAME))
         for f in sheets]

CW, CH = 200, 190
PX, PY = CW / 2, 150                    # 플레이어 중심
head_top = PY - PH * (0.5 - inset_h)


def panel(above, ry, phase0, label, even=True):
    im = Image.new('RGBA', (CW, CH), (28, 26, 32, 255))
    im.alpha_composite(player, (round(PX - PW / 2), round(PY - PH / 2)))
    d = ImageDraw.Draw(im)
    cy = head_top - above
    phs = [arc_theta(phase0 + i / COUNT, even) for i in range(COUNT)]
    order = sorted(range(COUNT), key=lambda i: math.sin(phs[i]))
    for i in order:
        ph = phs[i]
        front = math.sin(ph) > 0
        k = (SPARROW_DISP / SPARROW_FRAME) * (1 if front else BACK_SCALE)
        b = birds[i].resize((max(1, round(SPARROW_FRAME * k)),) * 2, Image.LANCZOS)
        if math.cos(ph) > 0:
            b = b.transpose(Image.FLIP_LEFT_RIGHT)
        if not front:
            b.putalpha(b.getchannel('A').point(lambda v: int(v * BACK_ALPHA)))
        im.alpha_composite(b, (round(PX + math.cos(ph) * RX - b.width / 2),
                               round(cy + math.sin(ph) * ry - b.height / 2)))
    # 머리 꼭대기 선 — 이 선 아래로 참새가 내려오면 겹친 것이다
    d.line([0, head_top, CW, head_top], fill=(255, 90, 90, 200), width=1)
    d.text((4, 4), label, fill=(230, 230, 235, 255))
    return im


# u=0 이 좌우 끝에 두 마리가 걸리는 **가장 빡빡한** 배치다. 아래쪽 참새가 가장
# 내려오는 순간도 같이 본다
PHASES = [0.0, 0.1, 0.25, 0.5]
rows = [[panel(ABOVE, RY, p, 'angle (before)', even=False) for p in PHASES],
        [panel(ABOVE, RY, p, 'arc (after)', even=True) for p in PHASES]]
Z = 2
sheet = Image.new('RGB', (len(PHASES) * (CW * Z + 6) + 6, 2 * (CH * Z + 6) + 6), (12, 12, 14))
for r, row in enumerate(rows):
    for c, im in enumerate(row):
        sheet.paste(im.convert('RGB').resize((CW * Z, CH * Z), Image.NEAREST),
                    (6 + c * (CW * Z + 6), 6 + r * (CH * Z + 6)))
sheet.save(OUT / 'orbit_check.png')
print('saved', OUT / 'orbit_check.png', sheet.size, '· 윗줄 등각 / 아랫줄 호길이 등분')
