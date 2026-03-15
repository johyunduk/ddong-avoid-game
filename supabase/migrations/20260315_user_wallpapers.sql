-- 배경화면 수집 시스템 마이그레이션
-- 실행: Supabase Dashboard > SQL Editor에서 실행

CREATE TABLE public.user_wallpapers (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallpaper_id TEXT NOT NULL,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, wallpaper_id)
);

ALTER TABLE public.user_wallpapers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own wallpapers"
  ON public.user_wallpapers FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "service role can insert wallpapers"
  ON public.user_wallpapers FOR INSERT
  WITH CHECK (true); -- Edge Function은 service_role key 사용
