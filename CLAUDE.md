# CLAUDE.md

Phaser 3 하이퍼 캐주얼 게임 ("똥 피하기 게임"). Toss 인앱 통합 대상.

## 명령어

```bash
npx tsc --noEmit   # 타입 검사 (코드 변경 후 항상 실행)
npm run build      # 프로덕션 빌드
```

> **`npm run dev`는 자동 실행 금지** — 개발자가 직접 실행함

## TypeScript 제약 (IMPORTANT)

프로젝트는 `verbatimModuleSyntax` + `erasableSyntaxOnly` 를 사용함.

- 타입 import는 반드시 `type` 키워드: `import { type Foo } from '...'`
- `enum` / `namespace` 사용 금지 → `export const Foo = { ... } as const` 사용
- 위반 시 빌드 에러. 변경 후 반드시 `npx tsc --noEmit` 확인.

## 씬 흐름

`BootScene`(글꼴 로드) → `ModeSelectScene` → `DifficultySelectScene` → `GameScene` → (게임 오버) → `ModeSelectScene`
`LeaderboardScene` / `CharacterSelectScene` / `GachaScene` / `ReleaseNotesScene` 은 독립 진입

등록된 씬 전부는 `src/main.ts` 의 `scene: [...]` 가 기준이다.

## 필수 불변 규칙 (YOU MUST)

1. **씬 재시작 시** `init()`에서 상태 변수 초기화 (score, gameOver, difficultyLevel 등)
   — 클래스 프로퍼티는 씬 재시작 후에도 유지되므로 반드시 명시 초기화
2. **씬 전환 전** `this.sound.stopAll()` 호출 — 누락 시 BGM 중복 재생
3. **점수 변경** 시 `this.score +=` 직접 사용 금지 → `updateScore(amount)` 사용
   — 직접 변경 시 금똥/다이아똥/토파즈똥 생성 트리거가 누락됨
4. **충돌 감지** 는 `physics.add.overlap()` 사용 — `collideWorldBounds` 아님

## Supabase Edge Function 배포

```bash
supabase functions deploy <name> --no-verify-jwt
ls supabase/functions/          # 배포 대상 = 여기 있는 디렉터리 전부 (단일 진실)
```

목록을 여기 베껴 두면 낡는다 — 한 번 5개로 굳어 넷이 빠졌다. 위 디렉터리가 기준이다.
게임에서 부르는 곳은 `supabase.functions.invoke('<이름>')` 로만 찾는다.

```bash
grep -rn "functions.invoke(" src/
```

> `battle-leaderboard-top` 은 `leaderboard-top` 을 부분 문자열로 포함한다.
> 맨 이름으로 grep 하면 잘못 걸리니 위처럼 호출 형태째로 본다.
> `battleTier.ts` 의 언급은 주석 참조지 호출이 아니다.
>
> `review` 만 게임이 아니라 심사실이 쓴다 — `scripts/review-*.py`·`worker.py`·
> `review-site/index.html` 이 `/functions/v1/review` 로 직접 친다. 위 grep 에 안 잡히지만 살아 있다.

## Wiki

프로젝트 지식 베이스: `~/Documents/Obsidian/1. Projects/똥피하기/`
- 구현 현황·설계 문서·기획안은 모두 Obsidian에서 관리
- 스키마: 해당 폴더의 `WIKI.md` 참고
- 새 기능 구현 후 "ingest 해줘" 로 wiki 갱신 요청 가능

## 이펙트 화풍 (YOU MUST)

**이 저장소는 픽셀아트 캐릭터 + 애니풍 2D 이펙트를 섞어 쓴다.**
이펙트를 픽셀아트로 만들어도, 실사 렌더로 만들어도 안 된다.

- **오브젝트는 하드 엣지, 발광은 부드럽게 쌓는다.** 캐릭터·체스말 같은 오브젝트와
  `lotus`·`foxfire`·`kbeam` 같은 발광은 반투명 비율이 자릿수로 갈린다
- **"픽셀아트로 보이는 것"은 저해상도 블록이 아니라 하드 엣지 + 좁은 팔레트에서 온다.**
  확대된 픽셀 블록은 이 저장소 어디에도 없다
- **만들기 전에 기존 시트를 직접 열어본다** — `public/assets/fx/sheets/` 의
  `foxfire`·`lotus`·`kbeam`. 생성 모델에는 말로 쓰지 말고 **참조 이미지를 첨부**한다
- **검수는 실제 게임 표시 크기로 줄여서 한다.** 그 크기에서 실루엣과 구조가 안 읽히면
  재질 디테일은 의미가 없다. 실패 신호: 대리석 결·피사계심도·필름 그레인·얇은 체크 타일

전문은 Notion 아트 바이블. 저장소 안의 경위와 판단 근거는 `docs/fx-ted-cube-remake.md`.

> 이 규칙이 없어서 기준 이미지가 실사 3D 제품 렌더로 나왔고 아무 관문에서도 안 걸렸다.
> 게임 표시 크기로 줄이자 전부 노이즈로 뭉개졌다. 화풍을 말로만 지정하면 또 샌다.

## 콘텐츠 제작 파이프라인 (Herdr)

캐릭터 하나를 컨셉 → 일러스트 → 음악 → 게임 구현 → 리뷰 → SNS → 공개까지 잇는 워크플로.
자세한 절차는 `.claude/skills/` 의 각 스킬과 `AGENTS.md`(Codex 리뷰 계약) 참고.

```
/release-character   상위 워크플로 (아래를 상태 기반으로 순차 실행)
  /create-character → [일러스트 승인] → /create-music → [음악 승인]
  → /integrate-character → /review → /create-social → [공개 승인] → /publish
```

| 경로 | 용도 |
|---|---|
| `production/<id>.yaml` | 단계별 상태 (단일 진실) |
| `creative/<id>/` | spec.yaml · 가사 · Suno 스타일 · 후보 이미지 |
| `workflows/comfyui/` | ComfyUI 워크플로 원본 + 노드 바인딩 |
| `release/social/<id>/` | SNS 영상·썸네일·메타데이터 |

```bash
python scripts/comfyui-generate.py --workflow character --prompt "..." --out creative/<id>/candidates
python scripts/build-social.py --id <id> --illust ... --gameplay ... --music ... --name "..."
```
```powershell
.\scripts\verify.ps1   # 타입 검사 + 빌드 + 에셋 참조. Codex 리뷰 전 필수
```

심사실은 후보 심사 · 컨셉 요청 · **테마곡 주문** 세 가지를 한 페이지에서 처리한다.
테마곡은 게임에 이미 등록된 캐릭터가 대상이고, 명단은 PC 가 밀어 넣는다.

```bash
C:\ComfyUI\.venv\Scripts\python.exe scripts/publish-roster.py  # 캐릭터 등록 후 1회
python scripts/publish-models.py                                 # 체크포인트 추가 후 1회
python scripts/music-order.py --pending                          # 곡 주문 큐
```

워커는 **라인을 나눠 두 개 돌린다.** `tick()` 이 보낸 작업이 다 끝날 때까지
기다리기 때문에, 하나로 돌리면 캐릭터 생성 10분 동안 곡 주문이 큐에 앉아 있는다.

```bash
python scripts/worker.py --queues character   # w5:p1
python scripts/worker.py --queues music       # w5:p2
```

Suno 는 공개 API 가 없어 브라우저로 몬다. 호출은 `scripts/suno-submit.py` 한 곳으로만 —
공식 API(`platform.suno.com`)가 열리면 그 파일만 바꾼다.
**음원은 저장하지 않는다** — 심사실에는 Suno 공유 링크만 올라가고 사람이 거기서 듣는다.

**일러스트 후보는 심사실에 올리지 않는다 (2026-09-17).** ComfyUI 출력 디렉터리
(`C:\ComfyUI\output\herdr\<id>\`)에 두고 사람이 직접 열어 보고 말로 판정한다.
에이전트는 경로와 파일 목록만 보고한다 — 절차는 `.claude/skills/create-character/SKILL.md` §3~§5.

> 그전에는 같은 이미지가 세 벌(ComfyUI 출력 · `creative/<id>/candidates/` · Supabase)로
> 불어났고 기각마다 세 곳을 지워야 했다. `scripts/review-upload.py` 는 남겨 뒀지만
> 이 흐름에서는 쓰지 않는다.

심사실이 계속 맡는 것은 **컨셉 요청 · 테마곡 주문 · 캐릭터 설정 선택** 셋이다.

```bash
# 심사실에서 올라온 컨셉 요청
python scripts/review-requests.py --pending
# 이미 올라가 있는 배치의 판정 조회 (종료 코드 3 = 아직 심사 중)
python scripts/review-status.py --id <배치>
```

심사실: https://ddong-review.vercel.app (Vercel · SSO 보호 + 심사 키)
상태는 Storage `review/<배치>/batch.json`, 컨셉 요청은 `review/_requests/*.json` — 테이블 없음.

## 에이전트 역할 (Herdr)

이 저장소에는 역할이 다른 에이전트가 동시에 붙어 있다. **자기 역할 밖의 일은 하지 않는다** —
필요하면 총괄(w1 `director`)에게 넘긴다.

**명단은 `docs/team/roster.json` 하나다.** 자리별 담당은 `docs/team/<이름>.md`. 여기 표로 베끼지 않는다.

- 역할은 기억이 아니라 **주입**이다 — SessionStart 훅(`scripts/team-role.py`)이
  `HERDR_WORKSPACE_ID` 로 명단을 찾아 시작·`/clear`·대화 요약 때마다 역할 문서를 넣는다
- 워크스페이스를 명단대로 맞추려면 `python scripts/team-up.py` (`--check` 는 보고만).
  세션이 이상하면 고치지 말고 이걸 다시 돌린다
- 일은 총괄이 `herdr agent prompt <이름>` 으로만 보낸다. 워커(w5)는 에이전트가 아니다 — 지시를 받지 못한다

> 한때 역할이 이 파일의 공용 표에만 있었고 에이전트에 이름이 하나도 붙어 있지 않았다.
> 워커는 대상을 못 찾아 헛돌았고, 새 세션은 자기가 누군지 몰랐다 (2026-09-28 재편).

### 브라우저는 자원 잠금이지 역할이 아니다

**Chrome 은 이 기계에 하나뿐이다. 동시에 두 에이전트가 잡으면 서로의 탭·포커스를 덮어쓴다.**
그래서 **한 번에 한 에이전트만** 브라우저를 쓴다. **누가 잡을지는 총괄(w1)이 정한다.**

- 브라우저가 필요하면 **먼저 총괄에게 말한다.** 임의로 잡지 않는다
- 이 잠금은 **역할 배정이 아니다.** 이미지 생성은 w3 제작의 일이고, 곡 생성은 w8 음악의 일이다.
  브라우저를 쓴다는 이유로 일이 남의 역할로 넘어가면 안 된다

> 한때 이 규칙이 "브라우저를 모는 것은 composer 뿐" 으로 쓰여 있었다. 그래서 **이미지 생성이
> 음악 담당에게 가는** 구조가 됐다. 자원 제약을 역할로 적으면 이렇게 된다.

### 사람 판단 지점에서는 멈춘다

지시에 필요한 명령이 다 들어있으므로 그대로 따르되,
**사람 판단이 필요한 지점(후보 선택·능력 확정·공개·법무·배포)은 멈추고 넘긴다.**
심사실: https://ddong-review.vercel.app

세 갈래다 — **인증이 사람 것**(로그인·결제·Vercel) / **판단이 사람 것**(채택·공개) /
**직접 봐야 하는 것**(실기 확인). 자세한 절차는 Notion 운영 런북.

### 값을 복사하지 마라

다른 문서의 수치를 베껴 적으면 반드시 낡는다. **경로를 가리켜라.**
실제로 `robotFrame` 이 120→132→160 으로 바뀌는 동안 낡은 132 가 메모 → 지시 → 문서로 번진 적이 있다.
