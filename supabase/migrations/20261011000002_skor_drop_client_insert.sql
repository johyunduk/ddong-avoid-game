-- 신규 유저 웰컴 보너스를 서버가 지급한다 (2/2 — 20261011000001 바로 뒤, 새 클라이언트 배포 "전에" 적용)
-- 실행: Supabase Dashboard > SQL Editor에 붙여넣기
--
-- 클라이언트의 user_skor 직접 insert 경로를 닫는다. 보너스는 20261011000001 의 서버 함수가 준다.
-- 적용 전 확인: 000001 이 오류 없이 끝났고, 행 없는 계정이 0 이어야 한다 (000001 의 4번이 채운다)
-- — 그래야 구 클라이언트가 insert 를 타지 않는다. 0 이 아니면 적용하지 말고 멈춘다
--   SELECT count(*) FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.user_skor s WHERE s.user_id = u.id);
-- 'Users can insert own row' 는 저장소 마이그레이션 없이 운영에서 만들어져 있었다 (2026-10-11 확인).
-- 적용 뒤 user_skor 정책은 20260301_skor_system.sql 의 SELECT 하나만 남아 저장소와 운영이 같아진다.
DROP POLICY IF EXISTS "Users can insert own row" ON public.user_skor;
