# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# 신규 유저 5000 SKOR 웰컴 보너스

## Context
처음 게임에 접속하는 유저에게 SKOR 5000개를 무료 지급.
신규 유저는 `user_skor` 테이블에 행이 없으므로, 첫 잔액 조회(`getSkorBalance`) 시 이를 감지하여 5000으로 초기화.

---

## 수정 파일
- `src/utils/skor.ts` — `getSkorBalance()` 내 신규 유저 분기 수정

---

## 구현

### 현재 코드
```typescript
// data가 null이면 신규 유저 → balanc...

### Prompt 2

user_skor 에서 {code: "42501", details: null, hint: null,…}
code
: 
"42501"
details
: 
null
hint
: 
null
message
: 
"new row violates row-level security policy for table \"user_skor\"" 이 에러는 왜 뜨는거지?

### Prompt 3

{code: "42501", details: null, hint: null,…}
code
: 
"42501"
details
: 
null
hint
: 
null
message
: 
"new row violates row-level security policy for table \"user_skor\"" 이거 계속 뜨는데?

### Prompt 4

메뉴에 안보이는데 최신화 해서 알려줄래?

### Prompt 5

저거 쿼리 success 떴는데도 403 에러 그대로 나는데?

### Prompt 6

[SKOR] 신규 유저 감지, userId: 7dffa262-57a6-4f8d-83dc-d9c5f1918702 session: 
[SKOR] INSERT 결과 error: null

### Prompt 7

그래서 내가 뭘 해줘야 하는데?

### Prompt 8

됐네 이거 깃 푸시 해줘

### Prompt 9

다 같이 올려.

