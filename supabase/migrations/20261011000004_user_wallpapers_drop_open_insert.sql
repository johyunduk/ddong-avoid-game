-- user_wallpapers 의 열린 INSERT 정책을 지운다 — 배경화면은 gacha-pull 만 넣는다
-- 실행: Supabase Dashboard > SQL Editor에 붙여넣기
--
-- 20260315_user_wallpapers.sql 의 'service role can insert wallpapers' 는 이름과 달리 역할 제한이 없고(PUBLIC)
-- WITH CHECK (true) 였다 — 아무 클라이언트나 아무 user_id 에 배경화면 행을 넣을 수 있었다.
-- service role 은 원래 RLS 를 우회하므로 gacha-pull 에는 이 정책이 필요 없다.
-- 쓰는 곳은 gacha-pull(service role) 하나이고, 게임 코드(src/utils/gacha.ts)는 SELECT 만 한다.
-- 읽기 정책 'users can view own wallpapers' 는 그대로 둔다.
DROP POLICY IF EXISTS "service role can insert wallpapers" ON public.user_wallpapers;
