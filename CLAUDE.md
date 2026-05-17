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

대상: `gacha-pull`, `leaderboard-submit`, `leaderboard-top`, `skor-submit`

## Wiki

프로젝트 지식 베이스: `~/Documents/Obsidian/1. Projects/똥피하기/`
- 구현 현황·설계 문서·기획안은 모두 Obsidian에서 관리
- 스키마: 해당 폴더의 `WIKI.md` 참고
- 새 기능 구현 후 "ingest 해줘" 로 wiki 갱신 요청 가능
