# EXTREME 캐릭터별 시즌 보상 배포 가이드

## 1. DB 마이그레이션 (Supabase SQL Editor)

```sql
CREATE TABLE IF NOT EXISTS season_reward_history_char (
  id             UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year_month     TEXT          NOT NULL,
  character_type TEXT          NOT NULL,
  rank           INTEGER       NOT NULL,
  skor_awarded   NUMERIC(10,1) NOT NULL DEFAULT 0,
  awarded_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(year_month, user_id, character_type)
);

CREATE INDEX IF NOT EXISTS idx_char_reward_user
  ON season_reward_history_char (user_id, year_month);

ALTER TABLE season_reward_history_char ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_own_char_rewards" ON season_reward_history_char
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "insert_own_char_rewards" ON season_reward_history_char
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

## 2. Edge Functions 재배포

```bash
supabase functions deploy leaderboard-top --no-verify-jwt
supabase functions deploy claim-season-reward --no-verify-jwt
```

## 보상 구조

| 순위 | SKOR |
|------|------|
| 1위  | 5,000 |
| 2위  | 3,000 |
| 3위  | 1,500 |
| 4위~ | 없음 |

- 대상: EXTREME 난이도 캐릭터별 리더보드 (`leaderboard_extreme_char`)
- 기준: 직전 달 해당 캐릭터로 기록을 세운 유저
- 한 유저가 여러 캐릭터 보상 모두 수령 가능 (캐릭터별 독립)
