# 여우불 프레임 시트

`public/assets/fx/sheets/foxfire_128x192.png` — 8프레임 루프. 구미의 여우불 9개가 쓴다.
만드는 방식은 참격·낙뢰와 같다 (`../slash-sheet/README.md`).

## 무채색으로 뽑는다

여우불은 **9색으로 착색**된다. 색을 구워 넣으면 시트가 9장 필요하다.
그래서 프롬프트에 `Render it in pure GRAYSCALE, white and light gray only, no color at all`
을 넣고, 자를 때도 `--frames-ramp` 를 쓰지 않는다.

이전에 생성 불꽃 텍스처(파란 도깨비불)를 컷아웃해 착색해 봤다가 되돌린 적이 있다 —
**파란 원색이 남아 빨강·노랑 착색이 탁해졌다.** 무채색이면 그 문제가 없다.
블렌드도 일반(normal)이다. 가산(ADD)으로 올리면 밝은 하늘 위에서 흰 얼룩이 된다.

## 루프 조건

프롬프트에 두 가지를 못박았다:
- **크기와 위치는 프레임마다 그대로**, 혀와 윤곽만 다르게 일렁인다
- **프레임 8이 프레임 1로 자연스럽게 이어지는 SEAMLESS LOOP**

이게 없으면 재생할 때 불꽃이 튀거나 위치가 흔들린다.

## 프롬프트 (줄바꿈 없이 한 문단)

> Create a 2D game VFX animation sprite sheet: one single horizontal strip containing
> exactly 8 frames of the SAME floating spirit flame flickering, frames evenly spaced
> left to right, each frame the same cell size, on a pure solid black background. Each
> frame shows one teardrop shaped will-o-wisp flame, centered in its frame, with a bright
> solid core near the bottom and wispy tongues curling upward off the top. The flame
> keeps the same overall size and position in every frame — only the tongues and the
> outline change shape as it flickers, licking and twisting differently in each frame.
> This is a SEAMLESS LOOP: frame 8 must flow naturally back into frame 1. Render it in
> pure GRAYSCALE, white and light gray only, no color at all. Hand painted cel animation
> look, flat 2D anime effect, crisp clean edges, no motion blur. Absolutely no candle, no
> torch, no lantern, no wick, no hand, no character, no creature, no skull, no ground, no
> smoke cloud, no text, no frame numbers, no grid lines or borders between frames,
> nothing but the glowing flame on black.

## 자르기

```bash
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --frames-from creative/_fx/foxfire-sheet/raw.webp --frames 8 --frame-size 128x192 \
  --frames-pad 0.06 \
  --out-file public/assets/fx/sheets/foxfire_128x192.png
```

## 게임 쪽 — 루프 재생

여우불은 떠오르는 동안 **호출부가 들고 다니며 계속 움직이는** 오브젝트다.
`playFx` 는 한 번 재생하고 스스로 사라지므로 맞지 않는다.
그래서 `fxSprite` 에 `sheet` 옵션을 추가했다 — 시트를 `repeat: -1` 로 물려 두고,
회수는 `lifeMs` 와 호출부의 `destroy()` 가 맡는다.

자취(trail)는 없앴다. 불꽃이 프레임마다 타오르므로 발광 점을 덧대면 지저분해진다.

## 다운로드가 안 보이면

이 브라우저는 다운로드가 **`OneDrive\바탕 화면`** 으로 떨어진다. `Downloads` 폴더가 아니다.

## 심지는 시트를 하나 더 만든다

회색조 시트를 **통째로 착색하면 심지까지 물들어** 단색 덩어리가 된다.
원본은 착색된 반투명 외곽 + 흰 심지 두 겹이었다. 같은 프레임에서 **가장 밝은 부분만**
남긴 흰 판을 하나 더 굽고, 가산으로 얹어 재현한다.

```bash
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --beam-core public/assets/fx/sheets/foxfire_128x192.png \
  --core-floor 0.82 --core-sharpen 1.5 \
  --out-file public/assets/fx/sheets/foxfirecore_128x192.png
```

`--core-floor` 를 새로 넣었다. 기본 감마만으로는 **이 불꽃처럼 원본이 밝으면 코어가
형태를 통째로 먹어 색 테두리만 남는다** (0.70 도 아직 컸다). 0.82 로 잘라야
심지가 아래쪽 덩어리로 남고 색이 산다.

심지는 **가산(add)** 이다 — 밝은 하늘 위에서 흰색으로 포화돼 '속에서 타는 빛'이 된다.
원본의 `glow_dot` ADD 가 그 조건에 맞게 튜닝돼 있던 것과 같은 이유다.
외곽은 일반 블렌드여야 색이 산다.
