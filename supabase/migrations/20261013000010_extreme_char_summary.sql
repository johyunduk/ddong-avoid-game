-- EXTREME 캐릭터별 랭킹 요약 — 한 번의 호출로 그 달 캐릭터마다 { 인원 · 1위 점수 · 내 순위 · 내 점수 · 보상권 }
-- 실행: Supabase Dashboard > SQL Editor 에 붙여넣기 (또는 db query -f) — leaderboard-top 요약 모드 배포 "전에"
-- 앞에 적용돼 있어야 하는 것: 20261011000007 (char_season_winners — 보상권 판정을 그대로 쓴다)
--
-- 그전에는 leaderboard-top 이 characterType 하나씩만 받아서, 랭킹의 캐릭터 고르기 화면이 캐릭터 수만큼 불러야 했다.
-- 순위는 캐릭터별 랭킹(get_extreme_char_leaderboard_with_rank)과 같은 셈이다 — 점수 내림차순 rank(), 동점은 같은 순위.
-- 보상권은 char_season_winners 를 그대로 거친다 — 1~3위 · 최소 인원 · 최소 점수 · 지급 스위치 · 시작 달이
-- 월초 자동 지급과 한 곳에서 판정된다 (설정은 char_season_reward_settings, 클라이언트는 못 읽는다).
-- 남의 user_id 는 내리지 않는다 — 캐릭터별 집계(인원 · 1위 점수)와 p_user_id 의 행만 돌려준다.
-- 그 달 기록이 없는 캐릭터는 행이 없다 (인원 0). p_user_id 가 NULL(비로그인)이면 내 순위 · 점수 · 보상은 NULL.
CREATE OR REPLACE FUNCTION public.get_extreme_char_summary(p_year_month TEXT, p_user_id UUID DEFAULT NULL)
RETURNS TABLE (character_type TEXT, players INTEGER, top_score INTEGER, my_rank INTEGER, my_score INTEGER, reward_skor NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ranked AS (
    SELECT e.user_id, e.character_type, e.score,
           (rank() OVER (PARTITION BY e.character_type ORDER BY e.score DESC))::INTEGER AS r
    FROM public.leaderboard_extreme_char e
    WHERE e.year_month = p_year_month
  ), agg AS (
    SELECT ranked.character_type, count(*)::INTEGER AS players, max(ranked.score)::INTEGER AS top_score
    FROM ranked
    GROUP BY ranked.character_type
  ), mine AS (
    -- (user_id, year_month, character_type) 가 기본 키라 캐릭터마다 많아야 한 행
    SELECT ranked.character_type, ranked.r, ranked.score
    FROM ranked
    WHERE p_user_id IS NOT NULL AND ranked.user_id = p_user_id
  ), won AS (
    SELECT w.character_type, w.skor_awarded
    FROM public.char_season_winners(p_year_month) w
    WHERE p_user_id IS NOT NULL AND w.user_id = p_user_id
  )
  SELECT agg.character_type, agg.players, agg.top_score, mine.r, mine.score, won.skor_awarded
  FROM agg
  LEFT JOIN mine ON mine.character_type = agg.character_type
  LEFT JOIN won ON won.character_type = agg.character_type
  ORDER BY agg.character_type;
$$;

-- 서버(leaderboard-top, service role)만 부른다 — p_user_id 를 아무거나 넘기면 남의 순위를 볼 수 있으므로
-- (Supabase 는 public 의 새 함수에 anon · authenticated 실행 권한을 기본으로 준다)
REVOKE EXECUTE ON FUNCTION public.get_extreme_char_summary(TEXT, UUID) FROM PUBLIC, anon, authenticated;
