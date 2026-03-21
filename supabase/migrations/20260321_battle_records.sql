-- 전적 테이블 (유저당 1행)
CREATE TABLE public.battle_records (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wins        INTEGER NOT NULL DEFAULT 0,
  losses      INTEGER NOT NULL DEFAULT 0,
  disconnects INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.battle_records ENABLE ROW LEVEL SECURITY;

-- 읽기 공개 (랭킹 조회), 쓰기는 service_role만 (정책 없음)
CREATE POLICY "battle_records_select_public"
  ON public.battle_records FOR SELECT USING (true);

-- 원자적 upsert + 현재 전적 반환 함수
-- (Supabase JS SDK로 wins+disconnects 복합 정렬/집계 불가 → DB 함수로 해결)
CREATE OR REPLACE FUNCTION increment_battle_record(p_user_id UUID, p_column TEXT)
RETURNS TABLE(wins INTEGER, losses INTEGER, disconnects INTEGER, rank BIGINT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wins        INT;
  v_losses      INT;
  v_disconnects INT;
  v_rank        BIGINT;
BEGIN
  INSERT INTO public.battle_records (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  EXECUTE format(
    'UPDATE public.battle_records SET %I = %I + 1, updated_at = NOW() WHERE user_id = $1',
    p_column, p_column
  ) USING p_user_id;

  SELECT br.wins, br.losses, br.disconnects
    INTO v_wins, v_losses, v_disconnects
    FROM public.battle_records br
   WHERE br.user_id = p_user_id;

  SELECT COUNT(*) + 1 INTO v_rank
    FROM public.battle_records br
   WHERE (br.wins + br.disconnects) > (v_wins + v_disconnects);

  RETURN QUERY SELECT v_wins, v_losses, v_disconnects, v_rank;
END;
$$;

REVOKE ALL ON FUNCTION increment_battle_record FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_battle_record TO service_role;

-- 랭킹 뷰 (복합 정렬 + win_rate 계산 포함)
CREATE OR REPLACE VIEW public.battle_leaderboard_view AS
SELECT
  br.user_id,
  br.wins,
  br.losses,
  br.disconnects,
  (br.wins + br.disconnects) AS total_wins,
  CASE
    WHEN (br.wins + br.losses + br.disconnects) = 0 THEN 0.0
    ELSE ROUND(
      (br.wins + br.disconnects)::NUMERIC
      / (br.wins + br.losses + br.disconnects)::NUMERIC * 100,
      1
    )
  END AS win_rate,
  p.initials
FROM public.battle_records br
JOIN public.profiles p ON p.id = br.user_id
ORDER BY
  (br.wins + br.disconnects) DESC,
  CASE
    WHEN (br.wins + br.losses + br.disconnects) = 0 THEN 0.0
    ELSE (br.wins + br.disconnects)::NUMERIC
         / (br.wins + br.losses + br.disconnects)::NUMERIC
  END DESC;

GRANT SELECT ON public.battle_leaderboard_view TO anon, authenticated;

-- 현재 유저 rank 계산용 함수
CREATE OR REPLACE FUNCTION get_battle_rank(p_total_wins INTEGER)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT COUNT(*) FROM public.battle_records WHERE (wins + disconnects) > p_total_wins;
$$;
GRANT EXECUTE ON FUNCTION get_battle_rank TO anon, authenticated, service_role;
