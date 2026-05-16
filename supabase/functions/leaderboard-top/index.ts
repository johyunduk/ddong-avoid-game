import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** 현재 달 'YYYY-MM' 반환 (UTC 기준) */
function getCurrentYearMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** 직전 달 'YYYY-MM' 반환 */
function getPrevYearMonth(current: string): string {
  const [y, m] = current.split('-').map(Number) as [number, number];
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 시즌 번호: 2026-01 = 1, 2026-02 = 2, ... */
function calcSeason(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number) as [number, number];
  return (y - 2026) * 12 + m;
}

/** 난이도별 시즌 보상 티어 (퍼센타일 기반) */
const REWARD_TIERS = {
  normal:   { r1: 6000,  r2: 4000,  r3: 2000,  top10: 1000, top50: 600,  rest: 200 },
  hard:     { r1: 12000, r2: 8000,  r3: 4000,  top10: 2000, top50: 1200, rest: 400 },
  extreme:  { r1: 30000, r2: 20000, r3: 10000, top10: 5000, top50: 3000, rest: 1000 },
  physical: { r1: 30000, r2: 20000, r3: 10000, top10: 5000, top50: 3000, rest: 1000 },
} as const;

type RewardDifficulty = keyof typeof REWARD_TIERS;

function getReward(difficulty: string, rank: number, totalPlayers: number): number {
  const tier = REWARD_TIERS[difficulty as RewardDifficulty];
  if (!tier) return 0;
  if (rank === 1) return tier.r1;
  if (rank === 2) return tier.r2;
  if (rank === 3) return tier.r3;
  const percentile = rank / totalPlayers;
  if (percentile <= 0.10) return tier.top10;
  if (percentile <= 0.50) return tier.top50;
  return tier.rest;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { difficulty, limit: limitParam, characterType, yearMonth: requestedYM } = await req.json().catch(() => ({}));
    const limit = parseInt(limitParam ?? '100', 10);

    // 입력 검증
    const validDifficulties = ['easy', 'normal', 'hard', 'extreme', 'physical'];
    if (!difficulty || !validDifficulties.includes(difficulty)) {
      return new Response(
        JSON.stringify({ error: 'Invalid difficulty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);

    // 요청된 월이 있으면 사용 (과거 시즌 조회), 없으면 현재 월
    const currentYM = getCurrentYearMonth();
    const EARLIEST_YM = '2026-01';
    let yearMonth = currentYM;
    if (requestedYM && /^\d{4}-\d{2}$/.test(requestedYM)
        && requestedYM >= EARLIEST_YM && requestedYM <= currentYM) {
      yearMonth = requestedYM;
    }
    const isCurrentSeason = yearMonth === currentYM;

    // JWT에서 사용자 인증 (선택적 — 비로그인 시에도 랭킹 조회 가능)
    const authHeader = req.headers.get('Authorization');
    let currentUserId: string | null = null;

    if (authHeader) {
      const supabaseUser = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabaseUser.auth.getUser();
      currentUserId = user?.id ?? null;
    }

    // Service Role 클라이언트 (profiles JOIN을 위해)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const prevYearMonth = getPrevYearMonth(yearMonth);

    // EXTREME 캐릭터 필터: RPC로 리더보드 + 내 순위 단일 쿼리
    if (characterType && difficulty === 'extreme') {
      const { data: charData, error: charError } = await supabaseAdmin.rpc(
        'get_extreme_char_leaderboard_with_rank',
        { p_year_month: yearMonth, p_character_type: characterType, p_limit: safeLimit, p_user_id: currentUserId }
      );

      if (charError) {
        console.error('Extreme char leaderboard error:', charError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch character leaderboard' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const rows = charData ?? [];
      const charEntries = rows.map((r: { user_id: string; score: number; character_type: string; initials: string | null; rank: number }) => ({
        userId: r.user_id,
        userName: r.initials ?? '???',
        score: r.score,
        rank: r.rank,
        characterType: r.character_type ?? 'chibi',
      }));

      const myRow = rows.find((r: { is_mine: boolean }) => r.is_mine);
      const charCurrentUserRank = myRow ? { rank: myRow.rank, score: myRow.score } : null;

      let charPrevSeasonReward: {
        yearMonth: string; rank: number | null; skorAwarded: number; alreadyClaimed: boolean;
      } | null = null;

      if (currentUserId && isCurrentSeason) {
        const [prevRankResult, claimResult] = await Promise.all([
          supabaseAdmin.rpc('get_extreme_char_leaderboard_with_rank', {
            p_year_month: prevYearMonth, p_character_type: characterType,
            p_limit: 0, p_user_id: currentUserId,
          }),
          supabaseAdmin.from('season_reward_history_char').select('id')
            .eq('user_id', currentUserId).eq('year_month', prevYearMonth)
            .eq('character_type', characterType).single(),
        ]);

        const prevMyRow = (prevRankResult.data ?? []).find((r: { is_mine: boolean }) => r.is_mine);
        if (prevMyRow) {
          const CHAR_REWARDS: Record<number, number> = { 1: 5000, 2: 3000, 3: 1500 };
          charPrevSeasonReward = {
            yearMonth: prevYearMonth,
            rank: prevMyRow.rank,
            skorAwarded: CHAR_REWARDS[prevMyRow.rank] ?? 0,
            alreadyClaimed: !!claimResult.data,
          };
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          difficulty,
          yearMonth,
          season: calcSeason(yearMonth),
          leaderboard: charEntries,
          currentUserRank: charCurrentUserRank,
          totalEntries: charEntries.filter((e: { rank: number }) => e.rank <= safeLimit).length,
          prevSeasonReward: charPrevSeasonReward,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 현재 시즌 리더보드 + 내 순위를 RPC 단일 쿼리로 조회
    const { data: leaderboardRaw, error: leaderboardError } = await supabaseAdmin.rpc(
      'get_leaderboard_with_rank',
      { p_difficulty: difficulty, p_year_month: yearMonth, p_limit: safeLimit, p_user_id: currentUserId }
    );

    if (leaderboardError) {
      console.error('Leaderboard query error:', leaderboardError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch leaderboard' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rows = leaderboardRaw ?? [];
    const entries = rows
      .filter((r: { rank: number }) => r.rank <= safeLimit)
      .map((r: { user_id: string; score: number; character_type: string; initials: string | null; rank: number }) => ({
        userId: r.user_id,
        userName: r.initials ?? '???',
        score: r.score,
        rank: r.rank,
        characterType: r.character_type ?? 'chibi',
      }));

    const totalEntries = entries.length;

    // 내 순위는 RPC 결과에 포함됨 (is_mine 플래그)
    const myRow = rows.find((r: { is_mine: boolean }) => r.is_mine);
    let currentUserRank: { rank: number; score: number } | null = myRow
      ? { rank: myRow.rank, score: myRow.score }
      : null;

    let prevSeasonReward: {
      yearMonth: string;
      rank: number | null;
      skorAwarded: number;
      alreadyClaimed: boolean;
    } | null = null;

    if (currentUserId && difficulty !== 'easy' && isCurrentSeason) {
      // 직전 시즌: 수령 이력 조회 + 미수령 시 순위 계산을 병렬로
      const [claimedResult, prevRankResult] = await Promise.all([
        supabaseAdmin.from('season_reward_history').select('skor_awarded, rank')
          .eq('year_month', prevYearMonth).eq('user_id', currentUserId).eq('difficulty', difficulty).single(),
        supabaseAdmin.rpc('get_user_season_rank', {
          p_difficulty: difficulty, p_year_month: prevYearMonth, p_user_id: currentUserId,
        }),
      ]);

      const claimed = claimedResult.data;
      if (claimed) {
        prevSeasonReward = {
          yearMonth: prevYearMonth,
          rank: claimed.rank,
          skorAwarded: claimed.skor_awarded,
          alreadyClaimed: true,
        };
      } else if (prevRankResult.data?.[0]) {
        const { rank, score: _score, total } = prevRankResult.data[0];
        prevSeasonReward = {
          yearMonth: prevYearMonth,
          rank,
          skorAwarded: getReward(difficulty, rank, total ?? 0),
          alreadyClaimed: false,
        };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        difficulty,
        yearMonth,
        season: calcSeason(yearMonth),
        leaderboard: entries,
        currentUserRank,
        totalEntries,
        prevSeasonReward,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
