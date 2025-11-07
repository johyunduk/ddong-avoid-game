# 랭킹 시스템 구현 문서

## 📋 목차
- [시스템 개요](#시스템-개요)
- [아키텍처](#아키텍처)
- [데이터 흐름](#데이터-흐름)
- [API 명세](#api-명세)
- [프론트엔드 통합](#프론트엔드-통합)
- [Redis 데이터 구조](#redis-데이터-구조)

---

## 시스템 개요

### 기술 스택
- **데이터베이스**: Upstash Redis (서버리스)
- **백엔드**: Vercel Serverless Functions
- **프론트엔드**: TypeScript + Phaser 3
- **사용자 식별**: localStorage 기반 UUID
- **사용자 표시**: 3자리 영어 대문자 이니셜 (예: ABC)

### 주요 특징
- ✅ 난이도별 독립 리더보드 (EASY, NORMAL, HARD, EXTREME)
- ✅ 실시간 순위 조회
- ✅ **로컬 최고 점수 초과 시에만 서버 전송** (비용 최적화)
- ✅ 최고 점수만 저장 (중복 제출 시 높은 점수만 업데이트)
- ✅ 익명 사용자 지원 (별도 로그인 불필요)
- ✅ 3자리 이니셜 시스템 (아케이드 게임 스타일)
- ✅ 서버리스 아키텍처 (무한 확장 가능)

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        게임 클라이언트                        │
│                     (Phaser 3 Game Scene)                    │
│                                                               │
│  1. 게임 플레이                                               │
│  2. 게임 오버 발생                                            │
│  3. submitScore() 호출 ──────────────┐                       │
│                                        │                      │
└────────────────────────────────────────┼──────────────────────┘
                                         │
                                         ▼ HTTP POST
                    ┌─────────────────────────────────────┐
                    │   Vercel Serverless Function        │
                    │   /api/leaderboard/submit.ts        │
                    │                                     │
                    │  1. 입력 검증                       │
                    │  2. 기존 점수 조회                  │
                    │  3. 높은 점수만 업데이트            │
                    │  4. 순위 계산 후 반환               │
                    └──────────────┬──────────────────────┘
                                   │
                                   ▼ Redis Commands
                    ┌─────────────────────────────────────┐
                    │      Upstash Redis Database         │
                    │                                     │
                    │  Sorted Set:                        │
                    │  - leaderboard:EASY                 │
                    │  - leaderboard:NORMAL               │
                    │  - leaderboard:HARD                 │
                    │  - leaderboard:EXTREME              │
                    │                                     │
                    │  Hash:                              │
                    │  - user:{userId}                    │
                    │    → name, lastScore, lastUpdated   │
                    └─────────────────────────────────────┘
```

---

## 데이터 흐름

### 1️⃣ 사용자 식별 생성 (최초 1회)

**시점**: 애플리케이션 첫 실행 시

```typescript
// src/utils/leaderboard.ts - getUserId()

localStorage에 'userId' 없음
  ↓
UUID v4 생성 (예: "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
  ↓
localStorage에 저장
  ↓
이후 모든 요청에서 사용
```

**코드 위치**: `src/utils/leaderboard.ts:34-48`

---

### 2️⃣ 사용자 이니셜 입력 (게임 오버 시)

**시점**: 로컬 최고 점수 갱신 시 (NEW RECORD)

```typescript
// src/scenes/GameScene.ts - showInitialInputUI()

게임 오버 + isNewRecord = true
  ↓
이니셜 입력 UI 표시 (HTML input)
  ↓
사용자가 3자리 영어 대문자 입력 (예: "ABC")
  ↓
검증: /^[A-Z]{3}$/ 정규식
  ↓
setUserInitials(initials) - localStorage에 저장
  ↓
이후 게임에서 자동으로 미리 채워짐
```

**코드 위치**:
- UI: `src/scenes/GameScene.ts:492-632`
- 저장: `src/utils/leaderboard.ts:65-74`
- 조회: `src/utils/leaderboard.ts:57-59`

---

### 3️⃣ 점수 제출 (로컬 최고 점수 갱신 시만)

**시점**: 게임 오버 발생 + 로컬 최고 점수 초과 시

```typescript
// 흐름도:

GameScene.hitPoop() 또는 GameScene.hitStar()
  ↓
gameOver = true, physics.pause()
  ↓
updateHighScore(difficulty, score) - 로컬 최고 점수 업데이트
  ↓ isNewRecord 반환 (true/false)
  ↓
showGameOverUI(isNewRecord) 호출
  ↓
IF (isNewRecord === true) THEN  ← ⭐ 조건부 전송!
  │
  ├─→ 이니셜 입력 UI 표시
  │    ↓
  │   사용자가 이니셜 입력 (예: "ABC")
  │    ↓
  │   submitScore(score, difficulty, initials) 호출
  │    ↓
  │   API: POST /api/leaderboard/submit
  │     {
  │       userId: "a1b2c3d4-...",
  │       userName: "ABC",  ← 이니셜!
  │       score: 1234,
  │       difficulty: "HARD"
  │     }
  │    ↓
  │   Redis:
  │     1. HSET user:a1b2c3d4 name "ABC" lastScore 1234
  │     2. ZSCORE leaderboard:HARD a1b2c3d4 (기존 점수 조회)
  │     3. IF (새 점수 > 기존 점수) THEN
  │          ZADD leaderboard:HARD 1234 a1b2c3d4
  │     4. ZREVRANK leaderboard:HARD a1b2c3d4 (순위 조회)
  │    ↓
  │   응답: { rank: 42, ... }
  │    ↓
  │   UI 업데이트: "🏆 전체 42위! 🏆" + "ABC"
  │
ELSE (isNewRecord === false)
  │
  └─→ UI: "최고 점수를 갱신하세요!" 표시
      ↓
      서버 전송하지 않음 ← ⭐ 비용 절감!
```

**코드 위치**:
- 조건 분기: `src/scenes/GameScene.ts:459-486`
- 이니셜 입력: `src/scenes/GameScene.ts:492-632`
- API 함수: `src/utils/leaderboard.ts:87-118`
- API 엔드포인트: `api/leaderboard/submit.ts`

**비용 절감 효과**:
- 이전: 모든 게임 오버마다 API 호출
- 현재: 로컬 최고 점수 초과 시에만 호출
- **예상 절감**: 50-70% API 호출 감소

---

### 4️⃣ 랭킹 조회 (현재 미사용, 구현만 완료)

**시점**: 추후 리더보드 UI 추가 시 사용 예정

```typescript
// 사용 예시 (아직 구현 안 됨):

LeaderboardScene.create()
  ↓
getLeaderboard(difficulty, limit=100) 호출
  ↓
API: GET /api/leaderboard/top?difficulty=HARD&limit=100&userId=a1b2c3d4
  ↓
Redis:
  1. ZRANGE leaderboard:HARD 0 99 REV WITHSCORES (상위 100명)
  2. HGETALL user:{각 userId} (사용자 이름 일괄 조회)
  3. ZREVRANK leaderboard:HARD a1b2c3d4 (요청자 순위)
  ↓
응답:
  {
    success: true,
    difficulty: "HARD",
    leaderboard: [
      { userId: "...", userName: "1등유저", score: 5000, rank: 1 },
      { userId: "...", userName: "2등유저", score: 4800, rank: 2 },
      ...
    ],
    currentUserRank: { rank: 42, score: 1234 },
    totalEntries: 532
  }
```

**코드 위치**:
- API 함수: `src/utils/leaderboard.ts:97-114`
- API 엔드포인트: `api/leaderboard/top.ts`

---

## API 명세

### POST /api/leaderboard/submit

**용도**: 게임 종료 시 점수 제출

#### Request
```typescript
{
  userId: string;      // UUID v4 형식
  userName: string;    // 사용자 표시 이름
  score: number;       // 최종 점수 (양수)
  difficulty: string;  // "easy" | "normal" | "hard" | "extreme"
}
```

#### Response (성공)
```typescript
{
  success: true,
  isNewRecord: boolean,        // 기존 점수보다 높은지
  previousScore: number | null, // 기존 점수 (없으면 null)
  newScore: number,             // 제출한 점수
  rank: number | null,          // 현재 순위 (1-based)
  message?: string              // 추가 메시지
}
```

#### Response (실패)
```typescript
{
  error: string,
  details?: string
}
```

#### Redis 작업
1. `HSET user:{userId} name {userName} lastScore {score} lastUpdated {timestamp}`
2. `ZSCORE leaderboard:{difficulty} {userId}` - 기존 점수 조회
3. `ZADD leaderboard:{difficulty} {score} {userId}` - 점수 저장 (더 높을 때만)
4. `ZREVRANK leaderboard:{difficulty} {userId}` - 순위 조회

**코드 위치**: `api/leaderboard/submit.ts`

---

### GET /api/leaderboard/top

**용도**: 상위 N명 랭킹 조회

#### Query Parameters
```
difficulty: string (required)  - "easy" | "normal" | "hard" | "extreme"
limit: number (optional)       - 1~1000, 기본값 100
userId: string (optional)      - 요청자 순위도 함께 조회
```

#### Response (성공)
```typescript
{
  success: true,
  difficulty: string,
  leaderboard: Array<{
    userId: string,
    userName: string,
    score: number,
    rank: number
  }>,
  currentUserRank: {
    rank: number,
    score: number
  } | null,
  totalEntries: number
}
```

#### Redis 작업
1. `ZRANGE leaderboard:{difficulty} 0 {limit-1} REV WITHSCORES`
2. `HGETALL user:{각 userId}` - 사용자 정보 일괄 조회
3. `ZSCORE leaderboard:{difficulty} {userId}` - 요청자 점수 조회
4. `ZREVRANK leaderboard:{difficulty} {userId}` - 요청자 순위 조회
5. `ZCARD leaderboard:{difficulty}` - 전체 엔트리 수

**코드 위치**: `api/leaderboard/top.ts`

---

## 프론트엔드 통합

### 파일 구조
```
src/
├── utils/
│   ├── leaderboard.ts      # API 호출 유틸리티
│   └── localStorage.ts     # 로컬 최고 점수 관리 (기존)
└── scenes/
    └── GameScene.ts        # 랭킹 시스템 통합
```

### 주요 함수

#### 1. getUserId()
```typescript
// src/utils/leaderboard.ts:34
export function getUserId(): string
```
- localStorage에서 userId 조회 또는 생성
- UUID v4 형식
- 최초 1회 생성 후 영구 사용

#### 2. getUserInitials()
```typescript
// src/utils/leaderboard.ts:57
export function getUserInitials(): string | null
```
- localStorage에서 userInitials 조회
- 없으면 null 반환
- 게임 오버 시 자동으로 미리 채워짐

#### 3. setUserInitials()
```typescript
// src/utils/leaderboard.ts:65
export function setUserInitials(initials: string): boolean
```
- 이니셜 검증 후 localStorage에 저장
- 검증: 정확히 3자리 영어 대문자 (/^[A-Z]{3}$/)
- 성공 시 true, 실패 시 false 반환

#### 4. submitScore()
```typescript
// src/utils/leaderboard.ts:87
export async function submitScore(
  score: number,
  difficulty: Difficulty,
  initials: string  ← ⭐ 이니셜 필수!
): Promise<SubmitScoreResponse>
```
- **호출 위치**: `GameScene.showInitialInputUI()` 내부 (이니셜 입력 후)
- **호출 조건**: `isNewRecord === true` (로컬 최고 점수 초과 시만)
- **자동 처리**: userId 자동 포함
- **검증**: 이니셜 형식 검증 (/^[A-Z]{3}$/)
- **응답**: 순위, 신기록 여부 등

#### 4. getLeaderboard()
```typescript
// src/utils/leaderboard.ts:97
export async function getLeaderboard(
  difficulty: Difficulty,
  limit: number = 100
): Promise<LeaderboardResponse>
```
- **현재 상태**: 구현만 완료, 아직 사용 안 함
- **향후 사용**: 별도 LeaderboardScene 추가 시 사용 예정

---

## Redis 데이터 구조

### Sorted Set (랭킹 저장)
```
KEY: leaderboard:{difficulty}
TYPE: Sorted Set (ZSET)

예시:
leaderboard:HARD
  - a1b2c3d4-e5f6... → score: 5000
  - b2c3d4e5-f6a7... → score: 4800
  - c3d4e5f6-a7b8... → score: 4500
  ...

특징:
- score가 높을수록 상위 랭킹
- 자동 정렬 (O(log N) 삽입)
- ZREVRANK로 순위 조회 (O(log N))
```

### Hash (사용자 정보 저장)
```
KEY: user:{userId}
TYPE: Hash

예시:
user:a1b2c3d4-e5f6-7890-abcd-ef1234567890
  - name: "빠른똥피하기고수"
  - lastScore: 1234
  - lastUpdated: 1704672000000

특징:
- userId → 사용자 정보 매핑
- 랭킹 조회 시 이름 표시용
```

### Redis 명령어 사용

#### 점수 저장
```redis
# 1. 사용자 정보 저장
HSET user:a1b2c3d4 name "빠른똥피하기고수" lastScore 1234 lastUpdated 1704672000000

# 2. 기존 점수 조회
ZSCORE leaderboard:HARD a1b2c3d4
# → 980 (또는 nil)

# 3. 새 점수가 더 높으면 업데이트
ZADD leaderboard:HARD 1234 a1b2c3d4

# 4. 순위 조회 (0-based)
ZREVRANK leaderboard:HARD a1b2c3d4
# → 41 (실제 순위는 42위)
```

#### 랭킹 조회
```redis
# 1. 상위 100명 조회 (점수 포함)
ZRANGE leaderboard:HARD 0 99 REV WITHSCORES
# → [userId1, score1, userId2, score2, ...]

# 2. 각 유저 이름 조회
HGETALL user:userId1
HGETALL user:userId2
...

# 3. 전체 엔트리 수
ZCARD leaderboard:HARD
# → 532
```

---

## 시퀀스 다이어그램

### 게임 종료 → 점수 제출 전체 흐름

```
사용자          GameScene       API Client       Vercel Function      Redis
  │                │                │                    │                │
  │   게임 플레이   │                │                    │                │
  │───────────────>│                │                    │                │
  │                │                │                    │                │
  │   충돌 발생     │                │                    │                │
  │───────────────>│ hitPoop()      │                    │                │
  │                │──┐             │                    │                │
  │                │  │ gameOver=true                    │                │
  │                │<─┘             │                    │                │
  │                │                │                    │                │
  │                │showGameOverUI()│                    │                │
  │                │──┐             │                    │                │
  │                │  │             │                    │                │
  │                │  │submitScore()│                    │                │
  │                │  └────────────>│ POST /submit       │                │
  │                │                │───────────────────>│                │
  │                │                │                    │ HSET user:xxx  │
  │                │                │                    │───────────────>│
  │                │                │                    │                │
  │                │                │                    │ ZSCORE         │
  │                │                │                    │───────────────>│
  │                │                │                    │<───────────────│
  │                │                │                    │   980          │
  │                │                │                    │                │
  │                │                │                    │ ZADD 1234      │
  │                │                │                    │───────────────>│
  │                │                │                    │                │
  │                │                │                    │ ZREVRANK       │
  │                │                │                    │───────────────>│
  │                │                │                    │<───────────────│
  │                │                │                    │   41           │
  │                │                │                    │                │
  │                │                │<───────────────────│                │
  │                │                │  {rank: 42, ...}   │                │
  │                │<───────────────│                    │                │
  │                │                │                    │                │
  │                │  UI 업데이트    │                    │                │
  │<───────────────│  "42위!"       │                    │                │
  │                │                │                    │                │
```

---

## 성능 고려사항

### Redis 작업 복잡도
- `ZADD`: O(log N) - 점수 저장
- `ZSCORE`: O(1) - 점수 조회
- `ZREVRANK`: O(log N) - 순위 조회
- `ZRANGE`: O(log N + M) - 상위 M명 조회
- `HSET`: O(1) - 사용자 정보 저장
- `HGETALL`: O(N) - 사용자 정보 조회 (N = 필드 개수)

### 예상 사용량 (DAU 500명 기준)

#### 옵션 2 적용 전 (모든 게임마다 전송)
```
일일 게임 플레이: 500명 × 5게임 = 2,500게임

각 게임당 Redis commands:
- 점수 제출: HSET(1) + ZSCORE(1) + ZADD(1) + ZREVRANK(1) = 4 commands

일일 총 commands: 2,500 × 4 = 10,000 commands
월간 commands: 10,000 × 30 = 300,000 commands
```

#### 옵션 2 적용 후 (로컬 최고 초과 시만 전송) ⭐
```
일일 게임 플레이: 500명 × 5게임 = 2,500게임
신기록 게임 (추정 30%): 2,500 × 0.3 = 750게임

각 신기록 게임당 Redis commands:
- 점수 제출: HSET(1) + ZSCORE(1) + ZADD(1) + ZREVRANK(1) = 4 commands

일일 총 commands: 750 × 4 = 3,000 commands
월간 commands: 3,000 × 30 = 90,000 commands

✅ Upstash 무료 티어 (500K commands/월) 범위 내!
✅ 비용 절감: 300K → 90K (70% 감소!)
```

---

## 환경 변수

### 로컬 개발 (.env.local)
```bash
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXXXxxxxx...
```

### Vercel 배포
```
Settings → Environment Variables:
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN
(Production, Preview, Development 모두 체크)
```

---

## 향후 개선 사항

### 1. 리더보드 UI 추가
- [ ] LeaderboardScene 생성
- [ ] 상위 100명 표시
- [ ] 내 순위 하이라이트
- [ ] 스크롤 가능한 리스트

### 2. 사용자 이름 커스터마이징
- [ ] 설정 화면에서 이름 변경 기능
- [ ] 중복 이름 체크 (선택사항)

### 3. 주간/월간 리더보드
- [ ] 시간 기반 리더보드 분리
- [ ] 자동 리셋 로직

### 4. 소셜 기능
- [ ] 친구 코드 시스템
- [ ] 친구 간 랭킹 비교
- [ ] 공유 기능

---

## 문제 해결

### 점수 제출 실패 시
1. 브라우저 콘솔 (F12) → Network 탭 확인
2. 환경 변수 확인: `cat .env.local`
3. Upstash Console에서 DB 상태 확인

### API 404 에러
1. `vercel.json` 파일 존재 확인
2. `api/` 폴더 구조 확인
3. Vercel 재배포

### CORS 에러
- API에 이미 CORS 헤더 포함됨
- 브라우저 캐시 삭제 후 재시도

---

## 작성 정보
- **최초 작성**: 2025-01-07
- **최종 수정**: 2025-01-07
- **작성자**: Claude Code
- **버전**: 2.0
- **데이터베이스**: Upstash Redis
- **플랫폼**: Vercel

---

## 변경 로그

### v2.0 (2025-01-07)
- ✅ **옵션 2 적용**: 로컬 최고 점수 초과 시에만 서버 전송
- ✅ **이니셜 시스템**: 랜덤 이름 → 3자리 영어 대문자 이니셜
- ✅ **비용 최적화**: API 호출 70% 감소 (300K → 90K commands/월)
- ✅ **UX 개선**: HTML input으로 이니셜 입력, Enter 키 지원
- ✅ **검증 강화**: 정규식 검증 (/^[A-Z]{3}$/)

### v1.0 (2025-01-07)
- ✅ 초기 랭킹 시스템 구현
- ✅ Upstash Redis 통합
- ✅ Vercel Serverless Functions
- ✅ 난이도별 리더보드
