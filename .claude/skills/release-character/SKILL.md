---
name: release-character
description: 캐릭터 하나를 컨셉부터 공개까지 끌고 가는 상위 워크플로. production/<id>.yaml 상태를 보고 다음 단계 스킬을 순서대로 실행하며 승인 지점에서 멈춘다.
---

# release-character

하나의 거대한 프롬프트로 돌리지 않는다. **상태를 보고 다음 하위 스킬 하나를 실행**하고,
승인 지점에서는 반드시 멈춘다.

```
/create-character
      ↓  [일러스트 승인]
/create-music
      ↓  [음악 승인]
/integrate-character
      ↓
/review          ← FAIL 이면 수정 후 재검증 (최대 3회)
      ↓
/create-social
      ↓  [공개 승인]
/publish
```

## 진행 방법

1. `production/<id>.yaml` 을 읽는다. 없으면 `/create-character` 부터 시작.
2. `phase` 와 각 단계 `status` 로 다음 할 일을 정한다.

| 상태 | 행동 |
|---|---|
| `WAITING_APPROVAL` | **멈추고** 사용자에게 선택/승인을 요청한다 |
| `FAILED` / `BLOCKED` | 다음 단계로 넘어가지 않는다. 원인을 보고한다 |
| `REJECTED` | 같은 단계를 파라미터를 바꿔 다시 실행 |
| `SUCCESS` | 다음 단계 스킬 실행 |

3. 한 단계가 끝날 때마다 `production/<id>.yaml` 을 갱신하고 `log:` 에 한 줄 남긴다.

## 사람 승인 지점 (3곳, 자동화 금지)

- 최종 일러스트 선택
- 최종 음악 선택
- 최종 공개(PUBLISH)

## Herdr 역할

| 워크스페이스 | 에이전트 | 담당 |
|---|---|---|
| `제작·Claude` (w3) | `builder` | 구현·창작 |
| `검증·Codex` (w4) | `reviewer` | 리뷰 (`/review`) |
| `실행·Grok` (w5) | `operator` | ComfyUI·ffmpeg·배포 실행 |

오퍼레이터 에이전트가 없으면 스크립트를 이 세션에서 직접 실행해도 된다.
