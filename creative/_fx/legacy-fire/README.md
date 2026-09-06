# 레거시(UR) 불 프레임 시트

`public/assets/fx/sheets/legacyflame_128x192.png` — 상시 오라 · 모드 발동 시 화면 불꽃
`public/assets/fx/sheets/legacyburn_192x192.png` — 똥 소각 폭발
원본 스트립: `raw-flame.png` (2048×768) · `raw-burst.png` (2172×724), ChatGPT/GPT Image

## 자르기

색이 그림에 들어 있으므로 램프로 굽지 않는다 (`--frames-keep-color`).

```bash
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --frames-from creative/_fx/legacy-fire/raw-flame.png --frames 8 \
  --frame-size 128x192 --frames-keep-color --frames-pad 0.02 --frames-color-alpha 0.80 \
  --out-file public/assets/fx/sheets/legacyflame_128x192.png

C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --frames-from creative/_fx/legacy-fire/raw-burst.png --frames 8 \
  --frame-size 192x192 --frames-keep-color --frames-pad 0.02 --frames-color-alpha 0.80 \
  --out-file public/assets/fx/sheets/legacyburn_192x192.png
```

## 착색하지 않는다

원래 오라는 팔레트(`ORA_COLS_*`)에서 색을 뽑아 발광 점에 `setTint` 했다.
시트에는 **붉은 겉 → 주황 → 황금 → 흰 심지**의 계조가 이미 그려져 있어서,
통째로 tint 를 걸면 그 계조가 한 색으로 눌려 '불'이 아니라 '주황 도형'이 된다.
그래서 팔레트를 지웠다. 레거시 모드의 뜨거움은 크기·개수·알파로만 낸다.

## 두 장으로 나눈 이유

불꽃(세로로 긴 셀 2:3)과 폭발(정사각)은 **인게임 종횡비가 다르다.**
한 장에 담으면 한쪽이 늘어난다 — K 에너지파에서 같은 실수를 했다
(`../kbeam-sheet/README.md` 의 "프레임 비율을 인게임 비율에 맞춘다").

불꽃은 밑동이 좌표에 오도록 `origin: [0.5, 0.92]` 로 쓴다.
가운데 원점이면 불이 발밑이 아니라 배 높이에서 타오른다.

## 시트가 담지 못하는 것

- **튀는 불티 · 남는 연기** → `burst('ember')` · `burst('smoke')`.
  불티는 사방으로 흩어지는 궤적이라 프레임에 굽으면 매번 같은 모양이 된다.
- **불티는 일반 합성으로 내린다.** 프리셋 기본값은 가산인데, 밝은 하늘 위에서
  가산 불티는 주황을 잃고 흰 점이 되고 살아 있는 동안 **전체 화면 블룸 패스를 붙잡는다.**
  한 번에 4마리가 타므로 그 비용이 그대로 4배가 된다.
  이 한 줄로 레거시 모드 중 `bloomRefs` 가 21 → 0 이 됐다 (누수 하네스 [15a]).

## 폐기한 것

`foxFire`/`auraRing`(구미·공용 시트)을 주황으로 착색해 돌려쓰던 1차 시안.
불꽃 모양이 도깨비불이라 '타오르는 불'로 읽히지 않았다.
