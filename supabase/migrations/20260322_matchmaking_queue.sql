-- 랭크 매치메이킹 대기열 테이블
CREATE TABLE public.matchmaking_queue (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'waiting', -- 'waiting' | 'matched'
  room_code   TEXT,
  is_host     BOOLEAN,
  opponent_id UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- 본인 row만 조회 가능 (폴링용)
CREATE POLICY "users can select own queue entry"
  ON public.matchmaking_queue FOR SELECT
  USING (auth.uid() = user_id);

-- 본인 row만 삭제 가능 (취소용)
CREATE POLICY "users can delete own queue entry"
  ON public.matchmaking_queue FOR DELETE
  USING (auth.uid() = user_id);

/**
 * 랭크 매치 참가 또는 즉시 매칭 (원자적 실행)
 *
 * - 대기 중인 상대가 있으면: 둘 다 'matched' 상태로 업데이트 + room_code 생성
 * - 없으면: 본인을 'waiting'으로 대기열에 추가
 * - FOR UPDATE SKIP LOCKED: 동시 호출 시 중복 매칭 방지
 */
CREATE OR REPLACE FUNCTION find_or_create_match(p_user_id UUID)
RETURNS TABLE(status TEXT, room_code TEXT, is_host BOOLEAN, opponent_id UUID)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_opponent  UUID;
  v_room_code TEXT;
BEGIN
  -- 3분 이상 지난 대기 항목 정리
  DELETE FROM public.matchmaking_queue mq
  WHERE mq.status = 'waiting' AND mq.updated_at < NOW() - INTERVAL '3 minutes';

  -- 대기 중인 상대 탐색 (FIFO 순서, 자신 제외, 경쟁 방지)
  SELECT mq.user_id INTO v_opponent
  FROM public.matchmaking_queue mq
  WHERE mq.status = 'waiting' AND mq.user_id != p_user_id
  ORDER BY mq.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_opponent IS NOT NULL THEN
    -- 4자리 랜덤 방 코드 생성
    v_room_code := upper(substring(md5(gen_random_uuid()::text) FROM 1 FOR 4));

    -- 상대를 호스트로 매칭 완료 처리
    UPDATE public.matchmaking_queue SET
      status      = 'matched',
      room_code   = v_room_code,
      is_host     = TRUE,
      opponent_id = p_user_id,
      updated_at  = NOW()
    WHERE user_id = v_opponent;

    -- 본인은 게스트로 삽입/갱신
    INSERT INTO public.matchmaking_queue (user_id, status, room_code, is_host, opponent_id)
    VALUES (p_user_id, 'matched', v_room_code, FALSE, v_opponent)
    ON CONFLICT (user_id) DO UPDATE SET
      status      = 'matched',
      room_code   = v_room_code,
      is_host     = FALSE,
      opponent_id = v_opponent,
      updated_at  = NOW();

    RETURN QUERY SELECT 'matched'::TEXT, v_room_code, FALSE, v_opponent;
  ELSE
    -- 대기열에 추가
    INSERT INTO public.matchmaking_queue (user_id, status)
    VALUES (p_user_id, 'waiting')
    ON CONFLICT (user_id) DO UPDATE SET
      status      = 'waiting',
      room_code   = NULL,
      is_host     = NULL,
      opponent_id = NULL,
      updated_at  = NOW();

    RETURN QUERY SELECT 'waiting'::TEXT, NULL::TEXT, NULL::BOOLEAN, NULL::UUID;
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION find_or_create_match TO authenticated;
