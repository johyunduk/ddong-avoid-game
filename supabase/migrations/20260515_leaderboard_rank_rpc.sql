-- leaderboard_with_rank: 리더보드 + 현재 유저 순위를 단일 쿼리로 반환
-- 기존: 메인 쿼리 → userEntry 조회 → COUNT(*) WHERE score > X (3 round-trip)
-- 개선: 단일 RPC (RANK() OVER 윈도우 함수로 순위 계산)
CREATE OR REPLACE FUNCTION get_leaderboard_with_rank(
  p_difficulty  TEXT,
  p_year_month  TEXT,
  p_limit       INT,
  p_user_id     UUID DEFAULT NULL
)
RETURNS TABLE (
  user_id        UUID,
  score          NUMERIC,
  character_type TEXT,
  initials       TEXT,
  rank           BIGINT,
  is_mine        BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH ranked AS (
    SELECT
      l.user_id,
      l.score,
      l.character_type,
      pr.initials,
      RANK() OVER (ORDER BY l.score DESC) AS rank
    FROM leaderboard l
    JOIN profiles pr ON pr.id = l.user_id
    WHERE l.difficulty  = p_difficulty
      AND l.year_month  = p_year_month
  )
  SELECT
    user_id,
    score,
    character_type,
    initials,
    rank,
    (p_user_id IS NOT NULL AND user_id = p_user_id) AS is_mine
  FROM ranked
  WHERE rank <= p_limit
     OR (p_user_id IS NOT NULL AND user_id = p_user_id)
  ORDER BY rank;
$$;

-- leaderboard_extreme_char 동일 패턴 RPC
CREATE OR REPLACE FUNCTION get_extreme_char_leaderboard_with_rank(
  p_year_month    TEXT,
  p_character_type TEXT,
  p_limit         INT,
  p_user_id       UUID DEFAULT NULL
)
RETURNS TABLE (
  user_id        UUID,
  score          NUMERIC,
  character_type TEXT,
  initials       TEXT,
  rank           BIGINT,
  is_mine        BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH ranked AS (
    SELECT
      l.user_id,
      l.score,
      l.character_type,
      pr.initials,
      RANK() OVER (ORDER BY l.score DESC) AS rank
    FROM leaderboard_extreme_char l
    JOIN profiles pr ON pr.id = l.user_id
    WHERE l.year_month     = p_year_month
      AND l.character_type = p_character_type
  )
  SELECT
    user_id,
    score,
    character_type,
    initials,
    rank,
    (p_user_id IS NOT NULL AND user_id = p_user_id) AS is_mine
  FROM ranked
  WHERE rank <= p_limit
     OR (p_user_id IS NOT NULL AND user_id = p_user_id)
  ORDER BY rank;
$$;

-- prevSeason 순위 계산도 RPC로 (COUNT 2번 → 1번 쿼리)
CREATE OR REPLACE FUNCTION get_user_season_rank(
  p_difficulty TEXT,
  p_year_month TEXT,
  p_user_id    UUID
)
RETURNS TABLE (
  rank        BIGINT,
  score       NUMERIC,
  total       BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH ranked AS (
    SELECT
      user_id,
      score,
      RANK() OVER (ORDER BY score DESC) AS rank,
      COUNT(*) OVER ()                   AS total
    FROM leaderboard
    WHERE difficulty = p_difficulty
      AND year_month = p_year_month
  )
  SELECT rank, score, total
  FROM ranked
  WHERE user_id = p_user_id;
$$;
