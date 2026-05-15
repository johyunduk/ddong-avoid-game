# EXTREME 캐릭터별 랭킹 배포 가이드

## 배포 순서

### 1단계 — DB Migration

Supabase 대시보드 → **SQL Editor** → 아래 SQL 실행

```sql
CREATE TABLE IF NOT EXISTS leaderboard_extreme_char (
  user_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year_month     TEXT        NOT NULL,
  character_type TEXT        NOT NULL DEFAULT 'chibi',
  score          INTEGER     NOT NULL DEFAULT 0,
  season         INTEGER     NOT NULL DEFAULT 1,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, year_month, character_type)
);

CREATE INDEX IF NOT EXISTS idx_extreme_char_score
  ON leaderboard_extreme_char (year_month, character_type, score DESC);

ALTER TABLE leaderboard_extreme_char ENABLE ROW LEVEL SECURITY;

CREATE POLICY "extreme_char_read_all" ON leaderboard_extreme_char
  FOR SELECT USING (true);

CREATE POLICY "extreme_char_insert_own" ON leaderboard_extreme_char
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "extreme_char_update_own" ON leaderboard_extreme_char
  FOR UPDATE USING (auth.uid() = user_id);
```

### 2단계 — Edge Function 배포

```bash
supabase functions deploy leaderboard-submit --no-verify-jwt
```

```bash
supabase functions deploy leaderboard-top --no-verify-jwt
```

---

## 검증

1. EXTREME 플레이 후 Supabase 대시보드 → Table Editor → `leaderboard_extreme_char` 에 행 생성 확인
2. 동일 유저로 다른 캐릭터 플레이 → 캐릭터별 독립 행 존재 확인
3. 랭킹보드 → EXTREME 탭 → 캐릭터 필터 칩 행 표시 확인
4. 캐릭터 칩 클릭 → 해당 캐릭터 점수만 필터링 확인

---

## 참고

- SQL Editor를 쓰는 이유: 기존 migration이 이미 원격 적용된 상태라 `supabase db push`는 이전 migration 재실행을 시도할 수 있음
- `leaderboard` 테이블은 무변경 — 기존 NORMAL/HARD 랭킹 및 보상 시스템에 영향 없음
