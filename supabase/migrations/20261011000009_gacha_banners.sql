-- 픽업 배너 — 천장 · 초보자 · 뽑기 기록 표와, 뽑기 · 교환을 한 트랜잭션으로 묶는 함수
-- 실행: Supabase Dashboard > SQL Editor에 붙여넣기
--   20261011000006(skor_spend) 뒤, gacha-pull · gacha-exchange 배포 "전에".
--   순서는 DB → 두 Edge Function → 클라이언트(배너 화면). 배너 화면을 배너 이전 gacha-pull 에 붙이면 안 된다 —
--   옛 함수는 bannerId · requestId 를 몰라 어느 탭에서든 상시로 뽑고, 같은 요청이 다시 와도 또 차감한다.
--   같은 이유로 클라이언트가 나간 뒤 gacha-pull 만
--   배너 이전으로 되돌리는 롤백도 하지 않는다 (되돌릴 때는 클라이언트도 같이).
--   초보자 뽑기(할인)가 열리므로 웰컴 보너스 서버 지급(20261011000001 · 000002)이 운영에 들어간 뒤에 연다 —
--   잔액을 클라이언트가 쓸 수 있으면 할인 뽑기를 무한히 산다 (정의서 §3)
-- 기준: ~/ddong-fx-work/gacha/banner_spec_v1.md §4-5 · §6-2. 배너 · 확률 정본은 src/config/banners.ts
--
-- 추첨(난수)은 Edge Function 이 정본 확률표로 하고 결과만 넘긴다. 이 함수들은 그 결과를 받아
-- 차감 · 천장 · 초보자 · 지급 · 기록을 한 트랜잭션에서 한다. 거절은 RAISE 'gacha:<code>' — 전부 되돌린다.
-- 그전에는 잔액 · 보유를 따로 읽고 쓰는 사이가 비어 있어, 천장 · 초보자 횟수가 붙으면 두 번 누르기로
-- 초보자 50회를 넘기거나 한 번의 포인트로 두 번 교환할 수 있었다.

-- ── 1. 천장 포인트 — 줄(track)마다. 지금 track = 배너 id (정의서 §4-4) ─────────────
CREATE TABLE IF NOT EXISTS public.gacha_pity (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track       TEXT        NOT NULL,
  points      INTEGER     NOT NULL DEFAULT 0 CHECK (points >= 0),   -- 쌓인 칸 수 − 교환에 쓴 것
  total_pulls INTEGER     NOT NULL DEFAULT 0 CHECK (total_pulls >= 0),
  exchanged   INTEGER     NOT NULL DEFAULT 0 CHECK (exchanged >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track)
);

-- ── 2. 초보자 뽑기 — 계정당 한 줄. 최대 횟수 · 보장 후보는 배너 정의가 정한다 (함수 인자) ──
CREATE TABLE IF NOT EXISTS public.gacha_starter (
  user_id      UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pulls_done   INTEGER     NOT NULL DEFAULT 0 CHECK (pulls_done >= 0),
  ur_hit       BOOLEAN     NOT NULL DEFAULT false,   -- 초보자 뽑기에서 UR 이 나왔다 → 50번째 보장이 필요 없다
  pick         TEXT,                                 -- 50번째 보장으로 미리 고른 UR
  completed_at TIMESTAMPTZ,                          -- 최대 횟수를 다 쓴 때
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. 뽑기 · 교환 기록 — 감사 · 민원 대응 · 공개 확률 검증, 그리고 같은 requestId 재시도에 첫 결과를 돌려주는 데 쓴다 ──
CREATE TABLE IF NOT EXISTS public.gacha_pull_log (
  id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banner_id     TEXT        NOT NULL,
  kind          TEXT        NOT NULL CHECK (kind IN ('pull', 'exchange')),
  request_id    UUID        NOT NULL,
  pulled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cost          INTEGER     NOT NULL DEFAULT 0,   -- 교환은 0
  results       JSONB       NOT NULL,             -- 칸마다 {kind, id, grade, isNew, guaranteed} — 뽑은 순서
  pity_before   INTEGER,                          -- 초보자 뽑기는 NULL (천장 없음)
  pity_after    INTEGER,
  balance_after NUMERIC(10, 1),                   -- 뽑은 뒤 잔액. 교환은 NULL
  rates_version TEXT        NOT NULL,
  -- requestId 는 사용자마다 따로 본다 — 남의 id 와 겹쳐도 남의 결과가 돌아오지 않는다
  UNIQUE (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_gacha_pull_log_user_time ON public.gacha_pull_log (user_id, pulled_at DESC);

-- ── 4. RLS — 세 표 모두 본인 행 읽기만. 쓰기는 아래 함수(Edge Function service role)만 ──
ALTER TABLE public.gacha_pity     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gacha_starter  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gacha_pull_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gacha_pity_read_own" ON public.gacha_pity;
CREATE POLICY "gacha_pity_read_own" ON public.gacha_pity FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "gacha_starter_read_own" ON public.gacha_starter;
CREATE POLICY "gacha_starter_read_own" ON public.gacha_starter FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "gacha_pull_log_read_own" ON public.gacha_pull_log;
CREATE POLICY "gacha_pull_log_read_own" ON public.gacha_pull_log FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Supabase 기본 권한(anon · authenticated 에 ALL)을 걷고 읽기만 남긴다 — 정책이 없어 막히긴 하지만 한 겹 더
REVOKE ALL ON public.gacha_pity, public.gacha_starter, public.gacha_pull_log FROM anon, authenticated;
GRANT SELECT ON public.gacha_pity, public.gacha_starter, public.gacha_pull_log TO authenticated;

-- ── 5. 응답 모양 — 새로 처리한 것과 같은 requestId 재시도가 같은 모양을 돌려준다 ──
-- starter 는 지금 초보자 상태 (행이 없으면 null)
CREATE OR REPLACE FUNCTION public.gacha_log_response(p_log_id BIGINT, p_replay BOOLEAN)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'replay',       p_replay,
    'kind',         l.kind,
    'bannerId',     l.banner_id,
    'results',      l.results,
    'pityPoints',   l.pity_after,
    'balance',      l.balance_after,
    'ratesVersion', l.rates_version,
    'starter',      (SELECT jsonb_build_object('pullsDone', s.pulls_done, 'urHit', s.ur_hit, 'pick', s.pick)
                     FROM public.gacha_starter s WHERE s.user_id = l.user_id)
  )
  FROM public.gacha_pull_log l
  WHERE l.id = p_log_id;
$$;

-- ── 6. 뽑기 ─────────────────────────────────────────────────────────────
-- p_slots      : Edge Function 이 뽑은 칸 [{kind, id, grade, guaranteed}] — 순서대로 (10연 확정은 이미 들어 있다)
-- p_pity_track : 천장 줄. 초보자 배너는 NULL (포인트 안 쌓임)
-- p_starter    : 초보자 배너만 {max, pick} — pick 은 이번 요청에 실린 값(없으면 null, 저장된 값을 쓴다)
--
-- 초보자 50번째 보장은 여기서 넣는다 — 초보자 상태를 잠근 채로 봐야 두 번 누르기에 안 틀린다.
-- 이번 뽑기가 max 번째 칸을 품고, 그 앞 칸까지 초보자 UR 이 한 번도 없었으면 그 칸을 고른 UR 로 바꾼다
-- ('SR 확정' 칸이었어도 바꾼다 — UR 이라 확정도 채운다, 정의서 §4-3)
CREATE OR REPLACE FUNCTION public.gacha_pull_commit(
  p_user_id       UUID,
  p_request_id    UUID,
  p_banner_id     TEXT,
  p_cost          INTEGER,
  p_slots         JSONB,
  p_pity_track    TEXT,
  p_starter       JSONB,
  p_rates_version TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_log_id      BIGINT;
  v_count       INTEGER;
  v_slots       JSONB := p_slots;
  v_slot        JSONB;
  v_id          TEXT;
  v_new         BOOLEAN;
  v_results     JSONB := '[]'::jsonb;
  v_balance     NUMERIC;
  v_pity_after  INTEGER;
  v_st          public.gacha_starter;
  v_max         INTEGER;
  v_pick        TEXT;
  v_idx         INTEGER;
  v_ur_before   BOOLEAN;
BEGIN
  -- 사용자 하나의 뽑기 · 교환은 한 줄로 선다 — 두 탭 동시 뽑기, 같은 requestId 재시도가 서로를 못 본 채 쓰지 않게
  PERFORM pg_advisory_xact_lock(hashtextextended('gacha:' || p_user_id::text, 0));

  -- 같은 requestId 는 처음 결과를 그대로 (네트워크 재시도로 두 번 차감 · 두 번 천장이 쌓이지 않게)
  SELECT id INTO v_log_id FROM public.gacha_pull_log WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    RETURN public.gacha_log_response(v_log_id, true);
  END IF;

  IF jsonb_typeof(p_slots) IS DISTINCT FROM 'array' OR jsonb_array_length(p_slots) = 0 OR p_cost IS NULL OR p_cost <= 0 THEN
    RAISE EXCEPTION 'gacha:bad_request' USING DETAIL = 'slots · cost';
  END IF;
  v_count := jsonb_array_length(p_slots);

  -- 초보자: 잠그고, 남은 횟수 · 보장 후보를 본다
  IF p_starter IS NOT NULL THEN
    v_max := (p_starter->>'max')::INTEGER;
    IF v_max IS NULL OR v_max <= 0 THEN
      RAISE EXCEPTION 'gacha:bad_request' USING DETAIL = 'starter max';
    END IF;
    INSERT INTO public.gacha_starter (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_st FROM public.gacha_starter WHERE user_id = p_user_id FOR UPDATE;
    IF v_st.pulls_done + v_count > v_max THEN
      RAISE EXCEPTION 'gacha:starter_done' USING DETAIL = v_st.pulls_done::text;
    END IF;
    v_pick := coalesce(p_starter->>'pick', v_st.pick);
    v_ur_before := v_st.ur_hit;
    IF v_st.pulls_done + v_count >= v_max THEN
      -- 이번이 마지막 — 아직 UR 이 없는데 고른 값도 없으면 거절 (화면이 고르기 창을 먼저 띄운다).
      -- 초보자 UR 을 이미 뽑았으면(ur_hit) 보장이 쓰이지 않으므로 고르지 않아도 된다 — 화면은 토글을 흐리게 하고
      -- 'UR 획득 — 보장 없이 진행' 으로 그대로 뽑는다 (dev2 화면 계획 §6, director 승인 2026-10-11).
      -- 정의서 §3 · §6-2 의 'pick 없음 거절' 문장에는 이 예외가 아직 안 적혀 있다
      IF NOT v_ur_before AND v_pick IS NULL THEN
        RAISE EXCEPTION 'gacha:starter_pick_required';
      END IF;
      v_idx := v_max - v_st.pulls_done - 1;   -- 이번 칸 중 max 번째 (0부터)
      IF NOT v_ur_before AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_slots) WITH ORDINALITY AS e(slot, n)
        WHERE e.n <= v_idx AND e.slot->>'kind' = 'character' AND e.slot->>'grade' = 'UR'
      ) THEN
        v_slots := jsonb_set(v_slots, ARRAY[v_idx::text],
          jsonb_build_object('kind', 'character', 'id', v_pick, 'grade', 'UR', 'guaranteed', 'starterUR'));
      END IF;
    END IF;
  END IF;

  -- SKOR 차감 — 잔액이 비용 이상일 때만 (20261011000006)
  v_balance := public.skor_spend(p_user_id, p_cost);
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'gacha:insufficient_skor'
      USING DETAIL = coalesce((SELECT floor(balance)::text FROM public.user_skor WHERE user_id = p_user_id), '0');
  END IF;

  -- 지급 — 칸 순서대로. 같은 뽑기 안에서 두 번 나오면 두 번째부터 중복 (기존 gacha-pull 과 같다)
  FOR i IN 0 .. v_count - 1 LOOP
    v_slot := v_slots->i;
    v_id := v_slot->>'id';
    IF v_slot->>'kind' = 'character' THEN
      INSERT INTO public.user_characters (user_id, character_id) VALUES (p_user_id, v_id) ON CONFLICT DO NOTHING;
      v_new := FOUND;
      IF NOT v_new THEN
        UPDATE public.user_characters SET duplicate_count = duplicate_count + 1
        WHERE user_id = p_user_id AND character_id = v_id;
      END IF;
    ELSIF v_slot->>'kind' = 'wallpaper' THEN
      INSERT INTO public.user_wallpapers (user_id, wallpaper_id) VALUES (p_user_id, v_id) ON CONFLICT DO NOTHING;
      v_new := FOUND;
    ELSE
      RAISE EXCEPTION 'gacha:bad_request' USING DETAIL = 'slot kind';
    END IF;
    v_results := v_results || jsonb_build_object(
      'kind', v_slot->>'kind', 'id', v_id, 'grade', v_slot->'grade', 'isNew', v_new, 'guaranteed', v_slot->'guaranteed');
  END LOOP;

  -- 초보자 상태
  IF p_starter IS NOT NULL THEN
    UPDATE public.gacha_starter SET
      pulls_done   = pulls_done + v_count,
      ur_hit       = ur_hit OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_results) r
                                       WHERE r->>'kind' = 'character' AND r->>'grade' = 'UR'),
      pick         = v_pick,
      completed_at = CASE WHEN pulls_done + v_count >= v_max THEN now() ELSE completed_at END,
      updated_at   = now()
    WHERE user_id = p_user_id;
  END IF;

  -- 천장 — 뽑은 칸 수만큼 (배경 칸 · 확정 칸도 센다)
  IF p_pity_track IS NOT NULL THEN
    INSERT INTO public.gacha_pity AS gp (user_id, track, points, total_pulls)
    VALUES (p_user_id, p_pity_track, v_count, v_count)
    ON CONFLICT (user_id, track) DO UPDATE SET
      points      = gp.points + v_count,
      total_pulls = gp.total_pulls + v_count,
      updated_at  = now()
    RETURNING gp.points INTO v_pity_after;
  END IF;

  INSERT INTO public.gacha_pull_log
    (user_id, banner_id, kind, request_id, cost, results, pity_before, pity_after, balance_after, rates_version)
  VALUES
    (p_user_id, p_banner_id, 'pull', p_request_id, p_cost, v_results,
     v_pity_after - v_count, v_pity_after, v_balance, p_rates_version)
  RETURNING id INTO v_log_id;

  RETURN public.gacha_log_response(v_log_id, false);
END;
$$;

-- ── 7. 천장 교환 ─────────────────────────────────────────────────────────
-- 후보 검증(pityChoices)과 등급은 Edge Function 이 정본으로 한다. 여기는 포인트 ≥ 기준 확인 → 지급 → 차감 → 기록
CREATE OR REPLACE FUNCTION public.gacha_exchange_commit(
  p_user_id       UUID,
  p_request_id    UUID,
  p_banner_id     TEXT,
  p_track         TEXT,
  p_threshold     INTEGER,
  p_character_id  TEXT,
  p_grade         TEXT,
  p_rates_version TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_log_id BIGINT;
  v_points INTEGER;
  v_new    BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('gacha:' || p_user_id::text, 0));

  SELECT id INTO v_log_id FROM public.gacha_pull_log WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    RETURN public.gacha_log_response(v_log_id, true);
  END IF;

  IF p_threshold IS NULL OR p_threshold <= 0 OR p_character_id IS NULL OR p_track IS NULL THEN
    RAISE EXCEPTION 'gacha:bad_request' USING DETAIL = 'track · threshold · character';
  END IF;

  SELECT points INTO v_points FROM public.gacha_pity WHERE user_id = p_user_id AND track = p_track FOR UPDATE;
  IF coalesce(v_points, 0) < p_threshold THEN
    RAISE EXCEPTION 'gacha:pity_short' USING DETAIL = coalesce(v_points, 0)::text;
  END IF;

  UPDATE public.gacha_pity SET points = points - p_threshold, exchanged = exchanged + 1, updated_at = now()
  WHERE user_id = p_user_id AND track = p_track;

  -- 이미 가진 캐릭터면 중복 +1 (각성 재료) — 뽑기에서 중복이 나온 것과 같다
  INSERT INTO public.user_characters (user_id, character_id) VALUES (p_user_id, p_character_id) ON CONFLICT DO NOTHING;
  v_new := FOUND;
  IF NOT v_new THEN
    UPDATE public.user_characters SET duplicate_count = duplicate_count + 1
    WHERE user_id = p_user_id AND character_id = p_character_id;
  END IF;

  INSERT INTO public.gacha_pull_log
    (user_id, banner_id, kind, request_id, cost, results, pity_before, pity_after, balance_after, rates_version)
  VALUES
    (p_user_id, p_banner_id, 'exchange', p_request_id, 0,
     jsonb_build_array(jsonb_build_object('kind', 'character', 'id', p_character_id, 'grade', p_grade,
                                          'isNew', v_new, 'guaranteed', NULL)),
     v_points, v_points - p_threshold, NULL, p_rates_version)
  RETURNING id INTO v_log_id;

  RETURN public.gacha_log_response(v_log_id, false);
END;
$$;

-- 서버(Edge Function service role)만 부른다
REVOKE EXECUTE ON FUNCTION public.gacha_log_response(BIGINT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gacha_pull_commit(UUID, UUID, TEXT, INTEGER, JSONB, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gacha_exchange_commit(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gacha_log_response(BIGINT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.gacha_pull_commit(UUID, UUID, TEXT, INTEGER, JSONB, TEXT, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.gacha_exchange_commit(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO service_role;
