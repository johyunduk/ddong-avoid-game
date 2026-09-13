r"""레드 마무리 로봇 — 강하·베기가 화면 안에서 도는지 검수.

실제 시트·실제 수치로 각 단계를 360x640 화면에 그린다. 위 여백은 **화면 밖**이라
시작 지점이 제대로 숨는지 같이 본다.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/cube/robot-stage-check.py
"""
import pathlib

from PIL import Image, ImageDraw

# 가장 좁고 짧은 흔한 모바일 세로 화면. 여기서 안 잘리면 다른 데서도 안 잘린다
W, H = 320, 568
FRAME = 192
ART_W = 136 / 192          # ROBOT_ART_W
LAND_Y = H * 0.42
PLAYER_W, PLAYER_H = 47, 80
OUT = pathlib.Path('creative/_fx/red-orbit')
OUT.mkdir(parents=True, exist_ok=True)

sheet = Image.open('public/assets/fx/sheets/robot_192x192.png').convert('RGBA')
slash = Image.open('public/assets/fx/sheets/slash_256x192.png').convert('RGBA') \
    if pathlib.Path('public/assets/fx/sheets/slash_256x192.png').exists() else None
player = Image.open('public/assets/players/red_front.webp').convert('RGBA') \
    .resize((PLAYER_W, PLAYER_H), Image.LANCZOS)

M = 170                    # 화면 위 여백 — 시작 지점이 밖에 있는지 보려고
# 강하 → 착지 → **예비(칼을 가장 높이 든다)** → 베기 → 퇴장. 전 구간을 본다
CASES = [
    ('강하 시작 y=-frame', 0, None, 'fall'),
    ('착지 y=0.42H', 1, LAND_Y, 'fall'),
    ('예비 동작 (칼 최고점)', 2, LAND_Y, 'raise'),
    ('베기', 4, LAND_Y, 'slash'),
    ('퇴장 y=-frame', 5, None, 'slash'),
]


def panel(frame_i, y, label, size, px):
    im = Image.new('RGBA', (W + 2 * M, H + 2 * M), (10, 9, 12, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([M, M, M + W, M + H], fill=(26, 24, 30, 255))
    d.rectangle([M, M, M + W, M + H], outline=(90, 130, 160, 255), width=2)
    im.alpha_composite(player, (M + round(px - PLAYER_W / 2), M + round(H - 80 - PLAYER_H / 2)))

    k = size / FRAME
    half = size * ART_W * 0.5
    dropx = min(max(px, half), W - half)          # RedAbility 의 클램프와 같은 식
    cy = -size if y is None else y

    if label == '베기' and slash is not None:
        s = slash.crop((0, 0, 256, 192))
        sw = round(W * 1.1)
        s = s.resize((sw, round(192 * sw / 256)), Image.LANCZOS).rotate(10.3, expand=True)
        im.alpha_composite(s, (M + round(dropx - s.width / 2), M + round(cy - s.height / 2)))

    f = sheet.crop((frame_i * FRAME, 0, (frame_i + 1) * FRAME, FRAME))
    n = round(FRAME * k)
    f = f.resize((n, n), Image.LANCZOS)
    im.alpha_composite(f, (M + round(dropx - n / 2), M + round(cy - n / 2)))

    d.text((M + 6, M + 6), f'{label}  robotFrame={size}', fill=(230, 230, 235, 255))
    if dropx != px:
        d.text((M + 6, M + 20), f'클램프: x {px:.0f} → {dropx:.0f}', fill=(255, 210, 90, 255))
    return im


rows = []
for size, px in [(132, W / 2), (160, W / 2), (160, 23)]:
    rows.append([panel(fi, y, lab, size, px) for lab, fi, y, _ in CASES])

cw = 300
ch = round((H + 2 * M) / (W + 2 * M) * cw)
out = Image.new('RGB', (len(CASES) * (cw + 8) + 8, len(rows) * (ch + 8) + 8), (12, 12, 14))
for r, row in enumerate(rows):
    for c, im in enumerate(row):
        out.paste(im.convert('RGB').resize((cw, ch), Image.LANCZOS),
                  (8 + c * (cw + 8), 8 + r * (ch + 8)))
out.save(OUT / 'robot_stage.png')
print('saved', OUT / 'robot_stage.png', out.size)
print(f'화면 {W}x{H} · 행: 이전 132 / 이후 160 / 이후 160 화면 왼쪽 끝')
for size in (132, 160):
    print(f'  robotFrame {size}: 그림 {136 * size / FRAME:.0f}x{169 * size / FRAME:.0f}px '
          f'· 플레이어(80)의 {169 * size / FRAME / 80:.2f}배 · 반폭 {size * ART_W / 2:.1f}px'
          f' · 예비 칼끝 y={LAND_Y - 85 * size / FRAME:.0f} · 아래끝 y={LAND_Y + 84 * size / FRAME:.0f}'
          f' · 시작 아래끝 y={-size + 84 * size / FRAME:.0f}')
