-- season_reward_history_char — 운영에만 있던 표를 저장소로 옮기고, 클라이언트 INSERT 정책을 지운다
-- 실행: Supabase Dashboard > SQL Editor에 붙여넣기
--
-- 이 표는 저장소 마이그레이션 없이 운영에서 만들어져 있었다. 아래 정의는 2026-10-11 운영 스키마를 읽어 그대로 옮긴 것이다
-- (제약 이름도 같아지게 인라인으로 쓴다). 운영에서는 CREATE TABLE · 인덱스 · 읽기 정책이 아무것도 하지 않고,
-- 바뀌는 것은 마지막 정책 삭제 하나다.
--
-- 쓰는 곳은 claim-season-reward 하나, 읽는 곳은 claim-season-reward · leaderboard-top — 모두 service role(RLS 우회)이다.
-- 게임 코드(src/)는 이 표를 쓴 적이 없다. insert_own_char_rewards 로는 클라이언트가 자기 '수령 기록'을 미리 넣어
-- 그 달 그 캐릭터 보상을 '이미 받음'으로 만들 수 있었다 (SKOR 이득은 없고, 기록이 거짓이 된다).
CREATE TABLE IF NOT EXISTS public.season_reward_history_char (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year_month     TEXT          NOT NULL,  -- 'YYYY-MM' (보상 대상 시즌 = 수령한 달의 전달)
  character_type TEXT          NOT NULL,
  rank           INTEGER       NOT NULL,
  skor_awarded   NUMERIC(10,1) NOT NULL DEFAULT 0,
  awarded_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (year_month, user_id, character_type)
);

CREATE INDEX IF NOT EXISTS idx_char_reward_user
  ON public.season_reward_history_char (user_id, year_month);

ALTER TABLE public.season_reward_history_char ENABLE ROW LEVEL SECURITY;

-- 읽기 정책은 운영에 이미 있다 — 없을 때(새 DB)만 만든다
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'season_reward_history_char' AND policyname = 'read_own_char_rewards'
  ) THEN
    CREATE POLICY "read_own_char_rewards" ON public.season_reward_history_char
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END;
$$;

DROP POLICY IF EXISTS "insert_own_char_rewards" ON public.season_reward_history_char;
