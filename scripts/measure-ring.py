r"""`proc-ring.png` 의 **밝은 선 반지름**을 실측한다.

`src/abilities/RedAbility.ts` 의 `RING_ART_RADIUS` 상수의 출처다. 링 배율을 이 값으로
나눠야 화면에 보이는 링이 실제 판정 반경과 일치한다.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/measure-ring.py
"""
import math

from PIL import Image

SRC = 'public/assets/fx/particles/proc-ring.png'

im = Image.open(SRC).convert('RGBA')
w, h = im.size
px = im.load()
cx, cy = w / 2, h / 2

# 반지름 구간별 평균 알파 — 링을 원형으로 적분한다
total = [0.0] * (w // 2 + 1)
count = [0] * (w // 2 + 1)
for y in range(h):
    for x in range(w):
        r = int(round(math.hypot(x + 0.5 - cx, y + 0.5 - cy)))
        if r <= w // 2:
            total[r] += px[x, y][3]
            count[r] += 1
prof = [total[r] / max(1, count[r]) for r in range(w // 2 + 1)]

peak = max(range(len(prof)), key=lambda r: prof[r])
# 알파 가중 중심 — 원둘레가 r 에 비례하므로 가중치에 r 을 한 번 더 곱한다
wsum = sum(prof[r] * r for r in range(len(prof)))
centroid = sum(prof[r] * r * r for r in range(len(prof))) / max(1e-9, wsum)
half = [r for r in range(len(prof)) if prof[r] >= prof[peak] * 0.5]

print(f'프레임 {w}x{h} → 프레임 반지름 {w / 2:.0f}px')
print(f'가장 밝은 반지름     {peak}px  ({peak / (w / 2):.3f} of half)')
print(f'알파 가중 중심 반지름 {centroid:.1f}px  ({centroid / (w / 2):.3f} of half)')
print(f'절반 밝기 구간       {half[0]}..{half[-1]}px  (선 두께 {half[-1] - half[0]}px)')
print()
print(f'RING_ART_RADIUS = {centroid:.1f};')
