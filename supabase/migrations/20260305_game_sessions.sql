-- 게임 세션 테이블: 서버 측 시작 시각 기록으로 점수 조작 방지
-- 실행: Supabase Dashboard > SQL Editor에 붙여넣기

CREATE TABLE IF NOT EXISTS game_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  difficulty  TEXT        NOT NULL,
  start_time  TIMESTAMPTZ NOT NULL DEFAULT now(),
  used        BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 오래된 세션 자동 정리를 위한 인덱스 (2시간 이상 지난 미사용 세션은 무효)
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_created_at ON game_sessions(created_at);

-- 오래된 세션 정리 함수 (선택적으로 cron으로 호출 가능)
CREATE OR REPLACE FUNCTION cleanup_old_game_sessions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM game_sessions
  WHERE created_at < now() - interval '2 hours';
$$;
