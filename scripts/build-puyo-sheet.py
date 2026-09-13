r"""뿌요 시트 조립 — 생성 스트립 → 게임 시트.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/build-puyo-sheet.py --action walk --check

## 격자 스냅을 **쓰지 않는다** (세 번 실패하고 알아낸 것)

`scripts/snap-puyo-frames.py` 로 네이티브 격자에 스냅해 봤다. 결과는 "진짜 픽셀
스프라이트"(반투명 0 · 7색)였지만 **코·눈·볼터치가 지워졌다.** 강아지 얼굴에서
제일 중요한 것이 제일 작고 어두운 점이라 칸 축약에서 주변 흰 털에 먹힌다.
네이티브를 48 → 60 → 72 로 올리고 축약기를 중앙값 → 어두운우선 으로 바꿔도
코와 눈 하이라이트는 안 살아났다.

**정작 기준으로 삼던 참새가 네이티브 픽셀 스프라이트가 아니다.**

| | 색 수 | 반투명 비율 |
|---|---|---|
| 참새 (기존 에셋) | 4443 | 15.6% |
| 격자 스냅본 | 7 | 0% |
| **그냥 축소 (채택)** | **약 2800** | **약 26%** |

참새는 고해상도 그림을 줄인 것이고, 픽셀아트로 읽히는 이유는 네이티브 격자가 아니라
**하드 엣지 + 어두운 외곽선**이다. 뿌요도 같은 방식으로 간다 — 생성물을 그냥 줄이고
얼굴은 그대로 남긴다. 스냅 스크립트는 지우지 않았다 (비교 근거이자 다른 에셋에 쓸 수 있다).

## 단계

1. **섬 찾기** — 프레임이 서로 안 닿게 생성했으므로 연결 성분이 곧 프레임이다
2. **배경** — 원본에 **알파 채널이 있으면 그걸 그대로 쓴다.** 색으로 오려낼 일이 없으니
   눈·코가 지워질 수가 없다 (생성 단계에서 투명 배경으로 받는 것이 가장 안전하다).
   알파가 없으면 **테두리에서 시작하는 flood fill** 로 떼어낸다. 색 거리로 전역 판정하면
   배경과 비슷하게 어두운 픽셀을 그림 한가운데서도 지운다 — 어두운 배경에 그리면
   **눈·코·외곽선이 통째로 날아간다** (실측: 한 장에서 17,318픽셀, 지워진 색 1~3위가
   (24,0,0)·(0,0,0)·(24,24,24)). 바깥에 연결된 배경 덩어리만 지운다.
   알파만 건드리고 불투명 픽셀의 RGB 는 그대로 둔다
3. **축소** — 프리멀티플라이 후 LANCZOS. 안 하면 투명한 쪽 색이 섞여 테두리가 탁해진다
4. **프레임 배치** — 가로 중앙, 세로는 바닥선 정렬 (동작이 바뀌어도 발이 안 뜬다)
"""
import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage as nd

SRC_DIR = 'creative/_fx/heidi-puyo'
OUT_DIR = 'creative/_fx/heidi-puyo/sheet'
ORIGINAL = r'C:/Users/user/OneDrive/바탕 화면/똥/뿌요.jpg'
FRAME = 128
BASELINE = 118         # 프레임 안 바닥선
BODY_H = 84            # 몸통 높이(px). 참새 몸통(97x75)과 같은 밀도
BG_TOL = 30
MIN_ISLAND = 4000
HOLE_RING = 10        # 구멍 둘레에서 함께 지울 외곽선 두께(원본 px)
REF_SPARROW = 'public/assets/fx/sheets/sparrow_cap_128x128.png'


def background_mask(rgb, tol=None):
    """**테두리에 연결된** 배경만 지운다.

    전역 색 임계(`|rgb-bg| > tol`)로 하면 배경과 비슷하게 어두운 픽셀을 그림 한가운데서도
    지운다. 눈·코·외곽선이 바로 그 색이라 얼굴이 뚫린다. 그래서 배경 후보 중
    **화면 테두리에 닿은 연결 성분만** 배경으로 본다.
    """
    tol = BG_TOL if tol is None else tol
    bg = np.median(np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]), axis=0)
    near = np.abs(rgb.astype(np.int16) - bg).max(axis=2) <= tol
    lab, _ = nd.label(near)
    edge = set(lab[0].tolist()) | set(lab[-1].tolist())
    edge |= set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
    edge.discard(0)
    outside = np.isin(lab, list(edge))
    fg = nd.binary_closing(~outside, np.ones((3, 3)))
    # 몸 안에 갇힌 배경색 구멍은 채운다 (입 속 같은 곳이 뚫리지 않게)
    return nd.binary_fill_holes(fg), bg


def fill_rgb_holes(rgb, solid, fg):
    """구멍을 마스크로만 메우면 **그 안의 RGB 는 검은색 그대로**라 몸통에 검은 얼룩이 남는다.

    생성물에 몸 한가운데가 투명하게 뚫려 나오는 일이 있다 (실측: 벽짚기 원본에서
    5,641px / 5,507px 두 덩어리). 마스크를 채운 자리는 **가장 가까운 불투명 픽셀의
    색**으로 메운다 — 주변이 흰 털이라 평평하게 이어진다.
    """
    holes = fg & ~solid
    if not holes.any():
        return rgb
    # 구멍은 대개 **외곽선에 둘러싸여** 있다. 그냥 최근접 불투명 픽셀을 쓰면
    # 그 외곽선 색(거의 검정)이 번져 몸통에 갈색 얼룩이 생긴다.
    # 외곽선을 뺀 **밝은 살/털 픽셀**에서만 색을 끌어온다.
    # 구멍만 메우면 그것을 두르고 있던 **외곽선 고리**가 남는다. 선이 아니라 닫힌
    # 고리라서 128px 로 줄이면 통째로 검은 얼룩이 된다. 고리까지 같이 지운다.
    ring = nd.binary_dilation(holes, np.ones((3, 3)), iterations=HOLE_RING)
    holes = holes | (ring & (rgb.max(axis=2) < 110))
    donor = solid & (rgb.max(axis=2) >= 110)
    if not donor.any():
        donor = solid
    _, idx = nd.distance_transform_edt(~donor, return_indices=True)
    out = rgb.copy()
    out[holes] = rgb[idx[0][holes], idx[1][holes]]
    return out


def foreground(path):
    """원본에서 그림만 떼어낸다. 알파가 있으면 그대로, 없으면 테두리 flood fill."""
    im = Image.open(path)
    if im.mode in ('RGBA', 'LA') or 'transparency' in im.info:
        a = np.array(im.convert('RGBA'))
        if (a[:, :, 3] == 0).any():
            solid = a[:, :, 3] > 24
            fg = nd.binary_fill_holes(nd.binary_closing(solid, np.ones((3, 3))))
            return fill_rgb_holes(a[:, :, :3], solid, fg), fg, None
    rgb = np.array(im.convert('RGB'))
    fg, bg = background_mask(rgb)
    return rgb, fg, bg


def islands(fg, h):
    lab, n = nd.label(fg)
    sizes = nd.sum(fg, lab, range(1, n + 1))
    out = []
    for k in range(1, n + 1):
        if sizes[k - 1] < MIN_ISLAND:
            continue
        ys, xs = np.where(lab == k)
        out.append((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    out.sort(key=lambda b: (0 if (b[1] + b[3]) / 2 < h / 2 else 1, b[0]))
    return out


def shrink(rgba, h):
    """프리멀티플라이 후 축소 — 안 하면 투명한 쪽 색이 섞여 테두리가 어두워진다."""
    a = rgba.astype(np.float64)
    al = a[:, :, 3:4] / 255.0
    a[:, :, :3] *= al
    w = max(1, round(rgba.shape[1] * h / rgba.shape[0]))
    p = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA').resize((w, h), Image.LANCZOS)
    o = np.array(p).astype(np.float64)
    a2 = o[:, :, 3:4] / 255.0
    o[:, :, :3] = np.where(a2 > 0, o[:, :, :3] / np.maximum(a2, 1e-6), 0)
    return np.clip(o, 0, 255).astype(np.uint8)


def place(cell):
    ys, xs = np.where(cell[:, :, 3] > 8)
    body = cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    out = np.zeros((FRAME, FRAME, 4), np.uint8)
    x0 = max(0, min((FRAME - body.shape[1]) // 2, FRAME - body.shape[1]))
    y0 = max(0, min(BASELINE - body.shape[0], FRAME - body.shape[0]))
    out[y0:y0 + body.shape[0], x0:x0 + body.shape[1]] = body
    return out


def stats(a):
    m = a[:, :, 3] > 8
    semi = ((a[:, :, 3] > 0) & (a[:, :, 3] < 255)).sum() / max(1, m.sum()) * 100
    return len(np.unique(a[m][:, :3], axis=0)), semi


def trim(a):
    ys, xs = np.where(a[:, :, 3] > 8)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--action', required=True)
    ap.add_argument('--raw', default=None, help='기본: <action>_v7_raw.png')
    ap.add_argument('--body', type=int, default=BODY_H, help='몸통 높이(px)')
    ap.add_argument('--flip', action='store_true',
                    help='좌우 반전. **모든 시트의 기본 방향은 왼쪽**이어야 한다 — '
                         '코드가 `setFlipX(진행 방향)` 으로 뒤집기 때문에 '
                         '오른쪽을 보고 생성된 시트는 여기서 한 번 뒤집어 맞춘다')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    raw = args.raw or f'{SRC_DIR}/{args.action}_v7_raw.png'
    rgb, fg, bg = foreground(raw)
    h, w, _ = rgb.shape
    boxes = islands(fg, h)
    src = '알파 채널' if bg is None else f'테두리 flood (배경 {bg.astype(int)})'
    print(f'{raw} {w}x{h} · {src} · 프레임 {len(boxes)}개')

    # 웅크리기처럼 **세로보다 가로가 긴** 자세는 높이만 맞추면 칸을 넘는다.
    # 칸 안에 들어가도록 한 번 더 줄이되, **전 프레임에 같은 배율**을 써야
    # 동작 사이에서 개 크기가 널뛰지 않는다
    crops = []
    for x0, y0, x1, y1 in boxes:
        crops.append(np.dstack([rgb[y0:y1, x0:x1], (fg[y0:y1, x0:x1] * 255).astype(np.uint8)]))
    widest = max(c.shape[1] / c.shape[0] for c in crops)
    limit = FRAME - 6
    body_h = args.body
    if widest * body_h > limit:
        body_h = int(limit / widest)
        print(f'  가로가 긴 자세가 있어 몸통 높이를 {args.body} → {body_h} 로 줄였다 '
              f'(칸 {FRAME} 안에 넣기 위해)')
    cells = [place(shrink(c, body_h)) for c in crops]
    if args.flip:
        cells = [c[:, ::-1] for c in cells]
        print('  좌우 반전 — 기본 방향을 왼쪽으로 맞췄다')

    os.makedirs(OUT_DIR, exist_ok=True)
    strip = np.concatenate(cells, axis=1)
    path = f'{OUT_DIR}/puyo_{args.action}_{FRAME}x{FRAME}.png'
    Image.fromarray(strip, 'RGBA').save(path)
    c, s = stats(strip)
    print(f'  → {path}')
    print(f'  {len(cells)}프레임 · {strip.shape[1]}x{strip.shape[0]} · 색 {c} · 반투명 {s:.1f}% · '
          f'{strip.shape[1] * strip.shape[0] * 4 / 1048576:.3f}MB')
    sp = np.array(Image.open(REF_SPARROW).convert('RGBA').crop((0, 0, 128, 128)))
    sc, ss = stats(sp)
    print(f'  (참새 기준: 색 {sc} · 반투명 {ss:.1f}%)')

    mp = f'{OUT_DIR}/_meta.json'
    meta = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {}
    meta[args.action] = {'frames': len(cells), 'frame': FRAME, 'body': body_h}
    json.dump(meta, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    if args.check:
        check(args.action, cells, sp)


def check(action, cells, sp):
    """**숫자가 아니라 이 그림으로 판단한다.** 참새와도, 원본 뿌요와도 나란히 놓는다."""
    orig = Image.open(ORIGINAL).convert('RGBA').crop((40, 90, 760, 900))
    TH = 300
    row = [('원본 뿌요', orig.resize((round(orig.width * TH / orig.height), TH), Image.LANCZOS))]
    for name, arr in [('참새', trim(sp))] + [(f'f{i + 1}', trim(c)) for i, c in enumerate(cells)]:
        im = Image.fromarray(arr, 'RGBA')
        row.append((name, im.resize((round(im.width * TH / im.height), TH), Image.NEAREST)))

    W = sum(i.width for _, i in row) + 16 * len(row) + 10
    out = Image.new('RGBA', (W, TH + 130), (36, 34, 40, 255))
    x = 10
    small = {n: a for n, a in [('참새', trim(sp))] + [(f'f{i + 1}', trim(c))
                               for i, c in enumerate(cells)]}
    for n, im in row:
        out.alpha_composite(im, (x, 10))
        if n in small:
            s = Image.fromarray(small[n], 'RGBA')
            s = s.resize((s.width * 2, s.height * 2), Image.NEAREST)
            out.alpha_composite(s, (x + (im.width - s.width) // 2, TH + 18))
        x += im.width + 16
    p = f'{SRC_DIR}/_검수_{action}_원본대조.png'
    out.convert('RGB').save(p)
    print(f'  saved {p}  (왼쪽부터 원본 · 참새 · 프레임들 / 아랫줄은 실제 표시 크기 2배)')

    for bgc, tag in (((34, 32, 38), '어두운배경'), ((196, 192, 186), '밝은배경')):
        r = Image.new('RGBA', (len(cells) * FRAME * 3, FRAME * 3), (*bgc, 255))
        for i, c in enumerate(cells):
            r.alpha_composite(Image.fromarray(c, 'RGBA').resize((FRAME * 3, FRAME * 3),
                                                               Image.NEAREST), (i * FRAME * 3, 0))
        q = f'{SRC_DIR}/_검수_{action}_시간순_{tag}.png'
        r.convert('RGB').save(q)
        print(f'  saved {q}')


if __name__ == '__main__':
    main()
