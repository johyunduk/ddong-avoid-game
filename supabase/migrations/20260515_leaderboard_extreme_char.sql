-- EXTREME 난이도 캐릭터별 베스트 스코어 테이블
-- 기존 leaderboard 테이블은 (user_id, difficulty, year_month) PK로 사용자당 1개 기록만 가능
-- 이 테이블은 EXTREME 전용으로 캐릭터별 독립 기록을 저장

CREATE TABLE IF NOT EXISTS leaderboard_extreme_char (
  user_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year_month     TEXT        NOT NULL,  -- 'YYYY-MM'
  character_type TEXT        NOT NULL DEFAULT 'chibi',
  score          INTEGER     NOT NULL DEFAULT 0,
  season         INTEGER     NOT NULL DEFAULT 1,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, year_month, character_type)
);

-- 랭킹 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_extreme_char_score
  ON leaderboard_extreme_char (year_month, character_type, score DESC);

-- RLS: 누구나 읽기 가능, 본인만 쓰기
ALTER TABLE leaderboard_extreme_char ENABLE ROW LEVEL SECURITY;

CREATE POLICY "extreme_char_read_all" ON leaderboard_extreme_char
  FOR SELECT USING (true);

CREATE POLICY "extreme_char_insert_own" ON leaderboard_extreme_char
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "extreme_char_update_own" ON leaderboard_extreme_char
  FOR UPDATE USING (auth.uid() = user_id);
