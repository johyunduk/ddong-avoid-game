# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# 플랜: 미보유 캐릭터 로컬스토리지 변조 방어

## Context
`getSelectedCharacter()`는 localStorage를 검증 없이 그대로 읽으며, `GameScene.init()`도 소유 여부를 확인하지 않는다.
→ 브라우저 콘솔에서 `localStorage.setItem('selectedCharacter', 'legacy')` 한 줄로 미보유 UR 캐릭터의 능력(피버 타임, 점수 1.2배 등)을 무료로 사용할 수 있다.

## 수정 범위 (2개 파일)

### 1. `src/utils/char...

### Prompt 2

현재 캐릭터를 이미지가 사이즈들이 전부 다른가?

### Prompt 3

얘네 전부 백업해두고 통일 시켜줄 수 있어?

### Prompt 4

[Request interrupted by user for tool use]

