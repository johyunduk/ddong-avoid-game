# 무기 이펙트 텍스처

`public/assets/fx/particles/` 의 `yeoiju.png` · `lotus.png` · `bolt.png` 원본과 재생성 방법.

## 번개도 그린다

`bolt-1/2/3.png` 는 절차 생성이다.

```bash
for i in 1 2 3; do
  C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py     --bolt --bolt-seed $i --out-file public/assets/fx/particles/bolt-$i.png
done
```

ComfyUI 로 번개 재료를 뽑아 잘라 쓰는 것도 해 봤지만 버렸다 —
**획이 굵고 뭉툭해서, 좌우로 크게 흔들리게 하려고 늘리면 같이 뚱뚱해진다.**
얇은 획 + 큰 흔들림을 동시에 얻으려면 그리는 수밖에 없다.

### 지그재그를 잡는 규칙

- **매 마디 무작위**로 흩뿌리면 흔들리기만 하고 지그재그로 안 읽힌다
- **매 마디 정확히 교대**시키면 스프링·코일처럼 보인다
- → 78% 확률로 교대하고, 마디 간격도 고르지 않게 두고,
  꺾이는 폭은 **대부분 작게(0.12~0.45) 가끔 크게(0.6~1.0)** 준다
- **가지도 지그재그여야 한다.** 곧게 뻗은 가지는 번개가 아니라 나뭇가지로 보인다 —
  가지마다 각도를 크게 꺾어 걷고(`zigzag`), 60% 확률로 잔가지가 한 번 더 갈라진다

흰색이라 착색만으로 성격이 갈린다 — 검붉은 번개(`0x8a0f0f`)와 황금 번개(`0xffbb00`)가
같은 텍스처에서 나온다. **시드가 다른 세 장을 번갈아 쓴다** — 같은 그림이 반복되면
'깜빡임'이 아니라 '한 줄기가 흐려지는 것'으로 보인다.

## 연꽃

```bash
# 연꽃 — 부활 연출
python scripts/comfyui-generate.py --workflow character --no-prefix \
  --width 1024 --height 1024 --count 5 --seed random --out creative/_fx/mugi/lotus \
  --prompt "masterpiece, best quality, high resolution, game vfx asset, a single white lotus flower fully bloomed seen from the side, luminous translucent petals fanning upward, soft golden glow at the center, ethereal light, centered, isolated on pure black background, high contrast, no background details" \
  --negative "character, person, hand, pond, water, leaf, stem, vase, pot, ground, text, watermark, signature, logo, frame, border, multiple flowers, cluttered, blurry, low quality, worst quality, gray background, white background"

# 알파 컷아웃
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --cutout creative/_fx/mugi/src/yeoiju-source.webp --cutout-disc 0.30 --cutout-size 192 \
  --out-file public/assets/fx/particles/yeoiju.png
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --cutout creative/_fx/mugi/src/lotus-source.webp --cutout-size 256 \
  --out-file public/assets/fx/particles/lotus.png
```

`--cutout-disc`(본체가 어두운 대상용, 중심 원 안쪽을 불투명으로 유지)는 연꽃엔 필요 없다 —
꽃잎이 밝아 밝기만으로 깔끔하게 따진다. 여의주 생성물에 써 봤지만 결국 절차 생성으로 갈아탔다.

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
