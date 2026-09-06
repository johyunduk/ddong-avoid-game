---
name: review
description: Herdr 의 Codex 리뷰어 에이전트에게 현재 diff 리뷰를 맡기고, FAIL 이면 수정 후 재검증을 최대 3회 반복한다.
---

# review

Claude 는 구현자, Codex 는 독립 검증자다. **Codex 는 코드를 수정하지 않는다.**

## 리뷰어 확인

```bash
herdr agent list
```

`reviewer` (kind: codex, 워크스페이스 `검증·Codex`) 가 idle 인지 확인한다.
없으면 워크스페이스의 셸 페인에서:

```bash
herdr agent start reviewer --kind codex --pane w4:p1
```

## 리뷰 요청

리뷰 대상은 커밋되지 않은 변경분이다. 먼저 `git status` 로 diff 가 있는지 확인한다.

```bash
herdr agent prompt reviewer "AGENTS.md 의 리뷰 계약에 따라 git diff 를 리뷰하라. 코드는 수정하지 말고, 마지막 줄에 PASS / PASS WITH ISSUES / FAIL 중 하나만 단독 출력하라." --wait --timeout 600000
herdr agent read reviewer --source recent-unwrapped --lines 200
```

응답이 잘려 보이면 리뷰어에게 결과를 임시 디렉터리의 Markdown 파일로 쓰고
경로만 답하게 한 뒤 그 파일을 읽는다.

`blocked` 로 돌아오면 승인 UI 가 떠 있는 것이다. `herdr agent get reviewer` 로
무엇을 묻는지 확인하고 **사용자에게 물어본 뒤** 답한다. 임의로 승인하지 않는다.

## 판정 처리

- `PASS` → `review: { status: SUCCESS, verdict: PASS }`, `phase: social`
- `PASS WITH ISSUES` → 지적을 반영한 뒤 재검증. 사소하면 사용자에게 알리고 진행 여부를 묻는다.
- `FAIL` → 지적 사항을 수정하고 `.\scripts\verify.ps1` 통과 후 다시 리뷰 요청.
  `review.iterations` 를 올린다.

`iterations` 가 `max_iterations`(3) 에 도달하면 더 반복하지 말고
`review.status: BLOCKED` 로 기록한 뒤 남은 지적 사항을 정리해 사용자에게 넘긴다.

## 다음

`/create-social`
