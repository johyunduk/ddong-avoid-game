r"""뿌요 — 생성 스트립을 **네이티브 픽셀 스프라이트**로 굽는다.

ChatGPT 가 낸 스트립(블록 크기는 일정하지만 격자 위상이 흘러가는 고해상도 그림)을
진짜 픽셀 스프라이트로 스냅한다. 결과는 **반투명 0픽셀 · 팔레트 7색**이다.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/snap-puyo-frames.py --action walk --check

## 왜 스냅이 필요한가

생성물은 "블록 크기가 일정한 고해상도 그림"이지 정수배 확대본이 아니다.
실측(`walk_v2_raw.png`): 강한 색경계 간격 최빈 **6px**, 그런데 경계 위상은
최빈 18.3%(균등 16.7%)로 거의 흘러간다. 그래서 그대로 줄이면 안티에일리어싱이 생긴다.

## 네 단계

1. **섬 찾기** — 프레임이 서로 안 닿게 생성했으므로 연결 성분이 곧 프레임이다.
   위/아래 행으로 나눈 뒤 x 순으로 정렬한다
2. **격자 재샘플** — 칸마다 **중앙값(median)**. 평균이 아니다 —
   평균은 경계에서 중간색을 만들어 팔레트를 넓힌다.
   칸 커버리지가 0.5 미만이면 투명 → 알파도 하드하게 끊긴다
3. **팔레트 스냅** — 7색 고정. 색이 프레임 간에 어른거리지 않는다
4. **외곽선 복원** — 스냅의 유일한 손실이 외곽선이다. 실루엣 **안쪽** 한 칸을
   외곽선 색으로 채운다 (바깥에 두르면 스프라이트가 한 칸 커진다).
   실측: 스냅 직후 테두리 323칸 중 214칸만 어둡다 — 나머지 109칸을 메우면
   테두리 평균 명도가 90 → 42 로 내려가 참새(38.8)와 같은 대비가 된다

## 프레임 크기가 64인 이유

**픽셀아트는 화면 배율이 정수여야 안 뭉개진다.** 네이티브 48px 짜리를 128 칸에 넣고
0.25배로 줄이면 다시 뭉개진다. 64 칸에 넣고 **배율 1.0 + NEAREST** 로 그린다
(`registerFxSheet` 의 `nearest` 플래그가 이미 있다).
덤으로 VRAM 이 1/4 이다 — 128 프레임 24장 1.00MB → 64 프레임 24장 **0.25MB**.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage as nd

SRC_DIR = 'creative/_fx/heidi-puyo'
OUT_DIR = 'creative/_fx/heidi-puyo/pixel64'
# 프레임은 **모델이 실제로 그린 네이티브**를 담을 만큼 잡는다. 좁게 잡고 줄이면
# 코·눈처럼 몇 픽셀짜리 디테일이 가장 먼저 죽는다 (48 로 줄였다가 얼굴이 지워졌다).
FRAME_W, FRAME_H = 80, 72
NATIVE_H = 60          # 스프라이트 네이티브 높이
BASELINE = 68          # 프레임 안 바닥선 — 동작이 바뀌어도 발이 안 뜬다
BG_TOL = 30
MIN_ISLAND = 4000

# composer 가 1차본에서 8색 양자화로 뽑은 것 (같은 개, 같은 색)
PALETTE = np.array([
    (0xf4, 0xe9, 0xda),   # 하이라이트 흰색
    (0xef, 0xe1, 0xd1),   # 몸통 흰색
    (0xe8, 0xd6, 0xc1),   # 연한 베이지
    (0xcf, 0xb8, 0x9f),   # 귀·발끝 베이지
    (0x9a, 0x7e, 0x66),   # 중간 그림자
    (0x6a, 0x57, 0x45),   # 진한 그림자
    (0x3a, 0x24, 0x20),   # 외곽선
], np.int32)
OUTLINE_I = 6

REF_SPARROW = 'public/assets/fx/sheets/sparrow_cap_128x128.png'


def find_islands(fg, h):
    """프레임 = 연결 성분. 위/아래 행으로 가른 뒤 x 순으로 읽는다."""
    lab, n = nd.label(fg)
    sizes = nd.sum(fg, lab, range(1, n + 1))
    boxes = []
    for k in range(1, n + 1):
        if sizes[k - 1] < MIN_ISLAND:
            continue
        ys, xs = np.where(lab == k)
        boxes.append((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    boxes.sort(key=lambda b: (0 if (b[1] + b[3]) / 2 < h / 2 else 1, b[0]))
    return boxes


def snap(rgb, fg, box, native_h):
    """칸마다 중앙값 → 팔레트 최근접. 커버리지 0.5 미만은 투명."""
    x0, y0, x1, y1 = box
    sub = rgb[y0:y1, x0:x1]
    sm = fg[y0:y1, x0:x1]
    h, w = sm.shape
    tw = max(1, round(w * native_h / h))
    out = np.zeros((native_h, tw, 4), np.uint8)
    for j in range(native_h):
        ya, yb = int(j * h / native_h), max(int(j * h / native_h) + 1, int((j + 1) * h / native_h))
        for i in range(tw):
            xa, xb = int(i * w / tw), max(int(i * w / tw) + 1, int((i + 1) * w / tw))
            cell = sm[ya:yb, xa:xb]
            if cell.mean() < 0.5:
                continue
            px = sub[ya:yb, xa:xb][cell]
            if px.size == 0:
                continue
            med = np.median(px, axis=0).astype(np.int32)
            k = int(((PALETTE - med) ** 2).sum(axis=1).argmin())
            out[j, i, :3] = PALETTE[k]
            out[j, i, 3] = 255
    return out


def restore_outline(cell):
    """실루엣 **안쪽** 한 칸을 외곽선 색으로. 스냅이 잡아먹은 선을 되돌린다."""
    m = cell[:, :, 3] > 0
    rim = m & ~nd.binary_erosion(m, np.ones((3, 3)))
    out = cell.copy()
    out[rim, :3] = PALETTE[OUTLINE_I]
    return out, int(rim.sum())


def place(cell):
    m = cell[:, :, 3] > 0
    ys, xs = np.where(m)
    body = cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    out = np.zeros((FRAME_H, FRAME_W, 4), np.uint8)
    x0 = max(0, min((FRAME_W - body.shape[1]) // 2, FRAME_W - body.shape[1]))
    y0 = max(0, min(BASELINE - body.shape[0], FRAME_H - body.shape[0]))
    out[y0:y0 + body.shape[0], x0:x0 + body.shape[1]] = body
    return out


def luminance(a, mask):
    return float((a[:, :, :3].astype(float) * [0.299, 0.587, 0.114]).sum(axis=2)[mask].mean())


def main():
    global FRAME_W, FRAME_H
    ap = argparse.ArgumentParser()
    ap.add_argument('--action', required=True, help='walk / idle / crouch / jump / spin')
    ap.add_argument('--raw', default=None, help='기본: <action>_v2_raw.png')
    ap.add_argument('--native', type=int, default=NATIVE_H)
    ap.add_argument('--frame', default=f'{FRAME_W}x{FRAME_H}', help='예: 80x72')
    ap.add_argument('--no-outline', action='store_true')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    FRAME_W, FRAME_H = (int(v) for v in args.frame.split('x'))

    raw = args.raw or f'{SRC_DIR}/{args.action}_v2_raw.png'
    rgb = np.array(Image.open(raw).convert('RGB')).astype(np.int16)
    h, w, _ = rgb.shape
    bg = np.median(np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]), axis=0)
    fg = nd.binary_closing(np.abs(rgb - bg).max(axis=2) > BG_TOL, np.ones((3, 3)))
    boxes = find_islands(fg, h)
    print(f'{raw} {w}x{h} · 배경 {bg.astype(int)} · 프레임 {len(boxes)}개')

    cells, rims = [], 0
    for b in boxes:
        c = snap(rgb, fg, b, args.native)
        if not args.no_outline:
            c, r = restore_outline(c)
            rims += r
        cells.append(place(c))

    os.makedirs(OUT_DIR, exist_ok=True)
    strip = np.concatenate(cells, axis=1)
    path = f'{OUT_DIR}/puyo_{args.action}_{FRAME_W}x{FRAME_H}.png'
    Image.fromarray(strip, 'RGBA').save(path)

    m = strip[:, :, 3] > 0
    semi = int(((strip[:, :, 3] > 0) & (strip[:, :, 3] < 255)).sum())
    colors = len(np.unique(strip[m][:, :3], axis=0))
    rim_all = m & ~nd.binary_erosion(m, np.ones((3, 3)))
    print(f'  → {path}')
    print(f'  {len(cells)}프레임 · {strip.shape[1]}x{strip.shape[0]} · 색 {colors}개 · '
          f'반투명 {semi}픽셀 · {strip.shape[1] * strip.shape[0] * 4 / 1048576:.3f}MB')
    print(f'  테두리 평균 명도 {luminance(strip, rim_all):.1f} / 몸 평균 {luminance(strip, m):.1f}')

    sp = np.array(Image.open(REF_SPARROW).convert('RGBA').crop((0, 0, 128, 128)))
    sm = sp[:, :, 3] > 128
    srim = sm & ~nd.binary_erosion(sm, np.ones((3, 3)))
    print(f'  (참새 기준: 테두리 {luminance(sp, srim):.1f} / 몸 {luminance(sp, sm):.1f})')

    meta_path = f'{OUT_DIR}/_meta.json'
    meta = json.load(open(meta_path, encoding='utf-8')) if os.path.exists(meta_path) else {}
    meta[args.action] = {'frames': len(cells), 'frame': [FRAME_W, FRAME_H], 'native': args.native}
    json.dump(meta, open(meta_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    if args.check:
        check(args.action, cells, sp)


def check(action, cells, sp):
    def trim(a):
        ys, xs = np.where(a[:, :, 3] > 8)
        return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

    items = [('참새 (기준)', trim(sp))] + [(f'f{i + 1}', trim(c)) for i, c in enumerate(cells)]
    Z = 8
    CW = max(x.shape[1] for _, x in items) + 3
    CH = max(x.shape[0] for _, x in items) + 3
    out = Image.new('RGBA', (len(items) * CW * Z, CH * Z + 150), (36, 34, 40, 255))
    for i, (_, arr) in enumerate(items):
        im = Image.fromarray(arr, 'RGBA').resize((arr.shape[1] * Z, arr.shape[0] * Z), Image.NEAREST)
        out.alpha_composite(im, (i * CW * Z + (CW * Z - im.width) // 2, (CH * Z - im.height) // 2))
        s = Image.fromarray(arr, 'RGBA')      # 실제 표시 = 1:1, 보기 좋게 2배
        s = s.resize((s.width * 2, s.height * 2), Image.NEAREST)
        out.alpha_composite(s, (i * CW * Z + (CW * Z - s.width) // 2, CH * Z + 12))
    p = f'{SRC_DIR}/_검수_v2_{action}_참새대조.png'
    out.convert('RGB').save(p)
    print(f'  saved {p} (윗줄 8배 확대 · 아랫줄 실제 크기 2배)')

    for bgc, tag in (((34, 32, 38), '어두운배경'), ((196, 192, 186), '밝은배경')):
        row = Image.new('RGBA', (len(cells) * FRAME_W * 4, FRAME_H * 4), (*bgc, 255))
        for i, c in enumerate(cells):
            one = Image.fromarray(c, 'RGBA').resize((FRAME_W * 4, FRAME_H * 4), Image.NEAREST)
            row.alpha_composite(one, (i * FRAME_W * 4, 0))
        q = f'{SRC_DIR}/_검수_v2_{action}_시간순_{tag}.png'
        row.convert('RGB').save(q)
        print(f'  saved {q}')


if __name__ == '__main__':
    main()
