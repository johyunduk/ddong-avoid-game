# -*- coding: utf-8 -*-
r"""아랑아(회오리 드릴) 기본 시트 한 장 -> **캐릭터별 색** 시트 여덟 장.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/tsuga-tint.py

모양은 한 장으로 맞춘다 (여덟 번 생성하면 캐릭터마다 크기·각도가 흔들린다).
색만 입힌다 — 바람 띠의 **어두운 쪽과 가운데 크림색**에 캐릭터 색을 싣고,
밝은 하이라이트는 흰색으로 남긴다. 다 칠하면 회오리가 아니라 색 덩어리로 보인다.

원본: $DDONG_FX_WORK/tsuga/tsuga_base_160x112.png (ChatGPT 생성 -> fx-grid-ingest -> 마젠타 번짐 제거)
"""
import os

import numpy as np
from PIL import Image
FX_WORK = os.environ.get('DDONG_FX_WORK', 'C:/Users/user/ddong-fx-work')  # 생성 원본·작업물 (저장소 밖)

SRC = f'{FX_WORK}/tsuga/tsuga_base_160x112.png'
OUT = 'public/assets/fx/sheets'
NAME = 'tsuga_160x112.png'

# 캐릭터 특징 색 — (바람 띠에 싣는 색, 가운데 심 색, 세기 0~1)
CHARS = {
    'minato':     ((255, 212, 0),   (255, 236, 150), 0.60),  # 비뢰신 노랑
    'kakashi':    ((110, 190, 255), (220, 240, 255), 0.60),  # 치도리 청백
    'neji':       ((150, 160, 255), (235, 230, 255), 0.50),  # 백안·회천 연보라
    'itachi':     ((150, 10, 30),   (60, 10, 20),    0.70),  # 아카츠키 검붉음
    'shikamaru':  ((70, 95, 60),    (40, 45, 40),    0.60),  # 그림자·조끼 짙은 녹회
    'choji':      ((240, 140, 40),  (255, 200, 140), 0.60),  # 배가술 주황
    'orochimaru': ((140, 90, 210),  (220, 200, 240), 0.60),  # 뱀 보라
    'jiraiya':    ((220, 50, 60),   (255, 190, 170), 0.55),  # 두꺼비 선인 진홍
}


def tint(a, band, core, k):
    rgb = a[..., :3].astype(np.float32) / 255
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    # 크림색 심 = 따뜻한(빨강 > 파랑) 픽셀
    warm = np.clip((rgb[..., 0] - rgb[..., 2]) * 6, 0, 1)
    band_c = np.array(band, np.float32) / 255
    core_c = np.array(core, np.float32) / 255
    # 어두울수록 강하게, 하이라이트(lum > 0.9)는 거의 그대로
    w = k * np.clip((1.0 - lum) * 1.6 + 0.15, 0, 1)[..., None]
    band_t = band_c * np.clip(lum * 1.15, 0, 1)[..., None]           # 명암은 살린다
    core_t = core_c * np.clip(0.55 + lum * 0.6, 0, 1.2)[..., None]
    target = band_t * (1 - warm[..., None]) + core_t * warm[..., None]
    wc = np.maximum(w, (warm * min(1.0, k + 0.25))[..., None])
    out = rgb * (1 - wc) + target * wc
    res = a.copy()
    res[..., :3] = np.clip(out * 255, 0, 255).astype(np.uint8)
    return res


def main():
    a = np.array(Image.open(SRC).convert('RGBA'))
    Image.fromarray(a).save(os.path.join(OUT, NAME))
    print('base ->', NAME)
    for c, (band, core, k) in CHARS.items():
        name = f'{c}_{NAME}'
        Image.fromarray(tint(a, band, core, k)).save(os.path.join(OUT, name))
        print(c, '->', name)


if __name__ == '__main__':
    main()
