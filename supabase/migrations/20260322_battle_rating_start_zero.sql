-- 신규 유저 시작 RP: 1000 → 0으로 변경
ALTER TABLE public.battle_records
  ALTER COLUMN rating_points SET DEFAULT 0;

-- submit_battle_record 함수의 COALESCE 기본값도 0으로 동기화
CREATE OR REPLACE FUNCTION submit_battle_record(
  p_user_id     UUID,
  p_result      TEXT,
  p_point_delta INTEGER
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

  SELECT br.rating_points, br.wins, br.losses, br.disconnects
    INTO v_rp, v_w, v_l, v_d
    FROM public.battle_records br WHERE br.user_id = p_user_id;

  v_rp := GREATEST(0, COALESCE(v_rp, 0) + p_point_delta);
  v_w  := COALESCE(v_w, 0) + CASE WHEN p_result = 'win'        THEN 1 ELSE 0 END;
  v_l  := COALESCE(v_l, 0) + CASE WHEN p_result = 'lose'       THEN 1 ELSE 0 END;
  v_d  := COALESCE(v_d, 0) + CASE WHEN p_result = 'disconnect' THEN 1 ELSE 0 END;

  UPDATE public.battle_records SET
    rating_points = v_rp,
    wins          = v_w,
    losses        = v_l,
    disconnects   = v_d,
    updated_at    = NOW()
  WHERE user_id = p_user_id;

  SELECT COUNT(*) + 1 INTO v_rank
    FROM public.battle_records br2 WHERE br2.rating_points > v_rp;

  RETURN QUERY SELECT v_rp, v_w, v_l, v_d, v_rank;
END; $$;

REVOKE ALL ON FUNCTION submit_battle_record FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_battle_record TO service_role;
