-- leaderboard difficulty CHECK 제약에 'physical' 추가
ALTER TABLE public.leaderboard
  DROP CONSTRAINT leaderboard_difficulty_check;

ALTER TABLE public.leaderboard
  ADD CONSTRAINT leaderboard_difficulty_check
    CHECK (difficulty = ANY (ARRAY['easy', 'normal', 'hard', 'extreme', 'physical']));

-- game_sessions 테이블에 difficulty 제약이 있다면 동일하게 수정
-- (없는 경우 무시됨)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.game_sessions'::regclass
      AND conname = 'game_sessions_difficulty_check'
  ) THEN
    ALTER TABLE public.game_sessions DROP CONSTRAINT game_sessions_difficulty_check;
    ALTER TABLE public.game_sessions
      ADD CONSTRAINT game_sessions_difficulty_check
        CHECK (difficulty = ANY (ARRAY['easy', 'normal', 'hard', 'extreme', 'physical']));
  END IF;
END $$;
