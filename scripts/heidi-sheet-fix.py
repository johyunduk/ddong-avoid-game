# -*- coding: utf-8 -*-
r"""하이디 캐릭터 시트의 **표시 보정 배율** 표를 뽑는다.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/heidi-sheet-fix.py

코드는 모든 뿌요를 같은 배율로 띄운다 (칸 크기 x p.size). 그런데 생성 그림마다 칸 안에서
**개가 차지하는 높이**가 다르다 — 지라이야의 떨어지는 시트는 미나토보다 29% 작게 그려져
있어서 화면에서도 그만큼 작게 나왔다 (사람 판정: "지라이야는 왜 이렇게 작게 나오지").

같은 동작의 기본 뿌요 시트와 **보이는 높이**를 비교해 배율을 낸다.
  - 작게 그려진 것만 키운다 (1 미만은 1). 머리 묶음·털로 큰 캐릭터를 줄이면 개가 작아진다
  - 최대 CAP 까지만
  - 기본 뿌요에 같은 동작이 없는 전용 시트(charge·spin·eye 등)는 그 캐릭터의 걷기 배율을 쓴다

출력은 abilityParams.ts 의 HEIDI_SHEET_FIX 에 그대로 붙여 넣는 TS 줄이다.
"""
import glob
import os
import re

import numpy as np
from PIL import Image

SHEETS = 'public/assets/fx/sheets'
CHARS = ['minato', 'kakashi', 'neji', 'itachi', 'shikamaru', 'choji', 'orochimaru', 'jiraiya']
BASE_ACTIONS = ['walk', 'idle', 'crouch', 'jump', 'kick', 'wall', 'throw', 'dash', 'seal']
CAP = 1.35


def vis_h(path):
    fw, fh = map(int, re.search(r'_(\d+)x(\d+)\.png$', path).groups())
    a = np.array(Image.open(path).convert('RGBA'))[..., 3] > 16
    hs = []
    for i in range(a.shape[1] // fw):
        ys = np.where(a[:, i * fw:(i + 1) * fw].any(axis=1))[0]
        if len(ys):
            hs.append(ys.max() - ys.min() + 1)
    # 칸 높이가 달라도 비교되게 **표시 기준(128 칸) 높이**로 바꾼다 — 코드가 칸 비율만큼 키워 띄우므로
    return float(np.median(hs)) if hs else 0.0


def one(pattern):
    fs = glob.glob(os.path.join(SHEETS, pattern))
    return fs[0] if fs else None


rows = []
for c in CHARS:
    walk_fix = 1.0
    for act in BASE_ACTIONS:
        base = one(f'puyo_{act}_*.png')
        mine = one(f'{c}_{act}_*.png')
        if not base or not mine:
            continue
        f = min(CAP, max(1.0, vis_h(base) / max(1.0, vis_h(mine))))
        if act == 'walk':
            walk_fix = f
        if f > 1.001:
            rows.append((os.path.basename(mine), f))
    # 전용 시트 — 걷기 배율
    for path in sorted(glob.glob(os.path.join(SHEETS, f'{c}_*.png'))):
        act = re.match(rf'{c}_(\w+?)_\d+x\d+\.png$', os.path.basename(path))
        if not act or act.group(1) in BASE_ACTIONS or act.group(1) in ('fin', 'cut', 'cutin', 'tsuga'):
            continue
        if walk_fix > 1.001:
            rows.append((os.path.basename(path), walk_fix))

print('export const HEIDI_SHEET_FIX: Record<string, number> = {')
for name, f in rows:
    print(f"  '{name}': {f:.2f},")
print('};')
