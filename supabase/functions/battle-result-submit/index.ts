import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_RESULTS = ['win', 'lose', 'disconnect'] as const;
type BattleResultValue = typeof VALID_RESULTS[number];

// ── 티어 계산 (battleTier.ts 로직 인라인 — Deno에서 로컬 TS 공유 불가) ──

interface TierDef {
  minRp: number;
  maxRp: number;
}

const TIERS: TierDef[] = [
  { minRp: 0,    maxRp: 499 },
  { minRp: 500,  maxRp: 999 },
  { minRp: 1000, maxRp: 1499 },
  { minRp: 1500, maxRp: 1999 },
  { minRp: 2000, maxRp: Infinity },
];

const TIER_NAMES = ['알파', '베타', '레거시', '마스터', '갓'];
const TIER_ICONS = ['🔴', '🟠', '🟡', '💎', '👑'];

function getTierIndex(rp: number): number {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (rp >= TIERS[i].minRp) return i;
  }
  return 0;
}

function calcPointDelta(
  result: BattleResultValue,
  myRp: number,
  opponentRp: number,
): number {
  if (result === 'disconnect') return 20;

  const tierDiff = getTierIndex(opponentRp) - getTierIndex(myRp);

  if (result === 'win') {
    if (tierDiff >= 2)   return 35;
    if (tierDiff === 1)  return 30;
    if (tierDiff === 0)  return 25;
    if (tierDiff === -1) return 20;
    return 15;
  } else {
    if (tierDiff >= 2)   return -10;
    if (tierDiff === 1)  return -15;
    if (tierDiff === 0)  return -20;
    if (tierDiff === -1) return -25;
    return -30;
  }
}

// ── 메인 핸들러 ──

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { result, opponentId, isRanked = true } = await req.json();

    // 입력 검증
    if (!VALID_RESULTS.includes(result)) {
      return new Response(
        JSON.stringify({ error: 'Invalid result: must be win, lose, or disconnect' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // JWT 인증 (필수)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // 내 RP + 상대 RP 병렬 조회 (maybeSingle: 행 없으면 에러 없이 null 반환)
    const hasOpponent = opponentId && typeof opponentId === 'string';
    const [myResp, oppResp] = await Promise.all([
      supabaseAdmin
        .from('battle_records')
        .select('rating_points')
        .eq('user_id', user.id)
        .maybeSingle(),
      hasOpponent
        ? supabaseAdmin
            .from('battle_records')
            .select('rating_points')
            .eq('user_id', opponentId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const myRp: number = (myResp.data as { rating_points: number } | null)?.rating_points ?? 0;
    const opponentRp: number = (oppResp.data as { rating_points: number } | null)?.rating_points ?? 0;

    // RP 변동 계산 (친선전은 0 고정)
    const pointDelta = isRanked
      ? calcPointDelta(result as BattleResultValue, myRp, opponentRp)
      : 0;

    // 원자적 upsert + 전적 갱신 (DB 함수)
    const { data: records, error: rpcError } = await supabaseAdmin.rpc(
      'submit_battle_record',
      { p_user_id: user.id, p_result: result, p_point_delta: pointDelta, p_is_ranked: isRanked },
    );

    if (rpcError || !records || records.length === 0) {
      console.error('RPC error detail:', JSON.stringify(rpcError));
      console.error('records:', JSON.stringify(records));
      return new Response(
        JSON.stringify({
          error: 'Failed to update battle record',
          detail: rpcError?.message ?? 'no records returned',
          code: rpcError?.code,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const record = records[0];
    const newRp: number = record.out_rating_points;
    const totalRankedGames = record.out_wins + record.out_losses + record.out_disconnects;
    const winRate = totalRankedGames === 0
      ? 0
      : Math.round((record.out_wins + record.out_disconnects) / totalRankedGames * 1000) / 10;

    const tierIdx = getTierIndex(newRp);

    return new Response(
      JSON.stringify({
        success: true,
        previousRp: myRp,
        ratingPoints: newRp,
        pointDelta,
        wins: record.out_wins,
        losses: record.out_losses,
        disconnects: record.out_disconnects,
        friendlyWins: record.out_friendly_wins,
        friendlyLosses: record.out_friendly_losses,
        friendlyDisconnects: record.out_friendly_disconnects,
        winRate,
        rank: Number(record.out_rank),
        tierName: TIER_NAMES[tierIdx],
        tierIcon: TIER_ICONS[tierIdx],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
