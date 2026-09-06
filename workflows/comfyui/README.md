# workflows/comfyui

ComfyUI 워크플로 원본(JSON)과 노드 바인딩.

| 파일 | 설명 |
|---|---|
| `character.json` | 캐릭터 일러스트 (WAI-SHUFFLE-NOOB vPred, 1024x1536 → 1.5배 업스케일) |
| `bindings.json` | 스크립트가 패치할 노드/입력 위치 정의 |

## 원칙

- Claude 는 **워크플로 그래프를 새로 만들지 않는다.** 프롬프트/시드/사이즈 등 파라미터만 정한다.
- 새 워크플로를 추가할 때는 ComfyUI 에서 저장한 JSON 을 이 디렉터리에 넣고
  `bindings.json` 에 키를 추가한다. API 포맷 변환은 스크립트가 자동으로 한다.

## bindings.json 문법

값은 `"<노드ID>.<입력이름>"` 형식이며 배열로 여러 노드에 동시에 적용할 수 있다.

```json
"seed": ["6.seed", "8.seed"],
"derived": [{ "target": "7.width", "from": "width", "scale": 1.5 }]
```

`derived` 는 다른 값에서 파생되는 입력(업스케일 해상도 등)을 자동 계산한다.

## 실행

```bash
python scripts/comfyui-generate.py --workflow character \
  --prompt "1girl, solo, ..." --count 8 --out creative/<id>/candidates
```

`--dry-run` 으로 실제 큐 등록 없이 변환된 API JSON 만 확인할 수 있다.
(변환에는 실행 중인 ComfyUI 의 `/object_info` 가 필요하므로 서버는 켜져 있어야 한다.)
