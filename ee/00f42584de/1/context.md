# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# 등급 텍스트 → 이미지 교체 계획

## Context
`public/assets/character_ranks/`에 `r.png`, `sr.png`, `ur.png` 이미지가 추가됨.
현재 R/SR/UR 등급을 텍스트로 표시하는 곳 전체를 이미지로 교체.
`등급외`는 이미지 없음 → null 처리(이미지 미표시).

---

## 1. 공통 헬퍼 추가 — `src/utils/character.ts`

```typescript
/** 등급 이미지 텍스처 키 반환. 등급외 → null */
export function getGrade...

### Prompt 2

치비도 R 등급으로 나오게 해줘. 나중에 등급이 계속 올라갈거니까 일단은 R 등급으로 해줘

### Prompt 3

캐릭터 등급 이미지가 약간 위아래로 눌려있는 느낌이라 좀 뚱뚱해 보이는데?

### Prompt 4

캐릭터 선택 화면 기준으로 너무 오른쪽에 붙어 있네 살짝 왼쪽으로 오게 하고 크기를 조금 더 키워도 될 거 같아.

### Prompt 5

이거 등급을 오른쪽 위 구석이 아니라 왼쪽 위 구석으로 옮겨줘

### Prompt 6

약간 너무 가운데쪽으로 온거 같은데 좀 더 왼쪽 위 구석으로 살짝만 옮겨줘

### Prompt 7

캐릭터 목록에서 정렬 순서를 바꾸고 싶어. 치비는 주인공이니 당연히 지급 위치 맨 처음에 나오고 그 다음 UR, SR, R 등급 순서였으면 좋겠어

### Prompt 8

깃 푸시해줘

