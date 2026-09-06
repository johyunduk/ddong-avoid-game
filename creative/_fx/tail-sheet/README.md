# 구미호 꼬리 프레임 시트

`public/assets/fx/sheets/foxtail_256x96.png` — 8프레임 루프. 꼬리 9개가 쓴다.

## 흔들림은 굽지 않는다

시트는 **털의 결만** 맡는다. 꼬리가 흔들리는 것 자체는 코드가 회전으로 낸다.

- 꼬리마다 위상·주기가 다르다
- 플레이어가 움직이면 반대쪽으로 쏠린다 (트레일링)

둘 다 baked 애니메이션으로는 안 된다. 흔들림까지 구워 넣으면 **9개가 한 박자로
움직여** 부채가 통째로 펄럭이는 것처럼 보인다.

대신 꼬리마다 **시작 프레임을 어긋나게** 준다 (`fxSprite` 의 `sheetStart`).
털의 결까지 같은 박자로 놀지 않게 하는 장치다.

## 프롬프트 (줄바꿈 없이 한 문단)

> Create a 2D game VFX animation sprite sheet: one single horizontal strip containing
> exactly 8 frames of the SAME glowing fox tail rippling, frames evenly spaced left to
> right, each frame the same cell size, on a pure solid black background. In every frame
> the tail lies HORIZONTALLY: its base is a narrow point touching the LEFT edge of the
> frame, it swells to its thickest around the middle, and it tapers to a fine wispy tip
> at the RIGHT edge. It is made of soft luminous fur, with a few long strands separating
> along the upper and lower edges and near the tip. The tail keeps the exact same overall
> length, thickness and position in every frame — only the fur strands and the outline
> ripple and flutter, as if a slow wave travels from the base toward the tip. This is a
> SEAMLESS LOOP: frame 8 must flow naturally back into frame 1. Render it in pure
> GRAYSCALE, white and light gray only, no color at all. Hand painted cel animation look,
> flat 2D anime effect, crisp clean edges, no motion blur. Absolutely no fox, no animal,
> no body, no head, no legs, no character, no person, no other tails, no text, no frame
> numbers, no grid lines or borders between frames, nothing but the single glowing tail
> on black.

**밑동은 왼쪽 끝, 끝은 오른쪽 끝**을 못박아야 한다. 게임에서 원점을 `[0, 0.5]` 로 두고
밑동을 축으로 회전시키기 때문이다.

## 자르기

```bash
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --frames-from creative/_fx/tail-sheet/raw.webp --frames 8 --frame-size 256x96 \
  --frames-pad 0.04 \
  --out-file public/assets/fx/sheets/foxtail_256x96.png
```

무채색으로 뽑아 9색으로 착색한다 (`--frames-ramp` 없음).
절차 생성 깃(`--plume`)으로 만들던 텍스처는 이걸로 대체됐다.
