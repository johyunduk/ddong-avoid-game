r"""체스 말 시트의 프레임별 **머리 꼭대기 / 발바닥** 세로 위치를 실측한다.

`src/abilities/TedAbility.ts` 의 `HEAD_ORIGIN_Y` 표와 `FOOT_ORIGIN_Y` 상수의 출처다.
시트를 새로 그리면 이걸 돌려 표를 갱신해라.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/measure-chess-head.py
"""
from PIL import Image

SHEET = 'public/assets/fx/sheets/chess_96x128.png'
FW, FH = 96, 128
ALPHA_CUT = 8          # 이 아래는 배경으로 본다 (가장자리 부드러운 픽셀 무시)

im = Image.open(SHEET).convert('RGBA')
cols = im.width // FW
heads, feet = [], []

for r in range(im.height // FH):
    for c in range(cols):
        f = im.crop((c * FW, r * FH, (c + 1) * FW, (r + 1) * FH))
        bb = f.getchannel('A').point(lambda v: 255 if v > ALPHA_CUT else 0).getbbox()
        i = r * cols + c
        if bb is None:
            print(f'frame {i}: 비었음')
            heads.append(0.0)
            continue
        x0, y0, x1, y1 = bb
        heads.append(y0 / FH)
        feet.append(y1 / FH)
        print(f'frame {i}: 높이 {y1 - y0}px  머리 {y0 / FH:.4f}  발 {y1 / FH:.4f}')

print()
print('HEAD_ORIGIN_Y = [' + ', '.join(f'{h:.4f}' for h in heads) + '];')
print(f'FOOT_ORIGIN_Y = {max(feet):.4f}  (프레임별 편차 {max(feet) - min(feet):.4f})')
