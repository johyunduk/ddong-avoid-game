-- rating_points 컬럼 추가 (기존 유저는 1000으로 초기화)
ALTER TABLE public.battle_records
  ADD COLUMN IF NOT EXISTS rating_points INTEGER NOT NULL DEFAULT 1000;

-- 기존 함수/뷰 교체
DROP FUNCTION IF EXISTS increment_battle_record(UUID, TEXT);
DROP FUNCTION IF EXISTS get_battle_rank(INTEGER);
DROP VIEW IF EXISTS public.battle_leaderboard_view;

-- 신규 통합 함수: upsert + RP 업데이트 + rank 반환
-- RETURNS TABLE 컬럼명이 테이블 컬럼명과 동일하면 SET 우변에서 모호성 발생 →
-- 현재 값을 변수로 먼저 읽고 계산한 뒤, 우변에는 변수만 사용하여 해결
CREATE OR REPLACE FUNCTION submit_battle_record(
  p_user_id     UUID,
  p_result      TEXT,        -- 'win' | 'lose' | 'disconnect'
  p_point_delta INTEGER      -- Edge Function에서 계산한 델타 (음수 가능)
)
RETURNS TABLE(rating_points INTEGER, wins INTEGER, losses INTEGER, disconnects INTEGER, rank BIGINT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rp   INT;
  v_w    INT;
  v_l    INT;
  v_d    INT;
  v_rank BIGINT;
BEGIN
  INSERT INTO public.battle_records (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- 현재 값을 변수로 읽기 (테이블 alias로 명시적 참조)
  SELECT br.rating_points, br.wins, br.losses, br.disconnects
    INTO v_rp, v_w, v_l, v_d
    FROM public.battle_records br WHERE br.user_id = p_user_id;

  -- 새 값 계산 (모두 변수 연산 → 컬럼명 모호성 없음)
  v_rp := GREATEST(0, COALESCE(v_rp, 1000) + p_point_delta);
  v_w  := COALESCE(v_w, 0) + CASE WHEN p_result = 'win'        THEN 1 ELSE 0 END;
  v_l  := COALESCE(v_l, 0) + CASE WHEN p_result = 'lose'       THEN 1 ELSE 0 END;
  v_d  := COALESCE(v_d, 0) + CASE WHEN p_result = 'disconnect' THEN 1 ELSE 0 END;

  -- SET 우변 전부 변수 → 모호성 제거
  UPDATE public.battle_records SET
    rating_points = v_rp,
    wins          = v_w,
    losses        = v_l,
    disconnects   = v_d,
    updated_at    = NOW()
  WHERE user_id = p_user_id;

  -- rank 계산 (테이블 alias로 컬럼 명시)
  SELECT COUNT(*) + 1 INTO v_rank
    FROM public.battle_records br2 WHERE br2.rating_points > v_rp;

  RETURN QUERY SELECT v_rp, v_w, v_l, v_d, v_rank;
END; $$;

REVOKE ALL ON FUNCTION submit_battle_record FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_battle_record TO service_role;

-- 랭킹 뷰 (rating_points DESC 정렬)
CREATE OR REPLACE VIEW public.battle_leaderboard_view AS
SELECT
  br.user_id,
  br.rating_points,
  br.wins,
  br.losses,
  br.disconnects,
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
ORDER BY br.rating_points DESC;

GRANT SELECT ON public.battle_leaderboard_view TO anon, authenticated;

-- 현재 유저 rank 계산용 함수 (RP 기반)
CREATE OR REPLACE FUNCTION get_battle_rank_by_rp(p_rp INTEGER)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT COUNT(*) FROM public.battle_records WHERE rating_points > p_rp;
$$;
GRANT EXECUTE ON FUNCTION get_battle_rank_by_rp TO anon, authenticated, service_role;
