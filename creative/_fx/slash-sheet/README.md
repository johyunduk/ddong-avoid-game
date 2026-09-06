# 참격 프레임 시트

`public/assets/fx/sheets/slash_256x192.png` — 8프레임 플립북. 나이트 검기가 쓴다.
**프레임마다 형태가 바뀌는 유일한 이펙트**다 (뻗음 → 임팩트 → 찢어짐 → 조각 → 잔재).

## ComfyUI 가 아니라 ChatGPT 로 뽑았다

절차 생성(`--sheet-slash`)도, ComfyUI 도 아니다. **브라우저로 ChatGPT(GPT Image)** 에
"한 장에 8프레임 가로 일렬" 을 시켰다.

- **프레임 간 일관성 문제가 없다.** 한 장에 같이 그리므로 서로 어긋나지 않는다.
  ComfyUI 로 프레임을 따로 뽑으면 이게 안 된다
- **지시 이행이 훨씬 낫다.** ComfyUI 는 "고립된 추상 이펙트" 를 시키면 검·엠블럼·
  캐릭터로 계속 샜다 (`../knight-beam/README.md` 참고). GPT Image 는 한 번에 나왔다
- 이 저장소는 캐릭터 스프라이트 시트 27종도 같은 방식으로 만들었다

## 프롬프트 (줄바꿈 없이 한 문단으로 — 입력창에서 줄바꿈은 바로 전송된다)

> Create a 2D game VFX animation sprite sheet: one single horizontal strip containing
> exactly 8 frames of the SAME sword slash effect animating over time, frames evenly
> spaced left to right, each frame the same cell size, on a pure solid black background.
> The effect is an anime style crescent sword slash arc — a curved crescent of light with
> a bright white hot core and softer pale edges. Frame 1: a thin faint crescent just
> forming. Frame 2: the crescent extends. Frame 3: full length and thickest, the impact
> moment, sharp pointed tips at both ends. Frame 4: it starts to thin and tear. Frames 5
> to 6: the crescent breaks apart into irregular fragments that drift outward. Frames 7
> to 8: only a few small wisps and sparks left, fading out. Hand painted cel animation
> look, flat 2D anime effect, crisp edges, no motion blur. Absolutely no character, no
> person, no hand, no sword or weapon, no background scenery, no text, no frame numbers,
> no grid lines or borders between frames, nothing but the glowing effect on black.

## 자르기

```bash
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --frames-from creative/_fx/slash-sheet/raw.webp \
  --frames 8 --frame-size 256x192 --frames-rotate 90 \
  --out-file public/assets/fx/sheets/slash_256x192.png
```

셀 경계가 정확히 등분이 아니므로 **밝은 덩어리를 찾아 중심을 잡고 균등한 셀로 다시
자른다.** 알파는 밝기에서 따고 RGB 는 흰색으로 통일해 게임에서 착색한다.
`--frames-rotate 90` 으로 초승달이 **위로 볼록**하게 돌려 둔다 — 호출부에서 매번
90도를 더하는 것보다 텍스처가 이미 맞는 방향인 편이 헷갈리지 않는다.

## 다운로드가 `.tmp` 로 멈추면

Chrome 다운로드 큐가 막혀 `<uuid>.tmp` 로 남는 일이 있다. **그 파일 안에 온전한 PNG 가
들어 있다** — 이름만 못 바꾼 것이라 그대로 복사해 쓰면 된다. 브라우저를 재시작할 필요 없다.

## 게임 쪽

`FX_SHEETS` 한 줄 + `FxKey` 한 개. `projectile({ sheet: 'swordSlash' })` 이
**비행 시간에 맞춰** 재생한다 — 프레임 수를 비행 시간에 나눠 frameRate 를 잡는다.
시트를 쓰면 `layers` 는 무시된다 (그림이 이미 다 들어 있다).

## 색은 시트에 구워 넣는다

```bash
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --frames-from creative/_fx/slash-sheet/raw.webp \
  --frames 8 --frame-size 256x192 --frames-rotate 90 --frames-ramp ff7a10 \
  --out-file public/assets/fx/sheets/slash_256x192.png
```

처음엔 흰색 한 장으로 굽고 게임에서 `setTint` 로 칠했는데, **알파만 다르고 색이 전부
같아서 '기운' 이 아니라 '단색 도형' 으로 보였다.** 코어와 외곽이 구분되지 않는다.

`--frames-ramp` 는 밝기를 색 계단으로 바꾼다 — 어두운 가장자리는 진한 색(지정색의 45%),
중간은 지정색, **가장 밝은 구간(0.84 이상)만 흰색.** 경계를 낮게 잡으면 원본이 전반적으로
밝은 탓에 대부분이 흰색이 되고 색은 테두리만 남는다 (한 번 그렇게 만들었다가 되돌렸다).

캐릭터마다 색이 다르면 **같은 원본에서 램프만 바꿔** 다시 구우면 된다.
그래서 게임 쪽에서는 착색하지 않는다.
