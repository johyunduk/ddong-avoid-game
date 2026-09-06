# 부활 연꽃 프레임 시트

`public/assets/fx/sheets/lotus_192x192.png` — 8프레임. 무기의 부활 연출이 쓴다.
만드는 방식은 참격·낙뢰와 같다 (`../slash-sheet/README.md`).

**피어나는 과정이 프레임에 들어 있다** — 봉오리 → 벌어짐 → 만개 → 빛으로 흩어짐.
정지 그림 한 장을 키워서 '피는 것처럼' 보이게 하던 것과 다르다. 꽃잎이 실제로 벌어진다.

## 프롬프트 (줄바꿈 없이 한 문단)

> Create a 2D game VFX animation sprite sheet: one single horizontal strip containing
> exactly 8 frames of the SAME white lotus flower blooming open over time, frames evenly
> spaced left to right, each frame the same cell size, on a pure solid black background.
> The flower is seen from the front, centered in its frame, sitting at the bottom of the
> frame and opening upward. Frame 1: a small tightly closed bud. Frame 2: the bud swells
> and grows taller. Frame 3: the outer petals just begin to part. Frame 4: half open,
> petals fanning outward. Frame 5: nearly fully open. Frame 6: fully open and at its
> brightest, a warm golden glow at the center. Frame 7: fully open, the petals turning
> translucent and luminous, motes of light rising off the tips. Frame 8: the flower
> dissolving into rising specks of light, only a faint outline left. Luminous translucent
> white petals with soft golden light at the core, hand painted cel animation look, flat
> 2D anime effect, clean crisp edges. Absolutely no pond, no water, no leaves, no stem
> below the flower, no vase, no ground, no character, no person, no hands, no text, no
> frame numbers, no grid lines or borders between frames, nothing but the glowing flower
> on black.

## 자르기

```bash
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --frames-from creative/_fx/lotus-sheet/raw.webp --frames 8 --frame-size 192x192 \
  --frames-pad 0.02 --frames-ramp ffd77a --frames-ramp-hot 0.62 \
  --out-file public/assets/fx/sheets/lotus_192x192.png
```

`--frames-pad` 는 셀 여백이다(기본 0.10). **연꽃은 프레임이 서로 가까워 기본값이면
이웃 꽃이 물려 들어온다** — 0.02 로 낮춘다. 참격·낙뢰처럼 프레임이 넉넉히 떨어져
있으면 기본값이 낫다(잘려나가는 걸 막는다).

`--frames-ramp-hot 0.62` — 꽃잎이 밝아 경계를 낮게 잡아야 흰 심지가 넓게 남는다.
낙뢰와 반대 방향이다.

## 게임 쪽

`playFx('lotusBloom', x, y, { scale, origin: [0.5, 0.92] })` — 원점을 꽃 바닥에 두고
발밑에 앉힌다. 9fps 로 천천히 핀다(8프레임 ≈ 0.9초).
