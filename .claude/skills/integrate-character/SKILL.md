---
name: integrate-character
description: 승인된 일러스트/음악을 게임 에셋으로 변환해 배치하고, src/utils/character.ts 에 캐릭터를 등록한 뒤 verify.ps1 로 검증한다.
---

# integrate-character

전제: `illustration.status == SUCCESS` **그리고** `music.status == SUCCESS`.

## 1. 에셋 배치

이 저장소의 실제 경로 규약 (`public/` 기준):

| 용도 | 경로 | 비고 |
|---|---|---|
| 인게임 스프라이트 | `public/assets/players/<id>_front.webp` | `_left`, `_right` 도 함께 |
| 카드/상세 일러스트 | `public/assets/illustrations/<id>.webp` | |
| BGM | `public/assets/bgms/<id>.mp3` | |
| 가챠/상세 영상 | `public/assets/vids/<id>.mp4` | 선택 |

- 일러스트 → webp 변환·리사이즈, 스프라이트는 배경 제거가 필요하다.
  저장소 루트의 `remove_background.py` / `scripts/optimize-images.sh` 를 참고한다.
- 용량을 확인한다. 기존 에셋과 자릿수가 다르게 크면 최적화한다.

## 2. 캐릭터 등록

`src/utils/character.ts` 의 `CHARACTERS` 배열에 `CharacterDef` 를 추가한다.
등급 그룹(등급외 / UR / …) 위치에 맞춰 넣고, 필드는 기존 항목 형식을 그대로 따른다.

능력 설명은 `src/config/abilityParams.ts` 에 `<ID>_DESC` 를 추가하고 import 해서 쓴다
(문자열 리터럴을 character.ts 에 직접 박지 않는다).

특수 능력이 실제 게임 로직을 필요로 하면 `src/abilities/` 의 기존 구현을 참고해 추가한다.

## 3. 불변 규칙 (CLAUDE.md)

- 씬 재시작 시 `init()` 에서 상태 변수 초기화
- 씬 전환 전 `this.sound.stopAll()`
- 점수 변경은 `updateScore(amount)` 로만
- 충돌은 `physics.add.overlap()`
- 타입 import 는 `import { type Foo }`, `enum`/`namespace` 금지

## 4. 검증

```powershell
.\scripts\verify.ps1
```

PASS 가 아니면 고치고 다시 돌린다. 통과하면
`game: { status: SUCCESS }`, 에셋 경로 기록, `phase: review`.

## 다음

`/review`
