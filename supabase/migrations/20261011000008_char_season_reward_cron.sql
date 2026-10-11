-- 캐릭터별 시즌 보상 월초 자동 지급 — 지급 스위치와 스케줄 켜기
-- 실행: Supabase Dashboard > SQL Editor에 붙여넣기
-- 반드시 맨 마지막에: 20261011000006 · 000007 적용과 skor-submit · gacha-pull · claim-season-reward · leaderboard-top
-- 배포가 끝난 "뒤에". 그 전에 켜면 구 Edge Function 의 '읽고 절대값 쓰기'가 지급액을 덮을 수 있다 (000006 머리말).
--
-- 매달 1일(UTC) 매시 5분에 직전 달을 지급한다. 지급이 멱등이라 24번 돌아도 한 번만 들어가고,
-- 그날 한 번이라도 성공하면 된다. 하루 내내 실패하면 랭킹의 '캐릭터 보상' 버튼이 같은 지급을 대신한다.
-- 시각은 cron.timezone 기준이다 (pg_cron 기본 GMT) — 적용 뒤 SHOW cron.timezone 으로 확인한다.
--
-- 스위치를 켜기 전에는 버튼 경로(claim-season-reward)도 지급하지 않는다 — 배포가 끝나기 전에 지급이 시작되지 않게.
-- 시작 달(first_year_month, 기본 2026-10) 전의 달은 켠 뒤에도 지급하지 않는다.
UPDATE public.char_season_reward_settings SET enabled = true, updated_at = now() WHERE id;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('grant-char-season-rewards', '5 * 1 * *', 'SELECT public.grant_char_season_rewards()');
