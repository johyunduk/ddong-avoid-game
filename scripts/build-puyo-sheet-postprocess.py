r"""뿌요 시트 — **격자 스냅 + 외곽선 후처리**.

생성물(부드러운 벡터 곡선)을 이 저장소의 화풍(하드 엣지 · 평탄한 면 · 두른 외곽선)으로
바꾼다. `creative/_fx/heidi-puyo/frames/` 의 낱장을 읽어 동작별 128x128 시트를 굽는다.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/build-puyo-sheet.py

## 왜 이 네 단계인가

기존 에셋(참새·태이)과 나란히 놓고 재 보면 **지표로는 안 갈린다** — 뿌요가 오히려
반투명 비율이 낮고 색 수도 적다. 갈리는 건 **구조**다:

| | 참새·태이 | 생성물 뿌요 |
|---|---|---|
| 실루엣 | 알파가 0/255 로 딱 끊긴다 | 2~3px 반투명 띠 |
| 면 | 평탄한 색 덩어리 | 부드러운 경사 |
| 형태 | **어두운 선**이 형태를 잡는다 | 선이 없다 (음영만) |

그래서 네 단계다.

1. **알파 경화** — 실루엣을 0/255 로 끊는다. 확대했을 때 보이는 계단은 여기서 나온다
2. **팔레트 양자화** — 경사를 평탄한 면으로 끊는다. **전 프레임 공용 팔레트**를 쓴다
   (프레임마다 따로 뽑으면 색이 프레임 간에 어른거린다).
   RGB 균등 포스터라이즈는 쓰지 않는다 — 흰 개에 걸면 채널이 따로 끊겨 분홍으로 틀어진다
3. **면 경계선** — 양자화된 **면이 바뀌는 자리**에 한 칸 어두운 선. 명도 경사로 뽑으면
   털 노이즈를 타는데, 팔레트 경계는 이미 평탄해서 깨끗하다
4. **외곽선** — 실루엣 바깥에 한 칸. 참새·태이가 형태를 잡는 방식이다

`--no-*` 로 각 단계를 끌 수 있다. 검수 이미지는 `--check` 로 낸다.
"""
import argparse
import glob
import json
import os
import re

import numpy as np
from PIL import Image
from scipy import ndimage as nd

SRC_DIR = 'creative/_fx/heidi-puyo/frames'
OUT_DIR = 'creative/_fx/heidi-puyo/pixel'
ACTIONS = ['walk', 'idle', 'crouch', 'jump', 'spin']
FRAME = 128
BASELINE = 124          # 바닥선 — composer 가 낱장을 이 기준으로 하단 정렬해 뒀다
ALPHA_CUT = 128
PALETTE_N = 18
LINE_THRESH = 26        # 면 경계로 볼 색차
LINE_DARKEN = 0.72
OUTLINE_RGB = (58, 46, 42)

REF_SPARROW = 'public/assets/fx/sheets/sparrow_cap_128x128.png'


def load_frames():
    """동작별 낱장. 파일명 `puyo_<동작>_<번호>.png` 순서 그대로."""
    out = {}
    for act in ACTIONS:
        fs = sorted(glob.glob(f'{SRC_DIR}/puyo_{act}_*.png'),
                    key=lambda p: int(re.search(r'_(\d+)\.png$', p).group(1)))
        out[act] = [np.array(Image.open(f).convert('RGBA')) for f in fs]
    return out


def harden(a, cut=ALPHA_CUT):
    out = a.copy()
    out[:, :, 3] = np.where(out[:, :, 3] >= cut, 255, 0)
    out[out[:, :, 3] == 0, :3] = 0
    return out


def build_palette(frames, n, unique=True):
    """**전 프레임 공용** 팔레트. 프레임마다 뽑으면 색이 프레임 간에 어른거린다.

    `unique=True` 면 **고유색**으로 뽑는다. 개가 거의 흰색이라 픽셀 수로 뽑으면
    18칸 중 10칸이 서로 구별도 안 되는 흰색에 몰리고, 정작 음영·귀·눈에 쓸 칸이 없다.
    """
    pix = [a[a[:, :, 3] > 0][:, :3] for a in frames]
    pix = np.concatenate([p for p in pix if p.size], axis=0)
    if unique:
        pix = np.unique(pix.reshape(-1, 3), axis=0)
    side = int(np.ceil(np.sqrt(len(pix))))
    pad = np.zeros((side * side - len(pix), 3), np.uint8)
    strip = np.concatenate([pix, pad], axis=0).reshape(side, side, 3)
    pal_im = Image.fromarray(strip, 'RGB').quantize(
        colors=n, method=Image.MEDIANCUT, dither=Image.NONE)
    pal = np.array(pal_im.getpalette()[:n * 3], np.int16).reshape(n, 3)
    return pal


def apply_palette(a, pal):
    """가장 가까운 팔레트 색으로 바꾼다. 인덱스도 같이 돌려준다 (면 경계용)."""
    m = a[:, :, 3] > 0
    out = a.copy()
    idx = np.zeros(m.shape, np.int16)
    if not m.any():
        return out, idx
    # **int32 여야 한다.** int16 으로 제곱하면 색차 200 이 40000 이 되어 넘친다 —
    # 넘친 값이 최솟값으로 잡혀 흰 개가 갈색으로 칠해졌다
    px = a[m][:, :3].astype(np.int32)
    d = ((px[:, None, :] - pal[None, :, :].astype(np.int32)) ** 2).sum(axis=2)
    k = d.argmin(axis=1)
    out[m, :3] = pal[k].astype(np.uint8)
    idx[m] = k
    return out, idx


def region_lines(a, idx, thresh=LINE_THRESH, darken=LINE_DARKEN):
    m = a[:, :, 3] > 0
    rgb = a[:, :, :3].astype(np.int16)
    edge = np.zeros(m.shape, bool)
    for sl0, sl1 in ((np.s_[:, 1:], np.s_[:, :-1]), (np.s_[1:, :], np.s_[:-1, :])):
        diff = (idx[sl0] != idx[sl1]) & (np.abs(rgb[sl0] - rgb[sl1]).max(axis=2) >= thresh)
        e = np.zeros(m.shape, bool)
        e[sl0] = diff
        edge |= e & m
    edge &= nd.binary_erosion(m, np.ones((3, 3)))     # 실루엣 가장자리는 외곽선 몫이다
    out = a.copy()
    out[edge, :3] = np.clip(rgb[edge] * darken, 0, 255).astype(np.uint8)
    return out


def outline(a, color=OUTLINE_RGB):
    m = a[:, :, 3] > 0
    ring = nd.binary_dilation(m, np.ones((3, 3))) & ~m
    out = a.copy()
    out[ring, :3] = color
    out[ring, 3] = 255
    return out


def place(a):
    """128x128 칸에 놓는다 — 가로 중앙, 세로는 바닥선 정렬 (걷다 웅크려도 발이 안 뜬다)."""
    m = a[:, :, 3] > 0
    ys, xs = np.where(m)
    body = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    cell = np.zeros((FRAME, FRAME, 4), np.uint8)
    x0 = (FRAME - body.shape[1]) // 2
    y0 = BASELINE - body.shape[0]
    x0 = max(0, min(x0, FRAME - body.shape[1]))
    y0 = max(0, min(y0, FRAME - body.shape[0]))
    cell[y0:y0 + body.shape[0], x0:x0 + body.shape[1]] = body
    return cell


def step_stats(a):
    """이웃 색차 — '계단인가 경사인가'. 참새와 나란히 비교하는 수치."""
    rgb = a[:, :, :3].astype(np.int16)
    m = a[:, :, 3] > 200
    d = []
    for sl0, sl1 in ((np.s_[:, 1:], np.s_[:, :-1]), (np.s_[1:, :], np.s_[:-1, :])):
        mm = m[sl0] & m[sl1]
        d.append(np.abs(rgb[sl0] - rgb[sl1]).max(axis=2)[mm])
    d = np.concatenate(d)
    if d.size == 0:
        return 0.0, 0.0
    return float((d >= 24).mean()), float((d <= 3).mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--palette', type=int, default=PALETTE_N)
    ap.add_argument('--no-quant', action='store_true')
    ap.add_argument('--no-lines', action='store_true')
    ap.add_argument('--no-outline', action='store_true')
    ap.add_argument('--check', action='store_true', help='검수 이미지도 낸다')
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    raw = load_frames()
    hardened = {k: [harden(a) for a in v] for k, v in raw.items()}
    allf = [a for v in hardened.values() for a in v]
    pal = None if args.no_quant else build_palette(allf, args.palette)
    if pal is not None:
        print(f'공용 팔레트 {len(pal)}색 (전 {len(allf)}프레임에서 한 번에 뽑는다)')

    meta = {}
    done = {}
    for act in ACTIONS:
        cells = []
        for a in hardened[act]:
            if pal is not None:
                a, idx = apply_palette(a, pal)
                if not args.no_lines:
                    a = region_lines(a, idx)
            if not args.no_outline:
                a = outline(a)
            cells.append(place(a))
        if not cells:
            print(f'  {act}: 낱장 없음 — 건너뜀')
            continue
        strip = np.concatenate(cells, axis=1)
        path = f'{OUT_DIR}/puyo_{act}_{FRAME}x{FRAME}.png'
        Image.fromarray(strip, 'RGBA').save(path)
        hard, flat = step_stats(cells[0])
        meta[act] = {'frames': len(cells), 'file': os.path.basename(path)}
        done[act] = cells
        print(f'  {act:7s} {len(cells)}프레임 → {strip.shape[1]}x{strip.shape[0]} '
              f'· 큰계단 {hard * 100:.1f}% · 평탄 {flat * 100:.1f}% '
              f'· {strip.shape[1] * strip.shape[0] * 4 / 1048576:.2f}MB')

    sp = np.array(Image.open(REF_SPARROW).convert('RGBA').crop((0, 0, 128, 128)))
    h, f = step_stats(sp)
    print(f'  (참새 기준: 큰계단 {h * 100:.1f}% · 평탄 {f * 100:.1f}%)')

    with open(f'{OUT_DIR}/_meta.json', 'w', encoding='utf-8') as fp:
        json.dump(meta, fp, ensure_ascii=False, indent=1)

    if args.check:
        make_check(done, sp)


def make_check(done, sp):
    """확대 비교 — 참새와 나란히. **숫자가 아니라 이걸 보고 판단한다.**"""
    def trim(a):
        ys, xs = np.where(a[:, :, 3] > 8)
        return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

    cells = [('참새 (기준)', trim(sp))]
    for act in ACTIONS:
        if act in done:
            cells.append((f'뿌요 {act} f1', trim(done[act][0])))
    Z = 7
    CW = max(c[1].shape[1] for c in cells) + 4
    CH = max(c[1].shape[0] for c in cells) + 4
    sheet = Image.new('RGBA', (len(cells) * CW * Z, CH * Z + 130), (36, 34, 40, 255))
    for i, (_, arr) in enumerate(cells):
        im = Image.fromarray(arr, 'RGBA').resize((arr.shape[1] * Z, arr.shape[0] * Z), Image.NEAREST)
        sheet.alpha_composite(im, (i * CW * Z + (CW * Z - im.width) // 2, (CH * Z - im.height) // 2))
        k = 56 / arr.shape[0]
        s = Image.fromarray(arr, 'RGBA').resize(
            (max(1, round(arr.shape[1] * k)), 56), Image.LANCZOS)
        s = s.resize((s.width * 2, s.height * 2), Image.NEAREST)
        sheet.alpha_composite(s, (i * CW * Z + (CW * Z - s.width) // 2, CH * Z + 8))
    out = 'creative/_fx/heidi-puyo/_검수_후처리_참새대조.png'
    sheet.convert('RGB').save(out)
    print(f'saved {out}  (윗줄 7배 확대 · 아랫줄 실제 표시 크기 56px)')

    # 전 프레임 시간순 — 밝은 배경·어두운 배경 둘 다 (밝은 데서 묻히는지 본다)
    for bg, tag in (((34, 32, 38), '어두운배경'), ((196, 192, 186), '밝은배경')):
        rows = [(act, done[act]) for act in ACTIONS if act in done]
        ncol = max(len(v) for _, v in rows)
        Z2 = 3
        W = ncol * FRAME * Z2
        H = len(rows) * FRAME * Z2
        im = Image.new('RGBA', (W, H), (*bg, 255))
        for r, (_, cs) in enumerate(rows):
            for c, cell in enumerate(cs):
                one = Image.fromarray(cell, 'RGBA').resize(
                    (FRAME * Z2, FRAME * Z2), Image.NEAREST)
                im.alpha_composite(one, (c * FRAME * Z2, r * FRAME * Z2))
        o = f'creative/_fx/heidi-puyo/_검수_후처리_시간순_{tag}.png'
        im.convert('RGB').save(o)
        print(f'saved {o}  (행 = {", ".join(a for a, _ in rows)})')


if __name__ == '__main__':
    main()
