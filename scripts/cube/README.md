# 테드 체스 큐브 — 에셋 재생성

설계: `docs/fx-ted-cube-remake.md` · 기준 이미지: `creative/_fx/ted-cube/refs/`

에셋은 스크립트로 다시 만들 수 있어야 한다. 아래 명령이 전부다.

## 준비 (한 번만)

```powershell
winget install --id BlenderFoundation.Blender --exact
blender --version    # 5.2.x LTS 에서 확인함
```

`pip install bpy` 는 쓰지 않는다 — 휠이 특정 파이썬 버전에 묶여 있고 이 기계의
파이썬(3.10 / 3.12)과 맞지 않는다. 앱으로 깔고 **번들 파이썬**을 쓰면 버전 문제가 없다.

## 재생성

```powershell
$B  = "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
$PY = "C:\ComfyUI\.venv\Scripts\python.exe"

# 0) 시간 축 — 여기가 단일 진실이다. TS 상수와 시트가 같은 숫자를 본다
& $PY scripts/cube/timeline.py

# 1) 프레임 렌더 (세 패스, 서로 독립이라 순서 무관. 합쳐서 약 40초)
& $B -b -P scripts/cube/render.py -- --pass body --phase forge --out build/cube/forge_body
& $B -b -P scripts/cube/render.py -- --pass body --phase blast --out build/cube/blast_body
& $B -b -P scripts/cube/render.py -- --pass core --phase forge --out build/cube/forge_core

# 2) 격자 시트로 합치기 (파일명의 _WxH 는 vfx.ts 의 parseFrameSize 가 읽는다)
& $PY scripts/cube/pack-sheet.py --in build/cube/forge_body --cols 6 --frame 192x192 --name cubeforge
& $PY scripts/cube/pack-sheet.py --in build/cube/blast_body --cols 6 --frame 256x256 --name cubeblast
& $PY scripts/cube/pack-sheet.py --in build/cube/forge_core --cols 6 --frame 128x128 --name cubecore

# 3) 검증
& $PY scripts/cube/pack-sheet.py --verify public/assets/fx/sheets/cubeforge_192x192.png
& $PY scripts/cube/pack-sheet.py --seam   public/assets/fx/sheets/cubeforge_192x192.png `
                                          public/assets/fx/sheets/cubeblast_256x256.png
# **게임 표시 크기(180px)로 줄여 놓고** 읽히는지 본다. 큰 그림에서 멋진 건 소용이 없다
& $PY scripts/cube/pack-sheet.py --contact public/assets/fx/sheets/cubeforge_192x192.png `
      public/assets/fx/sheets/cubeblast_256x256.png --size 180 --every 3 `
      --out creative/_fx/ted-cube/result_180px.png

node scripts/run-fx-leak-check.mjs      # [T1]~[T4] 가 큐브 구간이다
.\scripts\verify.ps1
```

부분 렌더(한두 프레임만 보고 싶을 때):

```powershell
& $B -b -P scripts/cube/render.py -- --pass body --phase forge --out build/cube/_t --frames 18,19,20
```

## 어디를 고치면 무엇이 바뀌나

| 바꾸고 싶은 것 | 손댈 곳 |
|---|---|
| 박자 (구간 길이·프레임 수) | `timeline.py` 상단 상수 → `timeline.py` 실행 → 렌더 → 팩 → TS 상수 대조 |
| 큐브의 화면 크기 | `render.py` `BASE_SENSOR` (작을수록 크게 보인다) |
| 재질·조명 | `render.py` `IVORY` / `BLACK` / `KEY_E` / `RIM_E` / `FILL_E` |
| 이음새 빛의 세기 | `render.py` `core_strength()` — **3.3 을 넘기면 금색이 흰색으로 잘린다** |
| 파열 별빛 | `render.py` `build_flare()` 표 (길이·두께·각도) + `FLARE_RAY` |
| VRAM 12.56 → 11.06MB | `vfx.ts` `FX_SHEET_GROUPS` 에서 `cubeCore` 한 줄 제거 (설계 §5.3) |

## 주의

- **`build/cube/` 는 중간 산출물**이다. 지워도 위 명령으로 다시 만들어진다
- 옛 절차 생성 판(`scripts/make-cube-sheet.py`, `public/assets/fx/sheets/cubeburst_192x192.png`)은
  **승인 전까지 지우지 않는다.** 돌아갈 곳이 있어야 한다 — 현재 코드는 이미 쓰지 않는다
- `render.py` 는 인자 없이 돌려도 항상 같은 결과가 나온다. 난수는 고정 시드 하나에서만 나오고,
  **프레임 인덱스를 시드에 섞지 않는다** (섞으면 떨림이 아니라 노이즈가 된다)

---

# 픽셀 판본 (현재 게임 기본)

채택 아트 디렉션: `creative/_fx/ted-cube/pixel-chatgpt/` 의 4장.
그리는 스크립트는 `scripts/cube/pixel.py` 하나이고, **3D 렌더와 무관하다** (Blender 불필요).

## 재생성

```powershell
$PY = "C:\ComfyUI\.venv\Scripts\python.exe"

& $PY scripts/cube/pixel.py --palette                      # 채택 4장 → palette.json
& $PY scripts/cube/pixel.py --icons                        # 전환 조각 낱장 2장
& $PY scripts/cube/pixel.py --phase forge --out build/cube/px_forge
& $PY scripts/cube/pixel.py --phase blast --out build/cube/px_blast
& $PY scripts/cube/pack-sheet.py --in build/cube/px_forge --cols 6 --frame 192x192 --name cubepxforge
& $PY scripts/cube/pack-sheet.py --in build/cube/px_blast --cols 6 --frame 256x256 --name cubepxblast

# 검증 — 182px 로 줄여 3×3 구조와 칸의 두께가 남는지 본다
& $PY scripts/cube/pack-sheet.py --verify public/assets/fx/sheets/cubepxforge_192x192.png
& $PY scripts/cube/pack-sheet.py --seam   public/assets/fx/sheets/cubepxforge_192x192.png `
                                          public/assets/fx/sheets/cubepxblast_256x256.png
& $PY scripts/cube/pack-sheet.py --contact public/assets/fx/sheets/cubepxforge_192x192.png `
      public/assets/fx/sheets/cubepxblast_256x256.png --size 182 --every 3 `
      --out creative/_fx/ted-cube/pixel_182px.png
```

## 3D 판본으로 되돌리기

`src/utils/vfx.ts` 의 **한 줄**:

```ts
export const CUBE_VARIANT: CubeVariant = 'pixel';   // → 'render'
```

시트·가산 발광층(`cubeCore`)·코드 파티클(발광 링·충격파·불똥·연기)이 한꺼번에 돌아온다.
3D 에셋과 `render.py`·`docs/fx-ted-cube-remake.md` 는 전부 보존돼 있다.

## 어디를 고치면 무엇이 바뀌나

| 바꾸고 싶은 것 | 손댈 곳 |
|---|---|
| 색 | `pixel.py --palette` 재실행 (기준 이미지를 바꾸면 자동으로 따라간다). 손으로 고르지 마라 |
| 큐브 크기 | `pixel.py` `CELL` (칸 반폭 px). 20 → 큐브 폭 120px |
| 이음새 두께 | `CUBIE_FILL` (0.76). 낮출수록 금색 틈이 넓어진다 |
| 박자 | `timeline.py` — **3D 판본과 공유한다.** 프레임 수가 바뀌면 두 판본을 다 다시 구워야 한다 |
| 광선 길이·개수 | `draw_spikes()` 의 `base` 표 |
| 결합/파열 섬광 | `draw_cross()` |

---

# 원화 판본 (현재 게임 기본) — `CUBE_VARIANT = 'artwork'`

**ChatGPT 원화 자체가 게임에 들어간다.** 그림을 새로 그리지 않는다.
원화: `creative/_fx/ted-cube/pixel-chatgpt/keyframes/` (composer w8, 배경 제거 완료 8장)

## 재생성

```powershell
$PY = "C:\ComfyUI\.venv\Scripts\python.exe"
$KF = "creative/_fx/ted-cube/pixel-chatgpt/keyframes"
$REF = "creative/_fx/ted-cube/pixel-chatgpt"

& $PY scripts/cube/artwork.py measure $KF                 # 원화 실측 (정렬 확인)
& $PY scripts/cube/artwork.py build --phase forge --src $KF --out build/cube/art_forge
& $PY scripts/cube/artwork.py build --phase blast --src $KF --out build/cube/art_blast
& $PY scripts/cube/pack-sheet.py --in build/cube/art_forge --cols 6 --frame 192x192 --name cubeartforge
& $PY scripts/cube/pack-sheet.py --in build/cube/art_blast --cols 6 --frame 256x256 --name cubeartblast

# 검증 — [A] 배경 제거가 픽셀을 바꿨나 + [B] 조립이 원화를 그대로 넣었나
& $PY scripts/cube/verify-artwork.py --sheet public/assets/fx/sheets/cubeartforge_192x192.png `
      --phase forge --refs $REF --crop 0 --compare creative/_fx/ted-cube/cmp_forge.png
& $PY scripts/cube/verify-artwork.py --sheet public/assets/fx/sheets/cubeartblast_256x256.png `
      --phase blast --refs $REF --crop 0 --compare creative/_fx/ted-cube/cmp_blast.png
& $PY scripts/cube/pack-sheet.py --seam public/assets/fx/sheets/cubeartforge_192x192.png `
                                        public/assets/fx/sheets/cubeartblast_256x256.png
& $PY scripts/cube/pack-sheet.py --contact public/assets/fx/sheets/cubeartforge_192x192.png `
      public/assets/fx/sheets/cubeartblast_256x256.png --size 182 --every 3 `
      --out creative/_fx/ted-cube/artwork_182px.png
```

## 쓰는 연산 — 전부 정수

홀드 · **정수 px 평행이동** · 정수 자르기 · **NEAREST 정수배 축소** · 조각 오려내기.
회전·임의 배율·재작화 없음. 배치는 `scripts/cube/keyframe-map.json` 한 곳에서 바꾼다.

**배율 정규화도 정수로 한다.** 원화마다 큐브가 그려진 크기가 달라서(03_charge 가 02 의 1.3배)
키프레임마다 **정수 축소 배율을 다르게** 고른다. 배율은 큐브 크기와 "원화를 얼마나 넓게 보는가"를
동시에 정하므로, **창 ≥ 원화 내용 bbox** 를 만족하는 값을 골라야 프레임 경계에서 안 잘린다.

| 키프레임 | 큐브 | 배율 | 화면 큐브 | 창 ≥ 내용 |
|---|---|---|---|---|
| 01_gather | — | ÷7 | — | 1344 ≥ 1254 ✓ |
| 01b_clump | — | ÷6 | — | 1152 ≥ 875 ✓ |
| 02_assemble | 464 | ÷4 | 116 | 768 ≥ 694 ✓ |
| 02b_firstlight | 464 | ÷4 | 116 | 768 ≥ 539 ✓ |
| 03_charge | 603 | ÷6 | 100 | 1152 ≥ 1092 ✓ |
| 03b_maxcompress | 480 | ÷5 | 96 | 960 ≥ 565 ✓ |
| 04/05 (blast) | — | ÷5 | — | 1280 ≥ 1254 ✓ |

116 → 116 → 100 → 96 의 압축 아크가 그대로 연출이 된다.

## 판본 되돌리기 — 한 줄

```ts
// src/utils/vfx.ts
export const CUBE_VARIANT: CubeVariant = 'artwork';   // → 'pixel' | 'render'
```

## 파열 파동 — 절차 생성 (시트 없음)

`src/utils/vfx.ts` 의 `drawCubeWaveFrame` 이 첫 재생 때 캔버스에 그린다.
파일도 다운로드도 없다 (텍스처 160×160 × 9프레임 = 0.88MB).

```powershell
# 검수 — **게임에 나가는 그 함수를 그대로** 돌려 PNG 로 뽑는다
node scripts/run-fx-wave-preview.mjs     # → build/cube/wave_check.png
```

- 단면이 **투명 → 어두운 테두리 → 밝은 코어 → 어두운 테두리 → 투명**, 일반 블렌드.
  밝은 배경은 테두리가, 어두운 배경은 코어가 잡아 준다
- **겹 4장**을 시차(0/55/115/185ms)를 두고 쏴서 '파바방'을 만든다.
  겹의 표는 `TedAbility` 의 `WAVE_VOLLEY` 한 곳에 있다
- 두께·속도·알파를 바꾸려면 `drawCubeWaveFrame`(모양)과 `WAVE_VOLLEY`(겹)를 본다
- 옛 픽셀 판(`scripts/cube/shockwave.py`)은 배선을 끊었다. 스크립트는 남아 있어 다시 구울 수 있다
