# 무기 이펙트 텍스처

`public/assets/fx/particles/yeoiju.png` 원본과 재생성 방법.
번개와 연꽃은 프레임 시트로 옮겨 갔다 — `../bolt-sheet/` · `../lotus-sheet/`.

## 번개는 프레임 시트로 옮겼다

절차 생성 번개(`--bolt`, 시드 3변형)를 만들어 썼지만 버렸다 —
생성 모델이 프레임마다 다른 경로를 한 번에 그린다. `../bolt-sheet/README.md`.

지그재그를 손으로 맞추던 규칙은 기록으로 남긴다:
매 마디 무작위면 흔들리기만 하고, 매 마디 정확히 교대하면 스프링이 된다.
78% 확률로 교대하고, 마디 간격을 고르지 않게 두고, 꺾이는 폭은 대부분 작게 가끔 크게.

## 연꽃은 프레임 시트로 옮겼다

정지 컷아웃 한 장을 키워서 '피는 것처럼' 보이게 하던 것을 버리고,
피어나는 과정이 들어 있는 8프레임 시트로 바꿨다 — `../lotus-sheet/README.md`.

## 여의주는 그린다

```bash
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py   --orb --orb-size 192 --out-file public/assets/fx/particles/yeoiju.png
```

## 두 번 고친 것 (같은 실수 반복 금지)

**여의주는 생성물로 만들지 않는다.** ComfyUI 로 뽑으면 불꽃·연기가 붙어
인게임 크기(30px 안팎)에서 뭉개져 "여의주 느낌이 사라졌다"는 소리를 듣는다.
`--orb` 로 절차 생성한다 — 어두운 본체 · 속에서 타는 빛 · 왼쪽 위 흰 반사.
원본 구현이 fillCircle 여섯 번으로 만들던 읽기를 그대로 한 장에 굽는 것이다.

**번개는 띠를 넓게 잘라야 한다.** `--beam-band` 기본값(96)으로 자르면 지그재그가
납작하게 눌려 인게임에서 직선으로 보인다. 300 으로 잡고, 게임 쪽 `thickness` 를
120px 쯤 주면 원본의 ±70px 흔들림이 살아난다.

**낙뢰는 좌우를 뒤집어야 한다.** `--beam-tip` 은 시작(x=0)을 굵게 만드는데
`beam()` 의 시작점은 하늘이다. 그대로 쓰면 하늘이 굵고 착지점이 가늘어진다 —
처리 후 좌우 반전해서 **착지점이 굵도록** 넣는다.

```bash
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --beam creative/_fx/sentinel-arc/src/beam-source.webp \
  --beam-arc 0 --beam-tip --beam-band 300 --beam-sat 0.12 --beam-start-fade 0.14 \
  --out-file <임시>.png
# → 좌우 반전 후 public/assets/fx/particles/bolt.png

C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --orb --orb-size 192 --out-file public/assets/fx/particles/yeoiju.png
```

### 반투명

번개 본체는 알파 0.62 로 비쳐 보이게 하되 **얇은 코어(두께 0.45배)는 진하게 남긴다.**
통째로 낮추면 하늘색에 섞여 바랜 그림이 되고, 코어를 남기면 몸통 너머로 배경이
비치면서도 줄기 형태는 또렷하다. (같은 원리를 나이트 검기에서도 썼다 —
`../knight-beam/README.md` 의 "채도를 왜 이렇게 높게 잡았나")
