# -*- coding: utf-8 -*-
r"""캐릭터 시트 한 장(3줄 x 3컷) -> 동작별 raw 세 장.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/cut-clone-rows.py kakashi

생성은 한 장에 여러 줄로 받는다 (한 번에 뽑아야 캐릭터가 일관된다).
조립기는 한 줄을 기대하므로 여기서 줄을 갈라 준다.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as nd
import os
FX_WORK = os.environ.get('DDONG_FX_WORK', 'C:/Users/user/ddong-fx-work')  # 생성 원본·작업물 (저장소 밖)

DIR = f'{FX_WORK}/heidi-puyo'
ACTIONS = ['wall', 'throw', 'dash']
MIN_ISLAND = 4000
PAD = 60


def strip_checker(a):
    """**체커보드를 배경으로 벗긴다.**

    생성 모델이 "투명 배경"을 그림으로 이해해서 **회색/흰색 체커 무늬를 실제 픽셀로**
    그려 보내는 일이 있다. 그러면 알파가 전부 불투명이라 모든 칸이 체커를 통해
    한 덩어리로 이어지고, 섬이 1개로 잡힌다.

    테두리에서 가장 흔한 **두 색**(체커의 두 칸)을 배경으로 보고, 거기에 가까우면서
    **바깥에 연결된** 덩어리만 지운다. 색 거리로 전역 판정하면 그림 한가운데의
    흰 털까지 날아간다 (참새·뿌요에서 겪은 그 실수다).
    """
    if (a[:, :, 3] < 250).any():
        return a                                  # 진짜 알파가 있으면 그대로 둔다
    rgb = a[:, :, :3].astype(np.int16)
    # 체커는 **무채색이고 밝다** (흰 칸 + 회색 칸). 색 하나로 잡으면 안 된다 —
    # JPEG 로 뭉개져 흰 칸이 250~255, 회색 칸이 174~204 로 퍼져 있다.
    # 개의 흰 털도 같은 조건에 걸리지만, **바깥에 연결된 것만** 지우므로 안전하다
    # (털은 어두운 외곽선에 둘러싸여 바깥과 안 이어진다)
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    near = (spread <= 14) & (rgb.mean(axis=2) >= 150)
    # **닫기 연산을 쓰지 않는다.** `binary_closing` 은 배열 바깥을 0 으로 보고 침식해
    # 테두리 한 줄을 깎는다 — 그 줄이 바로 '바깥'을 찾는 기준이라 통째로 헛돈다
    lab, _ = nd.label(near)
    keep = set(lab[0].tolist()) | set(lab[-1].tolist()) | set(lab[:, 0].tolist())         | set(lab[:, -1].tolist())
    keep.discard(0)
    outside = np.isin(lab, list(keep))
    out = a.copy()
    out[:, :, 3] = np.where(outside, 0, 255)
    print(f'  체커보드를 벗겼다 (지운 비율 {outside.mean() * 100:.0f}%)')
    return out


def main():
    # cut-clone-rows.py <name> [--actions wall,throw,dash] [--cuts 3] [--tag fin]
    #   --tag 는 원본 파일 이름과 출력 동작 이름에 붙는다 (마무리 기술 시트처럼
    #   3줄 묶음이 아니라 한 줄짜리를 따로 받을 때 쓴다)
    args = sys.argv[1:]
    name = args[0]
    def opt(k, d):
        return args[args.index(k) + 1] if k in args else d
    actions = opt('--actions', ','.join(ACTIONS)).split(',')
    # --cuts 는 줄마다 다를 수 있다 (예: idle 4 / crouch 3 / jump 3 -> "4,3,3").
    # 하나만 주면 모든 줄에 같은 값을 쓴다
    cut_list = [int(v) for v in opt('--cuts', '3').split(',')]
    if len(cut_list) == 1:
        cut_list = cut_list * len(actions)
    tag = opt('--tag', '')
    src = f'{DIR}/{name}{("_" + tag) if tag else ""}_src.png'
    a = strip_checker(np.array(Image.open(src).convert('RGBA')))
    solid = a[:, :, 3] > 24
    lab, n = nd.label(solid)
    sz = nd.sum(solid, lab, range(1, n + 1))
    H = a.shape[0]
    rows = [[] for _ in actions]
    for k in range(1, n + 1):
        if sz[k - 1] < MIN_ISLAND:
            continue
        ys, xs = np.where(lab == k)
        cy = (ys.min() + ys.max()) / 2
        rows[min(len(actions) - 1, int(cy * len(actions) // H))].append(
            (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    for r in rows:
        r.sort(key=lambda b: b[0])

    for act, boxes, cuts in zip(actions, rows, cut_list):
        if len(boxes) != cuts:
            print(f'  ** {act}: 칸이 {len(boxes)}개다 ({cuts}이어야 한다). 줄이 섞였을 수 있다')
        if not boxes:
            continue
        hgt = max(y1 - y0 for _, y0, _, y1 in boxes) + PAD * 2
        wid = sum(x1 - x0 for x0, _, x1, _ in boxes) + PAD * (len(boxes) + 1)
        out = np.zeros((hgt, wid, 4), np.uint8)
        x = PAD
        for x0, y0, x1, y1 in boxes:
            h, w = y1 - y0, x1 - x0
            cell = np.dstack([a[y0:y1, x0:x1, :3],
                              (solid[y0:y1, x0:x1] * 255).astype(np.uint8)])
            out[(hgt - h) // 2:(hgt - h) // 2 + h, x:x + w] = cell
            x += w + PAD
        dst = f'{DIR}/{name}{act}_v7_raw.png'
        Image.fromarray(out, 'RGBA').save(dst)
        print(f'  {act}: {len(boxes)}칸 -> {dst}')


if __name__ == '__main__':
    main()
