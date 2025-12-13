# 🔐 점수 조작 방지 시스템 설정 가이드

이 문서는 HMAC 기반 점수 검증 시스템을 설정하는 방법을 설명합니다.

---

## 📋 개요

### 작동 원리
1. **게임 시작**: 클라이언트가 게임 시작 시각을 기록
2. **게임 플레이**: 점수, 플레이 시간, 난이도 등 수집
3. **게임 종료**: 게임 데이터를 HMAC-SHA256으로 서명
4. **점수 제출**: 점수 + 서명을 서버로 전송
5. **서버 검증**: 서버가 독립적으로 서명 재계산 및 비교
6. **DB 저장**: 검증 통과 시에만 점수 저장

### 보안 레이어
- ✅ **HMAC 서명**: 클라이언트가 임의로 점수 변조 시 서명 불일치
- ✅ **플레이 타임 검증**: 점수 대비 플레이 시간이 너무 짧으면 거부
- ✅ **점수 범위 검증**: 난이도별 최대 점수 초과 시 거부
- ✅ **타임스탬프 검증**: 미래/과거(24시간 이상) 타임스탬프 거부
- ✅ **Stateless**: Redis 저장소 사용 없음 (무료 티어 유지)

---

## 🚀 설정 방법

### 1. 비밀 키 생성

강력한 랜덤 키 생성 (최소 32바이트):

```bash
openssl rand -hex 32
```

출력 예시:
```
021d9efa84d56d2e83ef97d7860b6c3caca05b42b4d43cecc8a199556f7e0854
```

### 2. 로컬 환경 변수 설정

`.env.local` 파일 편집:

```bash
# Upstash Redis 설정
UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url_here
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token_here

# 게임 점수 검증용 HMAC 비밀 키
# 서버 사이드 검증용 (절대 클라이언트 코드에 노출되지 않음)
GAME_SECRET_KEY=021d9efa84d56d2e83ef97d7860b6c3caca05b42b4d43cecc8a199556f7e0854

# 클라이언트용 검증 키 (VITE_ 접두사 필수)
# 주의: 빌드 시 클라이언트 코드에 포함되므로 동일한 키 사용
VITE_GAME_SECRET_KEY=021d9efa84d56d2e83ef97d7860b6c3caca05b42b4d43cecc8a199556f7e0854
```

**중요**: 두 키는 동일해야 합니다!

### 3. Vercel 환경 변수 설정

Vercel 대시보드에서:

1. **프로젝트 선택** → **Settings** → **Environment Variables**
2. 다음 변수 추가:

| 변수명 | 값 | 환경 |
|--------|-----|-----|
| `UPSTASH_REDIS_REST_URL` | your_upstash_url | Production, Preview |
| `UPSTASH_REDIS_REST_TOKEN` | your_upstash_token | Production, Preview |
| `GAME_SECRET_KEY` | 생성한 비밀 키 | Production, Preview |
| `VITE_GAME_SECRET_KEY` | 동일한 비밀 키 | Production, Preview |

### 4. 배포

```bash
git add .
git commit -m "Add HMAC-based score verification system"
git push
```

Vercel이 자동으로 재배포합니다.

---

## 🔍 검증 규칙

### 점수 범위 제한

| 난이도 | 최대 점수 |
|--------|----------|
| EASY   | 10,000   |
| NORMAL | 15,000   |
| HARD   | 20,000   |

### 플레이 타임 제한

- 기본: 100ms당 1점 (1초당 10점)
- 허용 여유: 50% (즉, 1000점 획득 시 최소 50초 필요)
- 예: 1000점 → 최소 플레이 타임 50초

### 타임스탬프 제한

- 미래 시간: 거부
- 24시간 이상 과거: 거부

---

## 🧪 테스트

### 로컬 테스트

```bash
# 개발 서버 실행
npm run dev

# 게임 플레이 후 점수 제출
# 콘솔에서 검증 메시지 확인
```

### 프로덕션 테스트

1. 게임 플레이 후 점수 제출
2. Vercel Functions 로그 확인:
   - **성공**: `[Security] Score verified: XXX points for user YYY`
   - **실패**: `[Security] HMAC signature verification failed`

### 조작 테스트 (개발 환경)

브라우저 콘솔에서:

```javascript
// ❌ 실패해야 함 - 임의의 점수
await submitScore(999999, 'hard', 'AAA');

// ❌ 실패해야 함 - 서명 없이 직접 API 호출
fetch('/api/leaderboard/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'fake-user',
    userName: 'AAA',
    score: 999999,
    difficulty: 'hard'
  })
});
```

---

## ⚠️ 보안 주의사항

### 클라이언트 키 노출

- `VITE_GAME_SECRET_KEY`는 빌드 시 클라이언트 코드에 포함됩니다
- 정교한 공격자는 코드를 디컴파일하여 키를 추출할 수 있습니다
- **하지만**: 서버의 `GAME_SECRET_KEY`가 최종 방어선입니다

### 완벽한 보안은 불가능

- 클라이언트 사이드 게임은 근본적으로 조작 가능합니다
- 이 시스템은 **일반적인 스크립트 키디를 막는 것**이 목표입니다
- 100% 조작 방지를 원한다면 서버 사이드 게임 엔진이 필요합니다

### 추가 보안 권장사항

1. **Rate Limiting**: IP/userId당 점수 제출 횟수 제한 (향후 구현 권장)
2. **이상 탐지**: 비정상적으로 높은 점수 패턴 모니터링
3. **수동 검토**: 상위 랭커의 플레이 데이터 주기적 검토

---

## 📊 로그 모니터링

### Vercel Functions 로그

```bash
# Vercel CLI 설치
npm i -g vercel

# 실시간 로그 확인
vercel logs --follow
```

### 로그 패턴

**정상**:
```
[Security] Score verified: 1234 points for user abc-123
```

**의심스러운 활동**:
```
[Security] Invalid game data: Play time 100ms too short for score 5000
[Security] HMAC signature verification failed
[Security] Score mismatch between gameData and request
```

---

## 🛠️ 문제 해결

### "Invalid signature" 에러

**원인**: 클라이언트와 서버의 비밀 키가 다름

**해결**:
1. `.env.local`과 Vercel 환경 변수의 키가 동일한지 확인
2. 키 변경 후 Vercel 재배포
3. 브라우저 캐시 삭제

### "Play time too short" 에러

**원인**: 점수 대비 플레이 시간이 비정상적으로 짧음

**해결**:
1. 게임 로직 확인 (점수 증가율)
2. `gameVerification.ts`의 `minPlayTime` 계산식 확인
3. 필요시 `allowedMargin` 조정 (현재 0.5 = 50%)

### "Timestamp is in the future" 에러

**원인**: 클라이언트 시계가 잘못 설정됨

**해결**:
1. 클라이언트 시계 동기화
2. 타임존 설정 확인

---

## 📚 관련 파일

### 클라이언트
- `src/utils/gameVerification.ts`: 클라이언트 검증 로직
- `src/utils/leaderboard.ts`: 점수 제출 API 호출
- `src/scenes/GameScene.ts`: 게임 데이터 수집 및 서명 생성

### 서버
- `api/lib/gameVerification.ts`: 서버 검증 로직
- `api/leaderboard/submit.ts`: 점수 제출 API 엔드포인트

### 설정
- `.env.example`: 환경 변수 예시
- `.env.local`: 로컬 환경 변수 (gitignore됨)

---

## 🎯 다음 단계 (선택사항)

더 강력한 보안을 원한다면:

1. **Rate Limiting**: Upstash Redis를 사용한 요청 제한
2. **게임 이벤트 로깅**: 주요 이벤트를 서버로 전송
3. **이상 탐지 시스템**: 머신러닝 기반 조작 감지
4. **캡차 통합**: 봇 방지

---

**문의**: [GitHub Issues](https://github.com/YOUR_USERNAME/ddong-avoid-game/issues)
