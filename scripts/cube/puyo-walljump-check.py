# -*- coding: utf-8 -*-
r"""뿌요 벽차기 — 게임 크기로 궤적을 그려 본다.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/cube/puyo-walljump-check.py

`HeidiAbility.stepJump` 와 **같은 식**을 파이썬으로 다시 쓴 것이다. 수치만 맞추고
넘어가면 벽을 허공에서 짚거나 발바닥이 화면 밖으로 나가는 것을 못 본다 —
실제 시트를 실제 표시 크기로 얹어 눈으로 본다.
"""
import re

from PIL import Image

W, H = 360, 640                 # 세로 폰 기준
GROUND = 560                    # 바닥선 (플레이어 발밑)
PLAYER_H = 80

SRC = 'public/assets/fx/sheets'
P = {}
for m in re.finditer(r'(puyo\w+):\s+([\d.]+),', open('src/config/abilityParams.ts',
                                                     encoding='utf-8').read()):
    P.setdefault(m.group(1), float(m.group(2)))

SCALE = P['puyoScale']
DISP = PLAYER_H * SCALE
FOOT = 118 / 128


def sheet(name):
    im = Image.open(f'{SRC}/puyo_{name}_128x128.png').convert('RGBA')
    return [im.crop((i * 128, 0, i * 128 + 128, 128))
            for i in range(im.width // 128)]


def paste(canvas, frame, x, y, flip):
    im = frame.resize((round(DISP), round(DISP)), Image.LANCZOS)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    canvas.alpha_composite(im, (round(x - im.width / 2), round(y - im.height * FOOT)))


def main():
    half = DISP / 2
    start_x = W * 0.78                       # 오른쪽에서 출발 → 먼 쪽은 왼쪽
    wall_x = P['puyoWallMargin'] + half      # 왼쪽 벽
    wall_y = GROUND - H * P['puyoWallH']
    land_x = W * P['puyoLandW']              # 왼쪽 벽에서 화면 폭의 70%

    legs = [
        # 뒤집기는 **가는 방향**이다 (게임 코드와 같다) — 왼쪽 벽이므로 도약은 안 뒤집고,
        # 되돌아 내려오는 날라차기만 뒤집는다
        ('① 도약', sheet('jump'), start_x, GROUND, wall_x, wall_y, True, False),
        ('③ 날라차기', sheet('kick'), wall_x, wall_y, land_x, GROUND, False, True),
    ]

    def panel(title, fr, x0, y0, x1, y1, rising, flip, wall_frames=None):
        """두 구간을 한 그림에 겹쳐 놓으면 경로가 거의 같아 섞인다 — 나누어 그린다."""
        c = Image.new('RGBA', (W, H), (150, 196, 226, 255))
        c.alpha_composite(Image.new('RGBA', (W, H - GROUND), (120, 160, 110, 255)), (0, GROUND))
        for i in range(81):
            u = i / 80
            x = x0 + (x1 - x0) * u
            y = (y0 + (y1 - y0) * u - H * P['puyoRiseH'] * 4 * u * (1 - u)
                 if rising else y0 + (y1 - y0) * u * u)
            c.alpha_composite(Image.new('RGBA', (3, 3), (255, 255, 255, 170)),
                              (round(x) - 1, round(y) - 1))
        for k, u in enumerate((0.0, 0.3, 0.6, 1.0)):
            x = x0 + (x1 - x0) * u
            y = (y0 + (y1 - y0) * u - H * P['puyoRiseH'] * 4 * u * (1 - u)
                 if rising else y0 + (y1 - y0) * u * u)
            paste(c, fr[min(k, len(fr) - 1)], x, y, flip)
        if wall_frames:
            for i, f in enumerate(wall_frames):
                paste(c, f, wall_x + i * 46, wall_y, False)
        void = title
        return c, void

    panels = [panel(*legs[0], wall_frames=None)[0],
              panel(*legs[1], wall_frames=sheet('wall'))[0]]
    bg = Image.new('RGBA', (W * 2 + 8, H), (30, 30, 34, 255))
    for i, c in enumerate(panels):
        bg.alpha_composite(c, (i * (W + 8), 0))

    out = 'creative/_fx/heidi-puyo/_검수_벽차기_게임크기.png'
    bg.convert('RGB').save(out)
    print(f'saved {out}')
    print(f'  표시 높이 {DISP:.1f}px (플레이어 {PLAYER_H}px 의 {SCALE}배) · '
          f'벽 x={wall_x:.0f} (스프라이트 왼쪽 끝 {wall_x - half:.0f}) · '
          f'짚는 높이 바닥에서 {GROUND - wall_y:.0f}px · 착지 x={land_x:.0f}')
    assert wall_x - half >= 0, '스프라이트가 화면 왼쪽으로 새어 나간다'
    assert land_x + half <= W, '착지가 화면 오른쪽으로 새어 나간다'


if __name__ == '__main__':
    main()
