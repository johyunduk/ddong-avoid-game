# -*- coding: utf-8 -*-
r"""뿌요 투척 무기 3종 → 게임 시트 한 장.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/build-puyo-weapons.py

`FX_PARTICLE_ASSETS`(전 캐릭터 공용 로딩)에 넣지 않는다 — 하이디를 안 고른 판에서도
VRAM 을 먹는다. **하이디 전용 `extraFxSheets`** 로 가도록 시트 한 장에 3프레임으로 굽는다.

**세 무기에 같은 배율을 쓴다.** 각자 칸에 꽉 채우면 게임에서 셋이 같은 크기로 보여
"수리검은 작고 삼지창은 크다"는 구분이 사라진다. 제일 큰 삼지창을 기준으로 한 배율을
정해 셋에 똑같이 먹인다.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as nd
import os
FX_WORK = os.environ.get('DDONG_FX_WORK', 'C:/Users/user/ddong-fx-work')  # 생성 원본·작업물 (저장소 밖)

SRC = f'{FX_WORK}/heidi-puyo/weapons_v2_raw.png'
OUT = f'{FX_WORK}/heidi-puyo/sheet/puyo_weapon_64x64.png'
FRAME = 64
MARGIN = 2          # 칸 안쪽 여백(px)
MIN_ISLAND = 2000
NAMES = ['수리검', '쿠나이', '삼지창쿠나이']


def islands(solid):
    lab, n = nd.label(solid)
    sz = nd.sum(solid, lab, range(1, n + 1))
    out = []
    for k in range(1, n + 1):
        if sz[k - 1] < MIN_ISLAND:
            continue
        ys, xs = np.where(lab == k)
        out.append((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    out.sort(key=lambda b: b[0])
    return out


def shrink(rgba, h):
    """프리멀티플라이 후 축소 — 안 하면 투명한 쪽 색이 섞여 테두리가 탁해진다."""
    a = rgba.astype(np.float64)
    al = a[:, :, 3:4] / 255.0
    a[:, :, :3] *= al
    w = max(1, round(rgba.shape[1] * h / rgba.shape[0]))
    p = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA').resize((w, h), Image.LANCZOS)
    o = np.array(p).astype(np.float64)
    a2 = o[:, :, 3:4] / 255.0
    o[:, :, :3] = np.where(a2 > 0, o[:, :, :3] / np.maximum(a2, 1e-6), 0)
    return np.clip(o, 0, 255).astype(np.uint8)


def main():
    im = Image.open(SRC).convert('RGBA')
    a = np.array(im)
    solid = a[:, :, 3] > 24
    boxes = islands(solid)
    assert len(boxes) == 3, f'섬이 3개가 아니다: {len(boxes)}'

    tall = max(y1 - y0 for _, y0, _, y1 in boxes)
    limit = FRAME - MARGIN * 2
    cells = []
    for (x0, y0, x1, y1), name in zip(boxes, NAMES):
        crop = np.dstack([a[y0:y1, x0:x1, :3], (solid[y0:y1, x0:x1] * 255).astype(np.uint8)])
        h = max(1, round((y1 - y0) * limit / tall))     # **공통 배율**
        s = shrink(crop, h)
        if s.shape[1] > limit:                           # 가로가 넘치면 그때만 더 줄인다
            s = shrink(crop, max(1, round(h * limit / s.shape[1])))
        cell = np.zeros((FRAME, FRAME, 4), np.uint8)
        oy = (FRAME - s.shape[0]) // 2
        ox = (FRAME - s.shape[1]) // 2
        cell[oy:oy + s.shape[0], ox:ox + s.shape[1]] = s
        cells.append(cell)
        print(f'  {name}: 원본 {x1 - x0}x{y1 - y0} → 칸 안 {s.shape[1]}x{s.shape[0]}')

    strip = np.concatenate(cells, axis=1)
    import os
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    Image.fromarray(strip, 'RGBA').save(OUT)
    m = strip[:, :, 3] > 8
    colors = len(np.unique(strip[m][:, :3], axis=0))
    semi = ((strip[:, :, 3] > 0) & (strip[:, :, 3] < 255)).sum() / max(1, m.sum()) * 100
    print(f'  → {OUT}')
    print(f'  3프레임 · {strip.shape[1]}x{strip.shape[0]} · 색 {colors} · 반투명 {semi:.1f}% · '
          f'{strip.shape[1] * strip.shape[0] * 4 / 1048576:.3f}MB')


if __name__ == '__main__':
    main()
