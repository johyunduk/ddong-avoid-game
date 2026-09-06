# 나이트 검기 텍스처 (오로라)

`public/assets/fx/particles/sword-beam.png` (512×250) 의 원본과 재생성 방법.

## 왜 이렇게 만들었나

생성 모델(novaAnimeXL)에 **추상 이펙트만** 시키면 계속 다른 것을 그린다. 실제로 겪은 것:

| 프롬프트 방향 | 결과 |
|---|---|
| `crescent moon shaped energy` | 금장식 초승달 **엠블럼** |
| `sword slash energy wave` | **검 오브젝트** 일러스트 |
| `sword`·`blade` 명사 제거 | 배경·**캐릭터**로 붕괴 |
| `aurora ribbon`, `veil`, `curtain` | 베일 쓴 **캐릭터** |

통하는 어휘는 **액션 이펙트 계열**(`energy slash wave`, `plasma`, `motion energy`, `beam arc`)이다.
색·재질만 그 위에서 갈아끼운다. 그리고 **질감은 생성물에서, 형태는 스크립트에서** 가져온다 —
모델은 "검은 배경에 지나가는 발광 띠" 하나만 잘 그리면 되고, 그건 바로 나온다.

## 재생성

```bash
# 1) 재료 — 검은 배경 위 오로라 색 발광 띠
python scripts/comfyui-generate.py --workflow character --no-prefix \
  --width 1216 --height 832 --count 6 --seed random \
  --out creative/_fx/knight-beam/aurora2 \
  --prompt "masterpiece, best quality, high resolution, game vfx asset, anime special effect, single crescent energy slash wave, glowing beam arc, thin curved lens shape with sharp pointed tips, soft luminous white core, aurora colored plasma edge, teal green fading into cyan then violet and magenta, translucent silky filaments streaming off the arc, iridescent glow, tiny drifting light motes, motion energy, horizontal composition, isolated effect on pure black background, high contrast, no background details" \
  --negative "veil, curtain, dress, gown, robe, cloth, fabric, hair, character, person, human, girl, boy, face, hand, arm, silhouette, sword hilt, weapon, armor, landscape, mountain, tree, ground, horizon, stars, starfield, moon, background, scenery, sky, text, watermark, signature, logo, frame, border, grid, cluttered, blurry, low quality, worst quality, jpeg artifacts, gray background, white background"

# 2) 형태 + 색 — 띠를 수평으로 세워 잘라내고, 얕은 호로 휘고, 끝을 깎고, 색상을 가로로 흘린다
#    (Pillow + numpy 필요 → ComfyUI venv 파이썬)
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --beam creative/_fx/knight-beam/src/beam-source.webp \
  --beam-hue 20,42 --beam-sat 2.6 --beam-sat-floor 245 \
  --out-file public/assets/fx/particles/sword-beam.png
```

`src/beam-source.webp` 이 채택된 재료(aurora2 배치 03번), `src/meta.json` 에 시드가 있다.

### `--beam-hue` 가 왜 필요한가

생성물 그대로는 옅은 청록이라 **게임 배경(하늘색, 평균 192/255) 위에서 묻힌다.**
색상환에서 배경 반대쪽(보라~마젠타)까지 끌고 가야 형태가 읽힌다.
`20,42` = 붉은 주황 → 호박색. 흰 코어는 채도가 0 이라 색상을 바꿔도 흰색으로 남는다.

`--beam-sat-floor` 는 채도 하한이다. 생성물은 채도가 낮은 영역이 넓어 배율만 올리면 뿌옇게 뜬다 —
**밝고 무채색인 흰 코어만 남기고** 나머지에 하한을 줘야 색이 제대로 선다.

## 게임 쪽 규약

자체 색을 가진 에셋이라 **착색하지 않고 일반 블렌드**로 쓴다.
가산으로 올리면 밝은 하늘에서 흰색에 수렴해 사라지고, 블룸 패스까지 켜져 비싸진다.
사용처는 `src/abilities/KnightAbility.ts` 의 `BEAM_TEXTURE`.

```bash
# 코어 층 — 같은 형태를 흰 하드엣지로 (검기 위에 얇게 얹는다)
C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-particle.py \
  --beam-core public/assets/fx/particles/sword-beam.png \
  --out-file public/assets/fx/particles/sword-beam-core.png
```

### 채도를 왜 이렇게 높게 잡았나

게임에서는 검기를 **반투명(알파 0.72)** 으로 그린다. 알파를 낮추면 색이 배경(하늘색)과 섞이므로,
원본 채도가 낮으면 그대로 바래서 '흐린 그림'이 된다. 채도를 미리 끝까지 올려 둬야
투명해져도 주황이 살아남아 **비쳐 보이는 기운**으로 읽힌다.

`--beam-translucent` 옵션도 있지만(밝기를 가중치로 내부 알파를 빼는 방식) 이 텍스처에서는
흰 코어만 남고 주황이 먼저 사라져 쓰지 않는다. 반투명은 채도 + 게임 쪽 알파로 만든다.

> `src/beam-source.webp` 는 원본 PNG(1.1MB)를 압축해 보관한 것이다. 여기서 다시 뽑으면
> 픽셀 단위로 완전히 같지는 않다(평균 오차 1 미만, 눈으로는 동일). **최종 판정본은
> `public/assets/fx/particles/` 에 커밋된 텍스처**이고, 이 소스는 재작업용 재료다.
