-- 신규 유저 웰컴 보너스를 서버가 지급한다 (1/2 — 새 클라이언트 배포 "전에" 적용)
-- 실행: Supabase Dashboard > SQL Editor에 붙여넣기
--
-- 그전에는 클라이언트(src/utils/skor.ts)가 user_skor 에 balance 를 직접 insert 했다.
-- 운영에만 있던 INSERT 정책은 user_id 만 보고 balance 를 보지 않아서,
-- 새 익명 계정이 아무 잔액(numeric(10,1) 한도까지)으로 자기 행을 만들 수 있었다.
-- 이제 보너스 값은 아래 grant_welcome_skor 한 곳에서만 정한다.
--
-- 클라이언트 insert 경로를 닫는 정책 삭제는 20261011000002 — 이 파일 바로 뒤에 적용한다.
-- 이 파일이 끝나면 모든 계정에 행이 있다 (새 계정은 가입 트리거, 기존 무행 계정은 4번 일괄 지급).
-- 그래서 구 클라이언트(토스 빌드 · 새로고침 안 한 탭)는 SELECT 에서 행을 보고 자기 insert 를 타지 않는다
-- — 정책을 지워도 구 클라이언트가 깨지지 않는다.

-- 1. 행이 없을 때만 웰컴 보너스로 만든다. 이미 있는 행은 건드리지 않는다.
--    남의 user_id 로 부르지 못하게 클라이언트 실행 권한을 닫는다
--    (Supabase 는 public 스키마의 새 함수에 anon · authenticated 실행 권한을 기본으로 준다)
CREATE OR REPLACE FUNCTION public.grant_welcome_skor(p_user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.user_skor (user_id, balance, weekly_earned)
  VALUES (p_user_id, 10000, 0)
  ON CONFLICT (user_id) DO NOTHING;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_welcome_skor(UUID) FROM PUBLIC, anon, authenticated;

-- 2. 새 계정: 가입 순간 행을 만든다.
--    여기서 실패해도 가입은 막지 않는다 — 첫 조회 때 get_skor_balance 가 다시 채운다
CREATE OR REPLACE FUNCTION public.handle_new_user_skor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM public.grant_welcome_skor(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'grant_welcome_skor failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_skor ON auth.users;
CREATE TRIGGER on_auth_user_created_skor
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_skor();

-- 3. 첫 조회: 행이 없으면(트리거 전에 가입한 계정 등) 채운 뒤 내 잔액을 돌려준다
CREATE OR REPLACE FUNCTION public.get_skor_balance()
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_balance NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM public.grant_welcome_skor(v_uid);

  SELECT balance INTO v_balance FROM public.user_skor WHERE user_id = v_uid;
  RETURN v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_skor_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_skor_balance() TO authenticated;

-- 4. 이미 가입했는데 행이 없는 계정을 지금 채운다 (2026-10-11 운영 77개).
--    구 클라이언트는 get_skor_balance 를 부르지 않아 3번 경로로는 못 채우고, 트리거는 소급하지 않는다.
--    트리거(2번) 뒤에 두어 그 사이 가입은 트리거가 맡는다. 이미 행이 있는 계정은 건드리지 않는다
DO $$
BEGIN
  PERFORM public.grant_welcome_skor(u.id)
  FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM public.user_skor s WHERE s.user_id = u.id);
END;
$$;
