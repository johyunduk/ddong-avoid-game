import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GACHA_ROSTER } from '../_shared/roster.ts';
import { RATES_VERSION, getBanner, isBannerOpen, pityChoices } from '../_shared/banners.ts';
import { corsHeaders, json, pityOf, readRequestId, reject, rpcError, type CommitResult } from '../_shared/gacha.ts';

// ── 천장 교환 ───────────────────────────────────────────────────────────
// 입력: { bannerId, targetId?, requestId } — 픽업 배너 정의서 §4 · §6-2
// 후보는 정본 pityChoices 로 검증한다 (화면의 고르기 창과 같은 함수 · 같은 명단):
//   pickupUR — targetId 를 받지 않는다 (보내면 그 배너 픽업 UR 이어야 한다)
//   chooseUR · chooseSR — targetId 가 꼭 있고 후보 안에 있어야 한다
// 포인트 확인 → 지급(이미 있으면 중복 +1) → 포인트 차감 → 기록은 DB 함수 gacha_exchange_commit 이 한 트랜잭션에서 한다
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return reject('bad_request', 'Invalid body');

    const { bannerId, targetId } = body;
    if (typeof bannerId !== 'string') return reject('bad_request', 'Missing bannerId');
    const banner = getBanner(bannerId);
    if (!banner || !isBannerOpen(banner, Date.now())) return reject('banner_closed', 'Banner closed');
    if (!banner.pity) return reject('bad_request', 'No pity on this banner');

    const choices = pityChoices(banner, GACHA_ROSTER);
    let target: string;
    if (banner.pity.exchange === 'pickupUR') {
      target = choices[0];
      if (targetId !== undefined && targetId !== null && targetId !== target) return reject('pity_target', 'Not an exchange choice');
    } else {
      if (typeof targetId !== 'string' || !choices.includes(targetId)) return reject('pity_target', 'Not an exchange choice');
      target = targetId;
    }
    const grade = GACHA_ROSTER.find(c => c.id === target)?.grade;
    if (!target || !grade) return reject('pity_target', 'Not an exchange choice');

    const requestId = readRequestId(body.requestId);
    if (requestId === null) return reject('bad_request', 'Invalid requestId');

    // 인증
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json(401, { error: 'Missing authorization header', code: 'unauthorized' });
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return json(401, { error: 'Unauthorized', code: 'unauthorized' });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabaseAdmin.rpc('gacha_exchange_commit', {
      p_user_id: user.id,
      p_request_id: requestId,
      p_banner_id: banner.id,
      p_track: banner.pity.track,
      p_threshold: banner.pity.threshold,
      p_character_id: target,
      p_grade: grade,
      p_rates_version: RATES_VERSION,
    });
    if (error) return rpcError(error);

    const r = data as CommitResult;
    // 같은 requestId 가 다른 일(뽑기 · 다른 배너)에 이미 쓰였다
    if (r.kind !== 'exchange' || r.bannerId !== banner.id) return reject('bad_request', 'requestId already used');

    const got = r.results[0];
    return json(200, {
      success: true,
      bannerId: banner.id,
      character: { id: got.id, grade: got.grade, isNew: got.isNew },
      pity: pityOf(banner, r.pityPoints),
      ratesVersion: r.ratesVersion,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return json(500, { error: 'Internal server error', code: 'server' });
  }
});
