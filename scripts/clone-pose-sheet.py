# -*- coding: utf-8 -*-
r"""그림자 분신술 **자세 시트** 조립 — 마젠타 배경 원본 여러 장 -> 128 칸 가로 한 줄.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/clone-pose-sheet.py

생성 그림은 칸 간격이 고르지 않아 **격자로 자르면 강아지가 잘린다.** 그래서 강아지를
2차원 덩어리로 찾아 하나씩 떼어낸다. 배율은 **모든 컷에 같은 값(SCALE)**을 쓴다 —
컷마다 칸에 맞추면 자세에 따라 강아지 크기가 널뛴다 (사람 판정: "사이즈는 같아야").
원본끼리도 같은 캔버스·같은 강아지 크기로 뽑았다 (같은 ChatGPT 대화에서 이어서 요청).
"""
import numpy as np
from PIL import Image
from scipy import ndimage as nd
import os
FX_WORK = os.environ.get('DDONG_FX_WORK', 'C:/Users/user/ddong-fx-work')  # 생성 원본·작업물 (저장소 밖)

CELL = 128
SCALE = 0.325        # 첫 원본(poses_raw) 8컷이 칸의 90% 에 들어가던 배율. 새 컷도 이 배율로
BG = np.array([250, 3, 250])
SPLIT_W = 420     # 원본 px. 이보다 넓은 덩어리는 두 마리가 붙은 것으로 본다
# (원본, 덩어리를 왼쪽부터 셌을 때 쓸 번호들)
SOURCES = [
    (f'{FX_WORK}/clone/poses_raw.png',  [0, 1, 2, 3, 4, 5, 6, 7]),
    # 팔짱 · 만세 대자 · 윙크 경례 · 뛰어오르기 (사람 지정: 팔짱, 만세 대자 + 아무거나 둘)
    (f'{FX_WORK}/clone/poses2_raw.png', [0, 1, 2, 4]),
]
OUT = 'public/assets/fx/sheets/puyo_clonepose_128x128.png'


def islands(path):
    a = np.array(Image.open(path).convert('RGBA')).astype(np.float32)
    fg = np.abs(a[..., :3] - BG).max(axis=2) > 70
    lab, n = nd.label(nd.binary_dilation(fg, iterations=3))
    sizes = nd.sum(fg, lab, range(1, n + 1))
    keep = [L for L in np.argsort(sizes)[::-1][:8] + 1 if sizes[L - 1] > 2000]
    # 마젠타 번짐 제거 (빨강·파랑이 초록보다 넘치는 만큼 빼고 그만큼 투명하게)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    ex = np.clip(np.minimum(r, b) - g, 0, None)
    a[..., 0] = r - ex
    a[..., 2] = b - ex
    al = np.where(fg, 255, 0) * (1 - ex / 200.0)
    al[al < 20] = 0
    a[..., 3] = al
    # 맞닿은 두 마리는 한 덩어리로 잡힌다 (팔짱 · 만세가 그랬다). 너무 넓으면 가운데 구간에서
    # **가장 비어 있는 세로줄**로 가른다
    parts = []
    for L in keep:
        m = (lab == L) & fg
        ys, xs = np.where(m)
        x0, x1 = xs.min(), xs.max()
        if x1 - x0 > SPLIT_W:
            col = m[:, x0:x1 + 1].sum(axis=0)
            lo, hi = int((x1 - x0) * 0.3), int((x1 - x0) * 0.7)
            cut = x0 + lo + int(np.argmin(col[lo:hi]))
            left, right = m.copy(), m.copy()
            left[:, cut:] = False
            right[:, :cut] = False
            parts += [left, right]
        else:
            parts.append(m)
    objs = []
    for m in parts:
        ys, xs = np.where(m)
        objs.append((xs.mean(), m, xs.min(), xs.max(), ys.min(), ys.max()))
    objs.sort(key=lambda o: o[0])
    out = []
    for _, m, x0, x1, y0, y1 in objs:
        crop = a[y0:y1 + 1, x0:x1 + 1].copy()
        crop[..., 3] *= m[y0:y1 + 1, x0:x1 + 1]
        out.append(Image.fromarray(crop.astype(np.uint8)))
    return out


def main():
    cells = []
    for path, picks in SOURCES:
        dogs = islands(path)
        cells += [dogs[i] for i in picks]
    sheet = Image.new('RGBA', (CELL * len(cells), CELL), (0, 0, 0, 0))
    for i, ci in enumerate(cells):
        w, h = ci.size
        ci = ci.resize((max(1, round(w * SCALE)), max(1, round(h * SCALE))), Image.LANCZOS)
        if max(ci.size) > CELL:
            print(f'  ** {i}번 컷이 칸을 넘는다 {ci.size}')
        sheet.alpha_composite(ci, (i * CELL + (CELL - ci.size[0]) // 2, (CELL - ci.size[1]) // 2))
    sheet.save(OUT)
    print(f'{OUT}  {len(cells)}컷  VRAM {sheet.size[0] * CELL * 4 / 1024 / 1024:.2f}MB')


if __name__ == '__main__':
    main()
