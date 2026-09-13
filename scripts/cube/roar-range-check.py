r"""티라노 포효 — **보이는 링 = 지워지는 범위** 검수 그림.

왼쪽이 고치기 전, 오른쪽이 고친 뒤. 노란 원이 눈에 보이는 링, 파란 원이 실제 판정
반경이다. 둘이 어긋나면 "링에 닿았는데 안 지워진다" 가 된다.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/cube/roar-range-check.py
"""
import math
import pathlib

from PIL import Image, ImageDraw

W, H = 360, 640
RING_ART_R = 87.4          # scripts/measure-ring.py 실측
ROAR_X, ROAR_Y = W / 2, H - 96
OUT = pathlib.Path('creative/_fx/ted-cube')
OUT.mkdir(parents=True, exist_ok=True)

CASES = [
    ('고치기 전 — 반경 180px, 링 배율 (R*2)/92',
     180.0, (180.0 * 2 / 92) * RING_ART_R),
    ('고친 뒤 — 반경 0.70W=252px, 링 배율 R/87.4',
     W * 0.70, (W * 0.70 / RING_ART_R) * RING_ART_R),
]

M = 110                    # 링이 화면 밖으로 나가는 것까지 보이게 여백을 둔다
panels = []
for _, hit_r, ring_r in CASES:
    im = Image.new('RGBA', (W + 2 * M, H + 2 * M), (10, 9, 12, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([M, M, M + W, M + H], fill=(24, 22, 28, 255))
    d.rectangle([M, M, M + W, M + H], outline=(90, 130, 160, 255), width=2)

    # 똥 격자 — 하네스와 같은 간격
    for gy in range(40, H, 46):
        for gx in range(20, W, 40):
            hit = math.hypot(gx - ROAR_X, gy - ROAR_Y) < hit_r
            c = (60, 30, 30, 255) if hit else (150, 100, 55, 255)
            d.ellipse([M + gx - 8, M + gy - 8, M + gx + 8, M + gy + 8], fill=c)
            if hit:      # 지워진 것
                d.line([M + gx - 6, M + gy - 6, M + gx + 6, M + gy + 6], fill=(255, 70, 70), width=2)
                d.line([M + gx - 6, M + gy + 6, M + gx + 6, M + gy - 6], fill=(255, 70, 70), width=2)

    cx, cy = M + ROAR_X, M + ROAR_Y
    # 판정 반경 (파랑) — 실제로 지워지는 데까지
    d.ellipse([cx - hit_r, cy - hit_r, cx + hit_r, cy + hit_r],
              outline=(80, 200, 255, 255), width=3)
    # 보이는 링 (노랑)
    d.ellipse([cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r],
              outline=(255, 220, 90, 255), width=3)
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=(255, 255, 255, 255))
    panels.append(im)

cw = 420
ch = round((H + 2 * M) / (W + 2 * M) * cw)
sheet = Image.new('RGB', (len(panels) * (cw + 10) + 10, ch + 10), (12, 12, 14))
for i, im in enumerate(panels):
    sheet.paste(im.convert('RGB').resize((cw, ch), Image.LANCZOS), (10 + i * (cw + 10), 5))
sheet.save(OUT / 'roar_range.png')
for _, hit_r, ring_r in CASES:
    print(f'  hit={hit_r:.0f}px  ring={ring_r:.0f}px  '
          f'gap={abs(ring_r - hit_r):.0f}px  x{ring_r / hit_r:.2f}')
print('saved', OUT / 'roar_range.png', sheet.size)
