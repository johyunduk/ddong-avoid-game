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

`ModeSelectScene` → `DifficultySelectScene` → `GameScene` → (게임 오버) → `ModeSelectScene`
`LeaderboardScene` / `CharacterSelectScene` / `GachaScene` / `StoryLogScene` 은 독립 진입

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
```

대상: `gacha-pull`, `leaderboard-submit`, `leaderboard-top`, `skor-submit`, `review`

## Wiki

프로젝트 지식 베이스: `~/Documents/Obsidian/1. Projects/똥피하기/`
- 구현 현황·설계 문서·기획안은 모두 Obsidian에서 관리
- 스키마: 해당 폴더의 `WIKI.md` 참고
- 새 기능 구현 후 "ingest 해줘" 로 wiki 갱신 요청 가능

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

일러스트 후보 심사는 Supabase 로만 처리한다 (Vercel 불필요).

```bash
# 후보 업로드 → 폰에서 열리는 심사 링크 발급 (Pillow 필요 → ComfyUI venv 파이썬)
C:\ComfyUI\.venv\Scripts\python.exe scripts/review-upload.py --id <배치> --dir <후보디렉터리>
# 판정 조회 (종료 코드 3 = 아직 심사 중)
python scripts/review-status.py --id <배치>
# 심사실에서 올라온 컨셉 요청
python scripts/review-requests.py --pending
```

심사실: https://ddong-review.vercel.app (Vercel · SSO 보호 + 심사 키)
상태는 Storage `review/<배치>/batch.json`, 컨셉 요청은 `review/_requests/*.json` — 테이블 없음.

## 에이전트 역할 (Herdr)

이 저장소에는 역할이 다른 에이전트가 동시에 붙어 있다. **자기 역할 밖의 일은 하지 않는다** —
필요하면 큐를 통해 담당 에이전트로 간다. 자기가 어디인지는 `echo $HERDR_WORKSPACE_ID` 로 확인한다.

| 워크스페이스 | 에이전트 | 담당 | 하지 않는 것 |
|---|---|---|---|
| w1 `총괄·디렉터` | 사람과 직접 대화 | 기획·판단·구조 변경 | — |
| w2 `구현·Claude` | `integrator` | `/integrate-character`, 에셋 배치, `character.ts` 등록, `verify.ps1`, Codex 리뷰 반영 | 컨셉·이미지 생성 |
| w3 `제작·Claude` | `builder` | `/create-character`, 컨셉·프롬프트, ComfyUI 생성, 심사 업로드, 능력 제안 | 게임 코드 수정 |
| w4 `검증·Codex` | `reviewer` | `AGENTS.md` 의 리뷰 계약 | 코드 수정 |
| w5 `실행·워커` | 파이썬 스크립트 | 큐 조회 → 담당 에이전트 호출 | 판단 |
| w6 `문서·Claude` | `scribe` | 릴리스 노트, 문서와 실제 동작의 불일치 정리 | 기능 구현 |
| w7 `연출·Claude` | `fx` | 게임필·VFX — 이펙트 재생 레이어, 파티클, 임팩트(히트스톱·셰이크), 애니메이션 상태머신 | 캐릭터 등록·컨셉 생성 |

작업 지시는 워커가 `herdr agent prompt` 로 보낸다. 지시에 필요한 명령이 다 들어있으므로 그대로
따르되, **사람 판단이 필요한 지점(후보 선택·능력 확정·공개)은 멈추고 심사실로 넘긴다.**
심사실: https://ddong-review.vercel.app

Herdr 워크스페이스: `총괄·디렉터`(w1) / `구현·Claude`(w2) / `제작·Claude`(w3) /
`검증·Codex`(w4) / `실행·워커`(w5) / `문서·Claude`(w6) / `연출·Claude`(w7)
