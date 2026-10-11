-- 캐릭터별 시즌 보상을 '월초 자동 지급'으로 바꾼다
-- 실행: Supabase Dashboard > SQL Editor에 붙여넣기
-- 앞에 적용돼 있어야 하는 것: 20261011000003 (극한 캐릭터 점수 클라이언트 쓰기 차단 — 지난달 순위가 굳어 있어야 한다)
--                            20261011000005 (season_reward_history_char 표 정의)
--
-- 그전에는 다음 달에 랭킹 → EXTREME → 바로 그 캐릭터를 골라야만 '캐릭터 보상' 버튼이 보였고, 직전 달만 받을 수 있었다.
-- 2026-05~09 대상 73칸이 한 번도 수령되지 않았다 (pg_stat_statements 로 서버 수령 분기가 0회였음을 확인, 2026-10-11).
-- 이제 달이 바뀌면 pg_cron 이 직전 달 캐릭터별 1~3위에게 지급하고, 다음 접속 때 클라이언트가 '보상 도착'을 띄운다.
--
-- 수령 버튼 경로(claim-season-reward { characterType })와 랭킹 표시(leaderboard-top)도 아래 함수를 쓴다
-- — 자격 기준 · 금액이 이 파일의 설정 한 곳에서 나오고, cron 이 늦으면 버튼이 같은 지급을 대신한다.

-- 1. 설정 (한 행) — 자격 기준과 금액. 기본은 지금과 같다: 인원 · 점수 기준 없음, 1 · 2 · 3위 5000 · 3000 · 1500
--    기준을 바꿀 때는 이 행만 UPDATE 한다 (planner 제안 → 대표 승인)
CREATE TABLE IF NOT EXISTS public.char_season_reward_settings (
  id           BOOLEAN     PRIMARY KEY DEFAULT true CHECK (id),
  min_players  INTEGER     NOT NULL DEFAULT 1,  -- 그 달 그 캐릭터 기록 수가 이 이상일 때만 지급
  min_score    INTEGER     NOT NULL DEFAULT 0,  -- 이 점수 이상인 기록만 지급
  reward_rank1 INTEGER     NOT NULL DEFAULT 5000,
  reward_rank2 INTEGER     NOT NULL DEFAULT 3000,
  reward_rank3 INTEGER     NOT NULL DEFAULT 1500,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.char_season_reward_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
-- 서버(service role · 아래 함수)만 읽는다 — RLS 를 켜고 정책을 두지 않는다
ALTER TABLE public.char_season_reward_settings ENABLE ROW LEVEL SECURITY;

-- 2. 지급됐지만 아직 '보상 도착'을 안 보여 준 기록
ALTER TABLE public.season_reward_history_char ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

-- 3. 그 달의 지급 대상 — 순위는 claim-season-reward 와 같다 (나보다 높은 점수 수 + 1, 동점은 같은 순위)
CREATE OR REPLACE FUNCTION public.char_season_winners(p_year_month TEXT)
RETURNS TABLE (user_id UUID, character_type TEXT, rank INTEGER, skor_awarded NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH s AS (
    SELECT * FROM public.char_season_reward_settings WHERE id
  ), ranked AS (
    SELECT e.user_id, e.character_type, e.score,
           (rank() OVER (PARTITION BY e.character_type ORDER BY e.score DESC))::INTEGER AS r,
           count(*) OVER (PARTITION BY e.character_type) AS players
    FROM public.leaderboard_extreme_char e
    WHERE e.year_month = p_year_month
  )
  SELECT ranked.user_id, ranked.character_type, ranked.r,
         (CASE ranked.r WHEN 1 THEN s.reward_rank1 WHEN 2 THEN s.reward_rank2 ELSE s.reward_rank3 END)::NUMERIC
  FROM ranked CROSS JOIN s
  WHERE ranked.r <= 3
    AND ranked.players >= s.min_players
    AND ranked.score >= s.min_score;
$$;

-- 4. 지급 — 대상에게 기록을 넣고, 새로 넣은 몫만 잔액에 더한다.
--    UNIQUE (year_month, user_id, character_type) 로 두 번 돌아도(cron 재시도 · 버튼 경로와 겹침) 한 번만 지급된다.
--    잔액 · 주간 집계는 claim-season-reward 의 updateUserSkor 와 같게 (내림 · 월요일 시작 UTC 주)
CREATE OR REPLACE FUNCTION public.grant_char_season_rewards(p_year_month TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMP := now() AT TIME ZONE 'UTC';
  v_ym TEXT := coalesce(p_year_month, to_char(v_now - INTERVAL '1 month', 'YYYY-MM'));
  v_week DATE := date_trunc('week', v_now)::DATE;
  v_granted INTEGER;
BEGIN
  IF v_ym !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'bad year_month: %', v_ym;
  END IF;
  -- 진행 중인 달은 순위가 아직 바뀐다
  IF v_ym >= to_char(v_now, 'YYYY-MM') THEN
    RAISE EXCEPTION 'season % is not over yet', v_ym;
  END IF;

  WITH granted AS (
    INSERT INTO public.season_reward_history_char (year_month, user_id, character_type, rank, skor_awarded)
    SELECT v_ym, w.user_id, w.character_type, w.rank, w.skor_awarded
    FROM public.char_season_winners(v_ym) w
    ON CONFLICT (year_month, user_id, character_type) DO NOTHING
    RETURNING user_id, skor_awarded
  ), per_user AS (
    SELECT g.user_id, sum(g.skor_awarded) AS total, count(*) AS n
    FROM granted g GROUP BY g.user_id
  ), credited AS (
    INSERT INTO public.user_skor AS us (user_id, balance, weekly_earned, week_start, updated_at)
    SELECT p.user_id, floor(p.total), floor(p.total), v_week, now()
    FROM per_user p
    ON CONFLICT (user_id) DO UPDATE SET
      balance       = floor(us.balance + EXCLUDED.balance),
      weekly_earned = CASE WHEN us.week_start = EXCLUDED.week_start
                           THEN floor(coalesce(us.weekly_earned, 0) + EXCLUDED.weekly_earned)
                           ELSE EXCLUDED.weekly_earned END,
      week_start    = EXCLUDED.week_start,
      updated_at    = EXCLUDED.updated_at
    RETURNING 1
  )
  SELECT coalesce((SELECT sum(p.n) FROM per_user p), 0)::INTEGER
  INTO v_granted
  FROM (SELECT count(*) FROM credited) c;

  RETURN v_granted;
END;
$$;

-- 5. 상태 — leaderboard-top 이 직전 달 내 캐릭터 보상을 보여 줄 때: 받음(claimed) / 받을 몫(월초 지급 전) / 행 없음 = 대상 아님
CREATE OR REPLACE FUNCTION public.get_char_season_reward_status(p_year_month TEXT, p_character_type TEXT, p_user_id UUID)
RETURNS TABLE (rank INTEGER, skor_awarded NUMERIC, claimed BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT h.rank, h.skor_awarded, true
  FROM public.season_reward_history_char h
  WHERE h.year_month = p_year_month AND h.character_type = p_character_type AND h.user_id = p_user_id
  UNION ALL
  SELECT w.rank, w.skor_awarded, false
  FROM public.char_season_winners(p_year_month) w
  WHERE w.character_type = p_character_type AND w.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.season_reward_history_char h2
      WHERE h2.year_month = p_year_month AND h2.character_type = p_character_type AND h2.user_id = p_user_id
    )
  LIMIT 1;
$$;

-- 3~5 는 서버만 부른다 (Supabase 는 public 의 새 함수에 anon · authenticated 실행 권한을 기본으로 준다)
REVOKE EXECUTE ON FUNCTION public.char_season_winners(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_char_season_rewards(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_char_season_reward_status(TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- 6. '보상 도착' — 다음 접속 때 클라이언트가 부른다. 안 보여 준 내 기록을 받고(get), 띄운 뒤 그 id 들만 본 것으로(ack).
--    '가져오며 표시'를 한 번에 하지 않는 것은, 띄우기 전에 화면을 떠나면 다음 접속 때 다시 보여 주기 위해서다
CREATE OR REPLACE FUNCTION public.get_season_reward_notices()
RETURNS TABLE (id UUID, year_month TEXT, character_type TEXT, rank INTEGER, skor_awarded NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT h.id, h.year_month, h.character_type, h.rank, h.skor_awarded
  FROM public.season_reward_history_char h
  WHERE h.user_id = auth.uid() AND h.notified_at IS NULL
  ORDER BY h.year_month, h.rank, h.character_type;
$$;

CREATE OR REPLACE FUNCTION public.ack_season_reward_notices(p_ids UUID[])
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH done AS (
    UPDATE public.season_reward_history_char h
    SET notified_at = now()
    WHERE h.user_id = auth.uid() AND h.id = ANY (p_ids) AND h.notified_at IS NULL
    RETURNING 1
  )
  SELECT count(*)::INTEGER FROM done;
$$;

REVOKE EXECUTE ON FUNCTION public.get_season_reward_notices() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ack_season_reward_notices(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_season_reward_notices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ack_season_reward_notices(UUID[]) TO authenticated;

-- 7. 스케줄 — 매달 1일(UTC) 매시 5분에 직전 달을 지급한다.
--    지급이 멱등이라 24번 돌아도 한 번만 들어가고, 그날 한 번이라도 성공하면 된다. 하루 내내 실패하면 수령 버튼이 대신한다
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('grant-char-season-rewards', '5 * 1 * *', 'SELECT public.grant_char_season_rewards()');
