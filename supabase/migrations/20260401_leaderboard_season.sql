-- leaderboard 테이블에 시즌 컬럼 추가 + PK 변경
-- year_month: 'YYYY-MM' 형식 (예: '2026-04')
-- season: 순차 시즌 번호 (2026-01 = 1, 2026-02 = 2, ...)
ALTER TABLE leaderboard
  ADD COLUMN IF NOT EXISTS year_month TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  ADD COLUMN IF NOT EXISTS season     INTEGER NOT NULL DEFAULT 1;

-- 기존 PK (user_id, difficulty) → (user_id, difficulty, year_month)
ALTER TABLE leaderboard DROP CONSTRAINT IF EXISTS leaderboard_pkey;
ALTER TABLE leaderboard ADD PRIMARY KEY (user_id, difficulty, year_month);

-- 기존 행의 season 값을 year_month 기준으로 올바르게 재계산
-- (ADD COLUMN DEFAULT 1은 임시값이므로 실제 시즌 번호로 업데이트)
UPDATE leaderboard
SET season = (EXTRACT(YEAR FROM to_date(year_month, 'YYYY-MM'))::int - 2026) * 12
           + EXTRACT(MONTH FROM to_date(year_month, 'YYYY-MM'))::int;

-- 시즌별 조회 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_leaderboard_season
  ON leaderboard(year_month, difficulty, score DESC);

-- 보상 수령 이력 테이블
-- UNIQUE 제약이 DB 레벨 중복 수령 방지 역할
CREATE TABLE IF NOT EXISTS season_reward_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month   TEXT        NOT NULL,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  difficulty   TEXT        NOT NULL,
  rank         INTEGER     NOT NULL,
  skor_awarded NUMERIC(10,1) NOT NULL,
  awarded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year_month, user_id, difficulty)
);

CREATE INDEX IF NOT EXISTS idx_season_reward_user
  ON season_reward_history(user_id, year_month);

ALTER TABLE season_reward_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own season rewards"
  ON season_reward_history FOR SELECT
  USING (auth.uid() = user_id);
