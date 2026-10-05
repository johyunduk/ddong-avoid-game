# -*- coding: utf-8 -*-
r"""불투명 배경 위에 그린 **효과·소품 시트**(까마귀·검은 불 등) 한 장 -> 가로 한 줄 시트.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-grid-ingest.py <원본.png> <출력.png> \
        --cols 6 --rows 1 --cell 96 [--anchor center|bottom] [--fill 0.9]

뿌요 시트 조립기(build-puyo-sheet)는 **개의 몸통 두께**로 크기를 맞춘다. 개가 아닌 것
(새·불꽃)에 쓰면 두께가 달라 엉뚱하게 커진다. 여기서는 **모든 칸을 같은 배율**로 줄인다 —
칸마다 따로 맞추면 날갯짓·불꽃 흔들림이 크기 변화로 보인다.

배경은 **바깥에 이어진 배경색 덩어리만** 지운다 (그림 속 같은 색은 남는다).
칸은 격자로 자르고, 칸 안의 그림 덩어리 bbox 로 자리를 잡는다:
  center — bbox 가운데를 칸 가운데로 (새처럼 공중에 뜬 것)
  bottom — bbox 아래를 칸 아래로 (불처럼 바닥에서 솟는 것)
  left   — **왼쪽 끝 단면**을 칸 왼쪽에, 그 단면의 세로 가운데를 칸 가운데로
           (뱀 머리처럼 목이 잘려 코드의 몸통에 이어 붙는 것. 입·혀가 움직여 bbox 가
           컷마다 달라도 목 자리는 안 흔들린다)
"""
import argparse
from collections import Counter

import numpy as np
from PIL import Image
from scipy import ndimage as nd


def strip_bg(a, tol=26, holes=False):
    # 이미 **진짜 투명 배경**이면 그대로 쓴다 — 투명 픽셀의 RGB 가 검정이라, 테두리 색을
    # 배경으로 보고 지우면 그림의 검은 윤곽선까지 날아간다
    if (a[..., 3] < 250).mean() > 0.2:
        return a, np.array([0, 0, 0])
    rgb = a[..., :3].astype(np.int16)
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bgc = np.array(Counter(map(tuple, border)).most_common(1)[0][0])
    near = np.abs(rgb - bgc).max(axis=2) <= tol
    lab, _ = nd.label(near)
    keep = set(lab[0].tolist()) | set(lab[-1].tolist()) | set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
    keep.discard(0)
    out = a.copy()
    # holes: 그림 **안에 갇힌** 배경색 조각도 지운다 (불꽃 혀 사이에 낀 회색 점).
    # 그림 자체에 배경과 같은 회색이 없을 때만 켠다 — 개 털처럼 회색이 있으면 구멍이 난다
    drop = near if holes else np.isin(lab, list(keep))
    out[..., 3] = np.where(drop, 0, 255)
    return out, bgc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--cols', type=int, required=True)
    ap.add_argument('--rows', type=int, default=1)
    ap.add_argument('--cell', type=int, default=96)
    ap.add_argument('--cellh', type=int, default=0, help='칸 높이 (기본 = --cell, 정사각). 세로로 긴 문 같은 것')
    ap.add_argument('--anchor', default='center', choices=['center', 'bottom', 'left'])
    ap.add_argument('--fill', type=float, default=0.9, help='가장 큰 칸이 출력 칸을 채우는 비율')
    ap.add_argument('--tol', type=int, default=26)
    ap.add_argument('--holes', action='store_true', help='그림 안에 갇힌 배경색 조각도 지운다')
    ap.add_argument('--ref-cols', default='', help='배율을 이 열들(0부터, 쉼표)로만 잰다. 예: 0. '
                    '터지며 퍼지는 컷이 섞이면 그 컷에 맞춰 멀쩡한 컷까지 작아진다')
    a = ap.parse_args()

    img = np.array(Image.open(a.src).convert('RGBA'))
    img, bgc = strip_bg(img, a.tol, a.holes)
    H, W = img.shape[:2]
    cw, ch = W / a.cols, H / a.rows
    solid = img[..., 3] > 24

    boxes = []
    for r in range(a.rows):
        for c in range(a.cols):
            x0, y0, x1, y1 = int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)
            m = solid[y0:y1, x0:x1]
            # 칸 안에서 **큰 덩어리만** 센다 — 옆 칸에서 넘어온 부스러기에 bbox 가 끌려가지 않게
            lab, n = nd.label(m)
            if n == 0:
                boxes.append(None); continue
            sz = nd.sum(m, lab, range(1, n + 1))
            big = [i + 1 for i, s in enumerate(sz) if s >= max(40, sz.max() * 0.02)]
            mm = np.isin(lab, big)
            ys, xs = np.where(mm)
            boxes.append((x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1, mm, x0, y0))

    ch_ = a.cellh or a.cell
    ref = [int(v) for v in a.ref_cols.split(',') if v != '']
    refb = [b for i, b in enumerate(boxes) if b and (not ref or i % a.cols in ref)]
    # 가로·세로 중 더 빠듯한 쪽에 맞춘다 (칸이 정사각이 아닐 수 있다)
    k = min(a.cell * a.fill / max(b[2] - b[0] for b in refb),
            ch_ * a.fill / max(b[3] - b[1] for b in refb))
    out = Image.new('RGBA', (a.cell * len(boxes), ch_), (0, 0, 0, 0))
    for i, b in enumerate(boxes):
        if not b:
            continue
        bx0, by0, bx1, by1, mm, x0, y0 = b
        piece = img[by0:by1, bx0:bx1].copy()
        keep = mm[by0 - y0:by1 - y0, bx0 - x0:bx1 - x0]
        piece[..., 3] = np.where(keep, piece[..., 3], 0)
        # 기준 열 밖의 컷이 칸보다 크면 **그 컷만** 줄여 넣는다
        kk = min(k, a.cell / max(1, bx1 - bx0), ch_ / max(1, by1 - by0))
        pw, ph = max(1, round((bx1 - bx0) * kk)), max(1, round((by1 - by0) * kk))
        p = Image.fromarray(piece, 'RGBA').resize((pw, ph), Image.LANCZOS)
        px = i * a.cell + (a.cell - pw) // 2
        py = (ch_ - ph) // 2 if a.anchor == 'center' else ch_ - ph - 2
        if a.anchor == 'left':
            # 왼쪽 끝 6% 기둥(목 단면)의 세로 가운데
            cols = max(1, int(keep.shape[1] * 0.06))
            ys = np.where(keep[:, :cols].any(axis=1))[0]
            neck = (ys.min() + ys.max()) / 2 * kk if len(ys) else ph / 2
            px = i * a.cell + 2
            py = int(round(ch_ / 2 - neck))
        out.alpha_composite(p, (px, py))
    out.save(a.dst)
    print(f'  배경 {bgc.tolist()} · 칸 {len(boxes)} · 배율 {k:.3f} · {a.dst} '
          f'({out.width}x{out.height}, VRAM {out.width * out.height * 4 / 1048576:.2f}MB)')


if __name__ == '__main__':
    main()
