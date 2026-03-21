import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIER_NAMES = ['똥뉴비', '피하기꾼', '번개손', '금똥전사', '다이아똥왕', '전설'];
const TIER_ICONS = ['💩', '🟤', '⚡', '🥇', '💎', '👑'];
const TIER_MINS  = [0, 500, 1000, 1500, 2000, 2500];

function getTierIndex(rp: number): number {
  for (let i = TIER_MINS.length - 1; i >= 0; i--) {
    if (rp >= TIER_MINS[i]) return i;
  }
  return 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { limit: limitParam } = await req.json().catch(() => ({}));
    const safeLimit = Math.min(Math.max(1, parseInt(limitParam ?? '20', 10)), 100);

    // JWT에서 사용자 인증 (선택적 — 비로그인 시에도 랭킹 조회 가능)
    const authHeader = req.headers.get('Authorization');
    let currentUserId: string | null = null;

    if (authHeader) {
      const supabaseUser = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await supabaseUser.auth.getUser();
      currentUserId = user?.id ?? null;
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // 랭킹 뷰 조회 (rating_points DESC 정렬)
    const { data: leaderboard, error: leaderboardError } = await supabaseAdmin
      .from('battle_leaderboard_view')
      .select('user_id, rating_points, wins, losses, disconnects, win_rate, initials')
      .limit(safeLimit);

    if (leaderboardError) {
      console.error('Leaderboard query error:', leaderboardError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch leaderboard' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const entries = (leaderboard ?? []).map((entry, index) => {
      const rp: number = (entry.rating_points as number) ?? 1000;
      const tierIdx = getTierIndex(rp);
      return {
        rank: index + 1,
        userId: entry.user_id,
        userName: (entry.initials as string | null) ?? '???',
        wins: entry.wins,
        losses: entry.losses,
        disconnects: entry.disconnects,
        totalWins: (entry.wins as number) + (entry.disconnects as number),
        winRate: Number(entry.win_rate),
        ratingPoints: rp,
        tierName: TIER_NAMES[tierIdx],
        tierIcon: TIER_ICONS[tierIdx],
      };
    });

    // 현재 유저 순위 조회
    // 이미 상위 N명 뷰에 있으면 추가 쿼리 없이 entries에서 바로 계산
    let currentUserRank: {
      rank: number;
      totalWins: number;
      winRate: number;
      ratingPoints: number;
    } | null = null;

    if (currentUserId) {
      const myInTop = entries.find(e => e.userId === currentUserId);

      if (myInTop) {
        // 상위 N명 안 → 뷰 데이터 재사용 (추가 DB 조회 불필요)
        currentUserRank = {
          rank: myInTop.rank,
          totalWins: myInTop.totalWins,
          winRate: myInTop.winRate,
          ratingPoints: myInTop.ratingPoints,
        };
      } else {
        // 상위 N명 밖 → battle_records 단건 조회 + RPC로 rank 계산
        const { data: userRecord } = await supabaseAdmin
          .from('battle_records')
          .select('wins, losses, disconnects, rating_points')
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (userRecord) {
          const rp: number = (userRecord as { rating_points: number }).rating_points ?? 1000;
          const totalWins = (userRecord.wins as number) + (userRecord.disconnects as number);
          const { data: rankResult } = await supabaseAdmin
            .rpc('get_battle_rank_by_rp', { p_rp: rp });

          const totalGames =
            (userRecord.wins as number) +
            (userRecord.losses as number) +
            (userRecord.disconnects as number);
          const winRate = totalGames === 0
            ? 0
            : Math.round(totalWins / totalGames * 1000) / 10;

          currentUserRank = {
            rank: Number(rankResult ?? 0) + 1,
            totalWins,
            winRate,
            ratingPoints: rp,
          };
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        leaderboard: entries,
        currentUserRank,
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
