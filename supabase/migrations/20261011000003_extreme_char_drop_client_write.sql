-- leaderboard_extreme_char 의 클라이언트 쓰기 정책을 지운다 — 점수는 leaderboard-submit 만 쓴다
-- 실행: Supabase Dashboard > SQL Editor에 붙여넣기
--
-- 20260515_leaderboard_extreme_char.sql 이 '본인만 쓰기'로 INSERT · UPDATE 를 열어 두었다.
-- 그래서 클라이언트가 leaderboard-submit 의 세션 · 경과 시간 · 점수 상한 검사를 건너뛰고 자기 점수를 직접 쓸 수 있었다
-- — 지난달(year_month) 행을 만들어 넣으면 claim-season-reward 가 그 점수로 캐릭터별 1~3위 SKOR 를 준다.
-- 쓰는 곳은 leaderboard-submit 하나이고 service role(RLS 우회)이다. claim-season-reward 는 읽기만 한다.
-- 게임 코드(src/)는 이 표를 한 번도 쓴 적이 없다 (git 이력 기준) — 구 클라이언트도 영향 없다.
-- 읽기 정책 extreme_char_read_all 과 순위 RPC(SECURITY DEFINER)는 그대로 둔다.
DROP POLICY IF EXISTS "extreme_char_insert_own" ON public.leaderboard_extreme_char;
DROP POLICY IF EXISTS "extreme_char_update_own" ON public.leaderboard_extreme_char;
