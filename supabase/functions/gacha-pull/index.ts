import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GACHA_ROSTER, GACHA_WALLPAPERS } from '../_shared/roster.ts';
import {
  BANNERS, DEFAULT_BANNER_ID, PULL_COUNT, RATES_VERSION, bannerRates, drawSlots, getBanner, isBannerOpen, pullPrice,
  type BannerRates,
} from '../_shared/banners.ts';
import { corsHeaders, json, pityOf, rand, readRequestId, reject, rpcError, starterOf, type CommitResult } from '../_shared/gacha.ts';

// ── 확률표 ──────────────────────────────────────────────────────────────
// 배너 · 확률 정본은 src/config/banners.ts (서버 사본 _shared/banners.ts 는 생성물). 여기에 풀 · 가중치를 적지 않는다 —
// 화면의 확률 보기와 같은 bannerRates · 같은 명단(_shared/roster.ts 생성물)으로 부팅 때 배너마다 한 번 계산한다.
// 명단과 배너가 어긋나면(픽업 id 가 명단에 없는 등) 여기서 던져 부팅이 실패한다 — 조용히 틀린 확률로 뽑느니 바로 터지는 쪽이 낫다
const RATES = new Map<string, BannerRates>(BANNERS.map(b => [b.id, bannerRates(b, GACHA_ROSTER, GACHA_WALLPAPERS)]));

// ── 요청 처리 ───────────────────────────────────────────────────────────
// 입력: { pullType: 'single' | 'multi', bannerId?, requestId?, starterPick? } — 픽업 배너 정의서 §6-2
// 추첨은 여기서 정본 확률표로 하고, 차감 · 천장 · 초보자 · 지급 · 기록은 DB 함수 gacha_pull_commit 이 한 트랜잭션에서 한다
// (20261011000009). 초보자 50번째 보장도 초보자 상태를 잠근 그 함수가 넣는다
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return reject('bad_request', 'Invalid body');

    const { pullType, starterPick } = body;
    if (pullType !== 'single' && pullType !== 'multi') return reject('bad_request', 'Invalid pullType');

    // bannerId 가 없으면 상시 — 배너 이전 클라이언트 호환
    const bannerId = body.bannerId ?? DEFAULT_BANNER_ID;
    const banner = typeof bannerId === 'string' ? getBanner(bannerId) : undefined;
    if (!banner || !isBannerOpen(banner, Date.now())) return reject('banner_closed', 'Banner closed');

    const cost = pullPrice(banner, pullType);
    if (cost === null) return reject('starter_single', 'No single pull on this banner');

    // 초보자 배너에서만, 그 배너의 보장 후보 중 하나. 저장된 값을 바꾼다
    if (starterPick !== undefined && starterPick !== null
      && !(typeof starterPick === 'string' && banner.starter?.pickFrom.includes(starterPick))) {
      return reject('bad_request', 'Invalid starterPick');
    }

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

    // ── 추첨 — 칸마다 배경화면 또는 캐릭터, 10연이면 SR 이상 1장 확정 (정의서 §2-4) ──
    const slots = drawSlots(RATES.get(banner.id)!, PULL_COUNT[pullType], rand);

    // ── 차감 · 천장 · 초보자 · 지급 · 기록 — 한 트랜잭션 ──
    const { data, error } = await supabaseAdmin.rpc('gacha_pull_commit', {
      p_user_id: user.id,
      p_request_id: requestId,
      p_banner_id: banner.id,
      p_cost: cost,
      p_slots: slots,
      p_pity_track: banner.pity?.track ?? null,
      p_starter: banner.starter ? { max: banner.starter.maxPulls, pick: starterPick ?? null } : null,
      p_rates_version: RATES_VERSION,
    });
    if (error) return rpcError(error);

    const r = data as CommitResult;
    // 같은 requestId 가 다른 일(교환 · 다른 배너)에 이미 쓰였다 — 그 결과를 이 배너의 뽑기로 돌려주지 않는다
    if (r.kind !== 'pull' || r.bannerId !== banner.id) return reject('bad_request', 'requestId already used');

    const characters = r.results
      .filter(s => s.kind === 'character')
      .map(s => ({ id: s.id, grade: s.grade, isNew: s.isNew, guaranteed: s.guaranteed ?? null }));
    const wallpapers = r.results
      .filter(s => s.kind === 'wallpaper')
      .map(s => ({ id: s.id, isNew: s.isNew }));

    return json(200, {
      success: true,
      bannerId: banner.id,
      video: characters.some(c => c.grade === 'UR') ? 'red' : 'green',
      characters,
      wallpapers,
      remainingSkor: Math.floor(Number(r.balance ?? 0)),
      pity: pityOf(banner, r.pityPoints),
      starter: starterOf(r.starter),
      ratesVersion: r.ratesVersion,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return json(500, { error: 'Internal server error', code: 'server' });
  }
});
