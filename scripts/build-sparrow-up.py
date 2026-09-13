r"""레드 참새 — **위를 보는** 시트 조립.

composer 가 낸 낱장(`creative/_fx/red-companions/up/<개체>/<개체>_up_1..4.png`)을
게임 시트 한 장으로 굽는다. 재생성:

    C:\ComfyUI\.venv\Scripts\python.exe scripts/build-sparrow-up.py

## 왜 128 프레임이 아닌가
전환할 때 크기가 튀지 않으려면 **몸통**(가슴~꼬리)이 옆모습과 같아야 한다.
날개 끝이 아니다 — 위 보는 새는 날개를 좌우로 펼쳐 가로가 훨씬 넓다.
몸통을 맞추면 날개 봉투가 163x118px 이 되어 128 프레임을 넘는다. 그래서
프레임을 **176x144** 로 잡았다. 화면 배율은 옆모습과 같은 0.25 를 그대로 쓰므로
(`sparrowScale()`), 프레임이 커진 만큼 그림도 커져 몸통이 맞는다.

## 몸통을 어떻게 재는가
알파 마스크에 들어가는 **가장 큰 원의 반지름**(거리 변환 최댓값)을 쓴다.
날개는 얇아서 먼저 깎여 나가고 몸통만 남는다 — 시점이 달라도 같은 것을 잰다.
개체마다 옆모습 몸통이 다르므로 **개체별로** 배율을 따로 잡는다.
"""
import glob
import os
import pathlib

import numpy as np
from PIL import Image
from scipy import ndimage as nd

SRC_DIR = 'creative/_fx/red-companions/up'
OUT_DIR = 'public/assets/fx/sheets'
SIDE_GLOB = 'public/assets/fx/sheets/sparrow_*_128x128.png'
SIDE_FW = 128
FRAME_W, FRAME_H = 176, 144
ALPHA_CUT = 8


def clean_mask(im):
    """가장 큰 덩어리만 남긴다 — 배경 제거가 남긴 가장자리 찌꺼기를 턴다."""
    a = np.array(im.convert('RGBA'))[:, :, 3]
    m = a > ALPHA_CUT
    lab, n = nd.label(m)
    if n > 1:
        sizes = nd.sum(m, lab, range(1, n + 1))
        m = lab == (int(np.argmax(sizes)) + 1)
    return m


def torso_r(m):
    return float(nd.distance_transform_edt(np.pad(m, 1)).max())


def resize_rgba(im, w, h):
    """프리멀티플라이로 줄인다 — 그냥 줄이면 투명한 쪽 색이 섞여 테두리가 어두워진다."""
    arr = np.array(im.convert('RGBA')).astype(np.float64)
    a = arr[:, :, 3:4] / 255.0
    arr[:, :, :3] *= a
    pm = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
    pm = pm.resize((w, h), Image.LANCZOS)
    out = np.array(pm).astype(np.float64)
    a2 = out[:, :, 3:4] / 255.0
    out[:, :, :3] = np.where(a2 > 0, out[:, :, :3] / np.maximum(a2, 1e-6), 0)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')


# ── 옆모습 몸통 크기 (맞출 기준) ─────────────────────────────────────────────
side_r = {}
for f in sorted(glob.glob(SIDE_GLOB)):
    name = os.path.basename(f).split('_')[1]
    im = Image.open(f)
    side_r[name] = float(np.mean([
        torso_r(clean_mask(im.crop((i * SIDE_FW, 0, (i + 1) * SIDE_FW, SIDE_FW))))
        for i in range(im.width // SIDE_FW)
    ]))

pathlib.Path(OUT_DIR).mkdir(parents=True, exist_ok=True)
print(f'프레임 {FRAME_W}x{FRAME_H} · 4프레임 · 개체별 몸통 맞춤')
total_mb = 0.0
worst_fit = 0.0

for name in sorted(side_r):
    files = sorted(glob.glob(f'{SRC_DIR}/{name}/{name}_up_[1-4].png'))
    if len(files) != 4:
        print(f'  {name:10s} 원본 {len(files)}장 — 건너뜀')
        continue

    srcs = [Image.open(f).convert('RGBA') for f in files]
    masks = [clean_mask(im) for im in srcs]
    up_r = float(np.mean([torso_r(m) for m in masks]))
    k = side_r[name] / up_r

    sheet = Image.new('RGBA', (FRAME_W * 4, FRAME_H), (0, 0, 0, 0))
    env_w = env_h = 0
    for i, (im, m) in enumerate(zip(srcs, masks)):
        # 찌꺼기를 지우고 (가장 큰 덩어리 밖은 알파 0)
        arr = np.array(im)
        arr[:, :, 3] = np.where(m, arr[:, :, 3], 0)
        cut = Image.fromarray(arr, 'RGBA')
        ys, xs = np.where(m)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        body = cut.crop(box)
        w = max(1, int(round(body.width * k)))
        h = max(1, int(round(body.height * k)))
        env_w, env_h = max(env_w, w), max(env_h, h)
        small = resize_rgba(body, w, h)
        # 옆모습 시트와 같은 규약: **몸통 bbox 중심**을 프레임 중심에 둔다
        sheet.alpha_composite(small, (i * FRAME_W + (FRAME_W - w) // 2, (FRAME_H - h) // 2))

    out = f'{OUT_DIR}/sparrow_{name}_up_{FRAME_W}x{FRAME_H}.png'
    sheet.save(out)
    mb = sheet.width * sheet.height * 4 / 1048576
    total_mb += mb
    fit = max(env_w / FRAME_W, env_h / FRAME_H)
    worst_fit = max(worst_fit, fit)
    print(f'  {name:10s} 옆 몸통 {side_r[name]:5.2f} / 위 몸통 {up_r:6.1f} '
          f'→ 배율 {k:.4f}  봉투 {env_w}x{env_h}  프레임의 {fit * 100:.0f}%  {mb:.2f}MB')

print(f'\n합계 {total_mb:.2f}MB · 프레임을 가장 많이 채운 개체 {worst_fit * 100:.0f}%')
print(f'저장 위치: {OUT_DIR}/sparrow_<개체>_up_{FRAME_W}x{FRAME_H}.png')
