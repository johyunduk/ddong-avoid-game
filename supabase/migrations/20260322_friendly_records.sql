-- 기존 함수 모두 삭제 (파라미터 수 또는 리턴 타입이 달라 CREATE OR REPLACE 불가)
DROP FUNCTION IF EXISTS submit_battle_record(UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS submit_battle_record(UUID, TEXT, INTEGER, BOOLEAN);

-- 친선전 전적 컬럼 추가
ALTER TABLE public.battle_records
  ADD COLUMN IF NOT EXISTS friendly_wins        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS friendly_losses      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS friendly_disconnects INTEGER NOT NULL DEFAULT 0;

-- submit_battle_record 함수 업데이트: p_is_ranked 파라미터 추가
-- 컬럼명 모호성 방지: 현재값을 변수로 먼저 읽고 UPDATE에서 변수만 사용
CREATE OR REPLACE FUNCTION submit_battle_record(
  p_user_id     UUID,
  p_result      TEXT,
  p_point_delta INTEGER,
  p_is_ranked   BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
  out_rating_points        INTEGER,
  out_wins                 INTEGER,
  out_losses               INTEGER,
  out_disconnects          INTEGER,
  out_friendly_wins        INTEGER,
  out_friendly_losses      INTEGER,
  out_friendly_disconnects INTEGER,
  out_rank                 BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rp   INT;
  v_w    INT;
  v_l    INT;
  v_d    INT;
  v_fw   INT;
  v_fl   INT;
  v_fd   INT;
  v_rank BIGINT;
BEGIN
  -- 1. 신규 유저 레코드 생성 (기존 유저는 무시)
  INSERT INTO public.battle_records (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- 2. 현재 값을 변수로 읽기 (UPDATE 우변의 모호성 방지)
  SELECT br.rating_points, br.wins, br.losses, br.disconnects,
         br.friendly_wins, br.friendly_losses, br.friendly_disconnects
    INTO v_rp, v_w, v_l, v_d, v_fw, v_fl, v_fd
    FROM public.battle_records br WHERE br.user_id = p_user_id;

  v_rp := COALESCE(v_rp, 0);
  v_w  := COALESCE(v_w,  0);
  v_l  := COALESCE(v_l,  0);
  v_d  := COALESCE(v_d,  0);
  v_fw := COALESCE(v_fw, 0);
  v_fl := COALESCE(v_fl, 0);
  v_fd := COALESCE(v_fd, 0);

  -- 3. 변수만 사용해 UPDATE (컬럼명 모호성 없음)
  IF p_is_ranked THEN
    v_rp := GREATEST(0, v_rp + p_point_delta);
    v_w  := v_w  + CASE WHEN p_result = 'win'        THEN 1 ELSE 0 END;
    v_l  := v_l  + CASE WHEN p_result = 'lose'       THEN 1 ELSE 0 END;
    v_d  := v_d  + CASE WHEN p_result = 'disconnect' THEN 1 ELSE 0 END;

    UPDATE public.battle_records SET
      rating_points = v_rp,
      wins          = v_w,
      losses        = v_l,
      disconnects   = v_d,
      updated_at    = NOW()
    WHERE user_id = p_user_id;
  ELSE
    v_fw := v_fw + CASE WHEN p_result = 'win'        THEN 1 ELSE 0 END;
    v_fl := v_fl + CASE WHEN p_result = 'lose'       THEN 1 ELSE 0 END;
    v_fd := v_fd + CASE WHEN p_result = 'disconnect' THEN 1 ELSE 0 END;

    UPDATE public.battle_records SET
      friendly_wins        = v_fw,
      friendly_losses      = v_fl,
      friendly_disconnects = v_fd,
      updated_at           = NOW()
    WHERE user_id = p_user_id;
  END IF;

  -- 4. 랭크 계산
  SELECT COUNT(*) + 1 INTO v_rank
    FROM public.battle_records br2 WHERE br2.rating_points > v_rp;

  RETURN QUERY SELECT v_rp, v_w, v_l, v_d, v_fw, v_fl, v_fd, v_rank;
END; $$;

REVOKE ALL ON FUNCTION submit_battle_record FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_battle_record TO service_role;
