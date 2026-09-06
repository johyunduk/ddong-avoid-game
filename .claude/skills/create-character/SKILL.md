---
name: create-character
description: 새 캐릭터의 Creative Spec 을 쓰고 ComfyUI 로 일러스트 후보를 생성한 뒤 사람의 선택을 기다린다. "여름밤 수영장 컨셉 캐릭터 만들어" 같은 컨셉 요청에 사용.
---

# create-character

컨셉 한 줄 → Creative Spec → 일러스트 후보 N장 → **사람 승인 대기**.

## 0. 컨셉 요청 확인

사용자가 심사실에서 컨셉을 적어 보냈을 수 있다. 컨셉 지시가 없거나 "요청 처리해줘" 라면 먼저 확인한다.

```bash
python scripts/review-requests.py --pending
```

처리할 요청을 고르면 `--pick <id>` 로 표시하고, 그 텍스트를 컨셉으로 삼아 아래를 진행한다.
후보 생성까지 끝나면 `--done <id> --batch <배치>` 로 닫는다.

## 1. id 정하기

`<컨셉>-<번호>` kebab-case. 예: `summer-pool-01`. 이미 `production/<id>.yaml` 이 있으면 번호를 올린다.

## 2. Creative Spec 작성

```bash
mkdir -p creative/<id>
cp creative/_template/spec.yaml creative/<id>/spec.yaml
cp production/_template.yaml production/<id>.yaml
```

`spec.yaml` 을 전부 채운다. 특히 `visual.prompt` 는 danbooru 태그 나열로 쓴다
(품질 프리픽스 `masterpiece, best quality, ...` 는 스크립트가 자동으로 붙이므로 **넣지 않는다**).

기존 캐릭터와 겹치지 않는지 `src/utils/character.ts` 의 이름·컨셉을 먼저 확인한다.

### 기존 캐릭터를 고쳐 달라는 요청일 때 (IMPORTANT)

"기존에 있는 X 좀 더 멋지게", "X 분위기만 바꿔줘" 같은 요청은 새 컨셉이 아니다.
**이미지를 보고 프롬프트를 새로 쓰지 마라.** 그 그림을 만든 원본 프롬프트가 남아 있다.

```bash
ls "C:/ComfyUI/user/default/workflows/" | grep 일러스트   # [main]일러스트_<이름>.json
```

`public/assets/illustrations/<이름>_ill.*` 와 `[main]일러스트_<이름>.json` 이 1:1로 대응한다
(ted·k·heidi·red). 워크플로의 `Positive Prompt` / `Negative Prompt` 노드를 읽어
`creative/<id>/source-prompt.txt` 로 저장하고, **그 프롬프트를 기준선으로 최소 변경만** 한다.

- 원본 네거티브에 있는 항목을 포지티브에 넣지 않는다 (예: Ted 는 `hoodie/jacket/formal suit/tie` 금지)
- 머리색·의상·배경처럼 요청이 건드리지 않은 축은 원본 그대로 둔다
- 후보 4장의 변주 폭도 좁힌다 — 시드 + 앵글 미세 변주 정도. 컨셉을 갈아엎지 않는다

원본 워크플로가 없으면 그때만 이미지에서 역추정하고, 그 사실을 spec 에 적는다.

### 컨셉을 직접 잡을 때 (요청이 `auto` 이거나 지시가 없을 때)

1. **두 곳을 모두 확인한다.** 게임에 등록된 캐릭터와, 아직 심사 중인 배치는 다르다.

```bash
python scripts/review-status.py --list     # 심사 중인 배치까지 (게임 등록 전)
```

   `src/utils/character.ts` 의 `CHARACTERS` 도 읽는다.

   **라인업에는 작명 계열이 둘 있다. 요청의 `theme` 를 따른다.**

   | theme | 계열 | 기존 예 | 새로 고를 때 |
   |---|---|---|---|
   | `it` | 개발 용어 | 루트·광부·아카이브·글리치·노이즈·로그·스왑·포크·시드·세션·센티넬·레거시 | 캐시·데몬·커널·패치·크론·뮤텍스·스레드·프록시·롤백 등 아직 안 쓴 용어 |
   | `free` | 그 외 | 치비·무기·구미·매화·나이트·K | 짧고 부르기 쉬운 한국어·일본어 어감, 식물·동물·전통 모티프. **IT 소재 금지** |

   `free` 일 때는 컨셉 자체도 사이버·해커·시스템 소재를 피한다. `theme` 이 없으면 `it` 로 본다.
2. **겹치지 않게 잡을 축**: 머리색·눈색·주 팔레트·의상 실루엣·배경 모티프.
   기존 캐릭터와 두 개 이상 겹치면 다시 잡는다.
3. 능력 훅을 한 줄로 같이 제안한다 (이름 → 능력이 자연스럽게 연결되는 것: 롤백 = 되돌리기).

### 포즈·앵글 (확정 캐릭터들이 실제로 쓰는 어휘)

**상반신 규격은 고정**이다 — 카드·상세 팝업이 그 비율을 전제로 한다. 바꾸는 건 그 안의 앵글과 자세다.

```
구도 : upper body / upper body portrait / upper body to waist
앵글 : three-quarter view / from below / from above / facing to the side / dynamic angle
시선 : looking at viewer / looking up / looking away
자세 : standing / leaning forward / arms crossed / hand raised / head tilt / sitting
```

한 배치 안에서 후보마다 다른 조합을 쓴다. 4장을 전부 `upper body, looking at viewer` 로 뽑지 않는다.

> 포즈는 **프롬프트 안에서** 바꾼다. `--models` 는 **체크포인트 비교 전용**이라
> 포즈 문구를 넣으면 안 된다 (심사실 카드에 이상한 라벨이 붙는다).
> 후보마다 포즈를 다르게 하려면 `--count 1` 로 프롬프트를 바꿔가며 여러 번 호출한다.

**네거티브에 `nsfw` 는 무조건 들어간다.** `bindings.json` 의 `negative_required` 로 강제되어
`--negative` 로 덮어써도 항상 앞에 붙는다. 이 값을 빼거나 우회하지 않는다.

`production/<id>.yaml` → `illustration.status: RUNNING`.

## 3. 후보 생성

ComfyUI 가 켜져 있어야 한다. 주소는 `COMFYUI_SERVER` 환경변수 > 후보 포트(`8188`, `8000`) 자동 탐지 순으로 잡힌다
(Comfy Desktop 은 보통 `8000`). 다른 포트면 `--server` 로 지정한다.

```bash
python scripts/comfyui-generate.py --workflow character \
  --prompt "<spec.yaml 의 visual.prompt>" \
  --count 8 \
  --out creative/<id>/candidates
```

8장 생성에 수 분 걸린다. 실패 시 최대 3회까지 재시도하고, 그래도 실패하면
`illustration.status: FAILED` 로 기록하고 멈춘다.

## 4. 심사 링크 + 알림 (자동 선택 금지)

사용자는 PC 앞에 없을 수 있다. 터미널에 목록만 뿌리고 기다리지 않는다.
후보를 Supabase Storage 에 올리고 **폰에서 열리는 심사 링크**를 푸시로 보낸다.

```bash
C:\ComfyUI\.venv\Scripts\python.exe scripts/review-upload.py ^
  --id <id>-r<라운드> ^
  --dir creative/<id>/candidates ^
  --label "<컨셉>"          # 1라운드는 컨셉 이름만. 2라운드부터 "<컨셉> · 2라운드"
```

출력된 심사 링크를 `PushNotification` 으로 보낸다 (링크 + 장수, 200자 이내).

`production/<id>.yaml` 에 `illustration.status: WAITING_APPROVAL` 과 배치 id 를 적는다.

## 5. 결정 수거와 분기

```bash
python scripts/review-status.py --id <id>-r<라운드>
```

심사실: https://ddong-review.vercel.app (목록에서 미응답/확정/수정/기각 필터로 볼 수 있다)

종료 코드 3 이면 아직 심사 중이다. 사용자가 "봤어" 같은 신호를 주기 전에는
반복 조회하지 않는다. 제출됐으면 판정별로 처리한다.

심사 결과는 **배치 단위 결정 하나**다. 후보별 판정이 아니다. 되묻지 않는다.

| 결정 | 행동 |
|---|---|
| `accept` | `selected` 를 `creative/<id>/selected.png` 로 복사하고 `illustration.status: SUCCESS`, `phase: music` |
| `revise` | `note` 를 반영해 라운드를 올려 재생성. `selected` 가 있으면 **그 시드 근처**로, 없으면 컨셉 프롬프트부터 손본다 |
| `reject` | 이 컨셉은 폐기하고 **거기서 끝낸다**. `illustration.status: REJECTED` 와 사유만 기록. **새 컨셉을 자동으로 만들지 않는다** — 새로 만드는 건 사람이 심사실 버튼으로 요청한다 |

`revise` / `reject` 는 라운드를 올려 4번(심사 링크 + 알림)을 반복한다.

선택이 확정되면:

```bash
cp creative/<id>/candidates/04.png creative/<id>/selected.png
```

`illustration: { status: SUCCESS, selected: 04.png }`, `phase: music` 으로 갱신한다.

확정 후 `PushNotification` 으로 다음 단계로 넘어간다는 것을 알린다.

## 다음

`/create-music`
