-- 각성 시스템: 중복 뽑기 횟수 컬럼 추가
-- 실행: Supabase Dashboard > SQL Editor에 붙여넣기

ALTER TABLE user_characters
  ADD COLUMN IF NOT EXISTS duplicate_count INTEGER NOT NULL DEFAULT 0;

-- atomic increment RPC (Edge Function에서 호출)
CREATE OR REPLACE FUNCTION increment_duplicate_count(
  p_user_id     UUID,
  p_character_id TEXT,
  p_amount      INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE user_characters
  SET duplicate_count = duplicate_count + p_amount
  WHERE user_id = p_user_id
    AND character_id = p_character_id;
$$;
