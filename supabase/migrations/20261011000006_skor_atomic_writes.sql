-- SKOR 잔액 쓰기를 원자적으로 — 더하기(skor_credit) · 빼기(skor_spend)
-- 실행: Supabase Dashboard > SQL Editor에 붙여넣기 — 이 함수를 쓰는 Edge Function(skor-submit · gacha-pull ·
--       claim-season-reward) 배포 "전에"
--
-- 그전에는 세 Edge Function 이 잔액을 SELECT 한 뒤 계산한 절대값을 upsert 했다.
-- 두 쓰기가 겹치면 나중 것이 앞의 몫을 덮는다 — 정산 중에 뽑기를 하거나, 두 탭에서 동시에 뽑으면
-- 한쪽 금액이 사라지거나 비용이 한 번만 빠진다. 월초 시즌 보상 자동 지급(20261011000007)은 사용자가 누르지 않은
-- 시각에 잔액을 바꾸므로 이 경합이 지급액 유실로 이어진다 (리뷰 ecb60c70 P1 재현). 그래서 모든 쓰기를 한 문장 가감으로 바꾼다.
--
-- 셈은 기존 코드와 같다 (NULL 잔액은 0 으로):
--   잔액     = floor(잔액 + 금액)
--   주간 집계 = p_reset_week 이면 claim-season-reward 의 updateUserSkor 처럼 — 같은 UTC 주(월요일 시작)면 더하고 아니면 금액으로
--              아니면 skor-submit 처럼 — 늘 더하고 week_start 는 비어 있을 때만 채운다
--   행이 없으면 금액으로 만든다 (기존 upsert 와 같음)

CREATE OR REPLACE FUNCTION public.skor_credit(p_user_id UUID, p_amount NUMERIC, p_reset_week BOOLEAN)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.user_skor AS us (user_id, balance, weekly_earned, week_start, updated_at)
  VALUES (p_user_id, floor(p_amount), floor(p_amount), date_trunc('week', now() AT TIME ZONE 'UTC')::DATE, now())
  ON CONFLICT (user_id) DO UPDATE SET
    balance       = floor(coalesce(us.balance, 0) + p_amount),
    weekly_earned = CASE WHEN p_reset_week AND us.week_start IS DISTINCT FROM EXCLUDED.week_start
                         THEN floor(p_amount)
                         ELSE floor(coalesce(us.weekly_earned, 0) + p_amount) END,
    week_start    = CASE WHEN p_reset_week THEN EXCLUDED.week_start
                         ELSE coalesce(us.week_start, EXCLUDED.week_start) END,
    updated_at    = EXCLUDED.updated_at
  RETURNING us.balance;
$$;

-- 잔액이 비용 이상일 때만 뺀다. 모자라거나 행이 없으면 NULL (gacha-pull 이 '잔액 부족'으로 돌려준다)
CREATE OR REPLACE FUNCTION public.skor_spend(p_user_id UUID, p_cost NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.user_skor
  SET balance = balance - p_cost, updated_at = now()
  WHERE user_id = p_user_id AND p_cost > 0 AND balance >= p_cost
  RETURNING balance;
$$;

-- 서버(Edge Function service role · 다른 DB 함수)만 부른다
REVOKE EXECUTE ON FUNCTION public.skor_credit(UUID, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.skor_spend(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
