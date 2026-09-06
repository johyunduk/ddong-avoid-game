# AGENTS.md

Phaser 3 하이퍼 캐주얼 게임 ("똥 피하기"). 이 파일은 **Codex CLI(리뷰어 역할)** 를 위한 것이다.
게임 구현 규칙은 `CLAUDE.md` 를 함께 읽는다.

## 역할 분담 (YOU MUST)

| 에이전트 | Herdr 워크스페이스 | 역할 |
|---|---|---|
| Claude Code | `제작·Claude` (w3) | 설계·구현·창작물 작성. **유일한 코드 작성자** |
| Codex CLI | `검증·Codex` (w4) | 독립 검증. **코드를 직접 수정하지 않는다** |
| Grok / 스크립트 | `실행·Grok` (w5) | ComfyUI·ffmpeg·배포 등 실행/정리 |

Codex 는 문제를 발견하면 수정하지 말고 리뷰 결과만 반환한다. 수정은 Claude 가 한다.

## 리뷰 계약

리뷰 요청을 받으면 `git diff` 를 대상으로 아래 순서로 검토하고,
마지막 줄에 판정 하나만 단독으로 출력한다.

1. Architecture — 씬 흐름/책임 분리
2. Bug — 런타임 오류, 널 참조, 비동기 경합
3. 게임 로직 — 점수/난이도/충돌 판정
4. Asset 참조 — `public/` 아래 실제 파일 존재 여부
5. 성능 — 매 프레임 할당, 미해제 타이머·트윈·이벤트 (메모리 누수)
6. Security — 키 노출, Edge Function 입력 검증

판정:

```
PASS
PASS WITH ISSUES
FAIL
```

`FAIL` 이면 각 항목을 `파일:라인 — 문제 — 근거` 형식으로 적는다. 추측성 지적은 넣지 않는다.

## 이 저장소에서 특히 자주 깨지는 것 (중점 확인)

- 씬 재시작 시 `init()` 에서 상태 초기화 누락 (클래스 프로퍼티는 유지된다)
- 씬 전환 전 `this.sound.stopAll()` 누락 → BGM 중복 재생
- `this.score +=` 직접 변경 → `updateScore(amount)` 를 써야 금똥/다이아똥 트리거가 동작
- 충돌은 `physics.add.overlap()` 사용
- `verbatimModuleSyntax` + `erasableSyntaxOnly`: 타입 import 는 `import { type Foo }`, `enum`/`namespace` 금지
- `src/utils/character.ts` 의 `imagePath`/`illustPath`/`videoPath` 가 가리키는 파일이 실제로 있는지

## 검증 명령

```powershell
.\scripts\verify.ps1        # 타입 검사 + 빌드 + 에셋 참조 (전체)
.\scripts\verify-fast.ps1   # 타입 검사만
```

`npm run dev` 는 실행하지 않는다 (개발자가 직접 띄운다).
