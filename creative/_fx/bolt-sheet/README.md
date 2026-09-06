# 낙뢰 프레임 시트

`public/assets/fx/sheets/boltgold_160x384.png` · `boltred_160x384.png` — 8프레임.
무기의 황금 번개 / 검붉은 번개가 쓴다. 만드는 방식은 참격과 같다
(`../slash-sheet/README.md`).

## 번쩍임이 프레임에 들어 있다

프롬프트에 **"프레임마다 경로가 조금씩 다르게, 다시 치는 것처럼"** 을 넣었다.
그래서 재생만 하면 지지직거린다 — 시작점·두께를 흔들고 다른 텍스처를 뽑아 가며
네 번 치던 코드가 통째로 필요 없어졌다.

절차 생성 번개(`--bolt`, 시드 3변형)도 만들었다가 버렸다. 지그재그 규칙을
맞추느라 여러 번 되돌아갔는데(무작위면 흔들리기만 하고, 매 마디 교대하면 스프링),
생성 모델은 그걸 한 번에 그린다.

## 프롬프트 (줄바꿈 없이 한 문단)

> Create a 2D game VFX animation sprite sheet: one single horizontal strip containing
> exactly 8 frames of the SAME lightning strike animating over time, frames evenly
> spaced left to right, each frame the same cell size, on a pure solid black background.
> In every frame the bolt is VERTICAL, striking downward from the very top edge of its
> frame to the very bottom edge, a jagged irregular zigzag with a few forked branches
> splitting off sideways, blazing white hot core with a thin pale glow around it. The
> bolt path is slightly DIFFERENT in each frame, as if re-striking. Frame 1: a faint thin
> leader, barely visible. Frame 2: the main bolt strikes, bright and clearly thicker.
> Frame 3: the brightest and thickest strike with the most branches. Frame 4: a re-strike
> on a different path, thinner. Frame 5: thinner again, fewer branches. Frames 6 to 7:
> the bolt breaks into disconnected glowing fragments. Frame 8: only a few faint sparks
> left. Hand painted cel animation look, flat 2D anime effect, crisp hard edges, no
> motion blur, no glow bloom halo. Absolutely no clouds, no sky, no ground, no landscape,
> no character, no person, no text, no frame numbers, no grid lines or borders between
> frames, nothing but the glowing bolt on black.

## 자르기 — 같은 원본에서 두 색

```bash
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --frames-from creative/_fx/bolt-sheet/raw.webp --frames 8 --frame-size 160x384 \
  --frames-ramp ffbb00 \
  --out-file public/assets/fx/sheets/boltgold_160x384.png

C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --frames-from creative/_fx/bolt-sheet/raw.webp --frames 8 --frame-size 160x384 \
  --frames-ramp d42222 --frames-ramp-hot 1.0 \
  --out-file public/assets/fx/sheets/boltred_160x384.png
```

`--frames-ramp-hot` 은 흰 심지가 시작되는 밝기다(기본 0.84).
**검붉은 번개는 1.0 으로 끈다** — 원본이 전반적으로 밝아서 심지를 남기면 대부분이
흰색이 되고 색이 안 선다. 0.97 로 해 봤더니 밝은 픽셀만 흩어져 소금처럼 튀었다.

## 게임 쪽

`playFx('boltGold' | 'boltRed', x, y, { scale, origin: [0.5, 1] })`.
원점을 **바닥**에 두고 `scale = 착지 높이 / 384` 로 하늘까지 늘린다.
`playFx` 에 `origin` 을 이때 추가했다 — 한쪽 끝을 대상에 맞춰야 하는 시트용이다.
