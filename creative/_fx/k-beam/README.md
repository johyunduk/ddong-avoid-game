# K 에너지파 텍스처

`public/assets/fx/particles/k-beam.png` (397×96) 의 원본과 재생성 방법.
만드는 원리는 나이트 검기(`../knight-beam/README.md`)와 같다 —
**질감은 생성물에서, 형태는 스크립트에서.** 여기서는 호가 아니라 직선이다.

## 재생성

```bash
# 1) 재료 — 검은 배경 위 대각선 플라즈마 광선
python scripts/comfyui-generate.py --workflow character --no-prefix \
  --width 1216 --height 832 --count 6 --seed random \
  --out creative/_fx/k-beam/candidates \
  --prompt "masterpiece, best quality, high resolution, game vfx asset, anime special effect, single straight energy beam shooting diagonally across the image, concentrated plasma bolt, blazing white hot core along the center line, cyan blue plasma edge, electric filaments crackling along the beam, motion energy, isolated effect on pure black background, high contrast, no background details" \
  --negative "character, person, human, girl, boy, face, hand, arm, silhouette, sword, blade, hilt, weapon, armor, landscape, mountain, tree, ground, horizon, stars, starfield, moon, background, scenery, sky, text, watermark, signature, logo, frame, border, grid, curved, arc, crescent, ring, circle, explosion, cluttered, blurry, low quality, worst quality, jpeg artifacts, gray background, white background"

# 2) 형태 + 색 — 띠를 수평으로 세우고, 휘지 않고(--beam-arc 0), 끝만 뾰족하게(--beam-tip)
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --beam creative/_fx/k-beam/src/beam-source.webp \
  --beam-arc 0 --beam-tip \
  --beam-hue 220,245 --beam-sat 2.6 --beam-sat-floor 235 --beam-translucent 0.3 \
  --out-file <임시>.png

# 3) 방사형 마디를 발사점에 맞춰 자른다 (원본에서 x≈115 앞을 버림)
#    마디가 곧 머즐이 되어 손끝에서 터지는 것처럼 보인다

# 4) 코어 층
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --beam-core public/assets/fx/particles/k-beam.png \
  --out-file public/assets/fx/particles/k-beam-core.png
```

## 색을 왜 남색으로 잡았나

K의 기존 색은 시안(`0x8fd4ff`)인데, **게임 배경이 하늘색이라 시안은 그대로 묻힌다.**
색상만 바꿔서는 안 되고 **명도 대비**로 떼어놔야 한다 — 남색(hue 220~245)에
흰 코어를 얹으면 어두운 띠 + 밝은 선이라 하늘 위에서 형태가 선다.
시안·청록 계열은 전부 시도했다가 버렸다.

`--beam-tip` 은 한쪽만 뾰족하게 만드는 옵션이다. 손끝에서 나가는 광선은
**시작이 굵고 끝만 뾰족해야** 한다 — 양끝 테이퍼를 쓰면 발사점이 가늘어져
손에서 떨어져 나온 것처럼 보인다.

## 흰 통은 왜 절차 생성인가

`k-beam-core.png` 는 생성물에서 뽑지 않고 스크립트가 그린다.

```bash
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --beam-tube --tube-sigma 0.62 \
  --out-file public/assets/fx/particles/k-beam-core.png
```

드래곤볼식 에너지파는 **균일한 흰 기둥 + 얇은 색 테두리**다. 생성 텍스처의 흰 부분은
가느다란 필라멘트라 아무리 굵게 늘려도 '선'이지 '통'이 되지 않는다.
그래서 기둥은 그려서 쓰고, 생성 텍스처는 그 위에 얹는 **색과 결**로만 쓴다.
파란 테두리도 같은 통 텍스처를 착색해 만든다 — 생성 텍스처는 색이 번져 테두리가 안 선다.

층 구성 (`KAbility._fireBeam`):

| 층 | 텍스처 | 두께 | 알파 |
|---|---|---|---|
| 파란 테두리 | 통(착색) | 1.7 | 0.60 |
| 에너지 결 | 생성물 | 1.0 | 0.40 |
| 흰 통 | 통 | 0.95 | 0.98 |

## 시작 단면

빔 텍스처는 원본을 x≈115 에서 잘라 쓰기 때문에 **왼쪽이 직각으로 잘려 있다.**
그대로 두면 손에 붙은 광선이 아니라 잘린 파이프처럼 보인다. 두 군데서 막는다.

- 생성 텍스처: 시작 12% 구간에 알파 램프 (`--beam-start-fade`)
- 흰 통: 폭 프로파일이 시작에서 벌어진다 (`--tube-start 0.09`)
