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
    const { difficulty, limit: limitParam, characterType } = await req.json().catch(() => ({}));
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

    const yearMonth = getCurrentYearMonth();
    const prevYearMonth = getPrevYearMonth(yearMonth);

    // EXTREME 캐릭터 필터: leaderboard_extreme_char 테이블 조회 후 조기 반환
    if (characterType && difficulty === 'extreme') {
      const { data: charData, error: charError } = await supabaseAdmin
        .from('leaderboard_extreme_char')
        .select('user_id, score, character_type, profiles!inner(initials)')
        .eq('year_month', yearMonth)
        .eq('character_type', characterType)
        .order('score', { ascending: false })
        .limit(safeLimit);

      if (charError) {
        console.error('Extreme char leaderboard error:', charError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch character leaderboard' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const charEntries = (charData ?? []).map((entry, index) => ({
        userId: entry.user_id,
        userName: (entry.profiles as { initials: string | null }).initials ?? '???',
        score: entry.score,
        rank: index + 1,
        characterType: (entry as Record<string, unknown>).character_type ?? 'chibi',
      }));

      // 인증된 유저의 직전 달 캐릭터 보드 rank + 보상 상태 계산
      let charCurrentUserRank: { rank: number; score: number } | null = null;
      let charPrevSeasonReward: {
        yearMonth: string; rank: number | null; skorAwarded: number; alreadyClaimed: boolean;
      } | null = null;

      if (currentUserId) {
        const [userPrevResult, claimResult] = await Promise.all([
          supabaseAdmin.from('leaderboard_extreme_char').select('score')
            .eq('user_id', currentUserId).eq('year_month', prevYearMonth)
            .eq('character_type', characterType).single(),
          supabaseAdmin.from('season_reward_history_char').select('id')
            .eq('user_id', currentUserId).eq('year_month', prevYearMonth)
            .eq('character_type', characterType).single(),
        ]);

        const userPrevEntry = userPrevResult.data;
        if (userPrevEntry) {
          const { count: above } = await supabaseAdmin
            .from('leaderboard_extreme_char')
            .select('*', { count: 'exact', head: true })
            .eq('year_month', prevYearMonth).eq('character_type', characterType)
            .gt('score', userPrevEntry.score);

          const rank = (above ?? 0) + 1;
          const CHAR_REWARDS: Record<number, number> = { 1: 5000, 2: 3000, 3: 1500 };
          charCurrentUserRank = { rank, score: userPrevEntry.score };
          charPrevSeasonReward = {
            yearMonth: prevYearMonth,
            rank,
            skorAwarded: CHAR_REWARDS[rank] ?? 0,
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
          totalEntries: charEntries.length,
          prevSeasonReward: charPrevSeasonReward,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 현재 시즌 리더보드 조회 (profiles와 JOIN하여 이니셜 포함)
    const { data: leaderboard, error: leaderboardError } = await supabaseAdmin
      .from('leaderboard')
      .select(`
        user_id,
        score,
        character_type,
        profiles!inner(initials)
      `)
      .eq('difficulty', difficulty)
      .eq('year_month', yearMonth)
      .order('score', { ascending: false })
      .limit(safeLimit);

    if (leaderboardError) {
      console.error('Leaderboard query error:', leaderboardError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch leaderboard' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 응답 형식 변환
    const entries = (leaderboard ?? []).map((entry, index) => ({
      userId: entry.user_id,
      userName: (entry.profiles as { initials: string | null }).initials ?? '???',
      score: entry.score,
      rank: index + 1,
      characterType: (entry as Record<string, unknown>).character_type ?? 'chibi',
    }));

    const totalEntries = entries.length;

    // 현재 유저의 이번 시즌 순위 조회
    let currentUserRank: { rank: number; score: number } | null = null;
    // 직전 시즌 보상 상태 (로그인 유저에게만 제공)
    let prevSeasonReward: {
      yearMonth: string;
      rank: number | null;
      skorAwarded: number;
      alreadyClaimed: boolean;
    } | null = null;

    if (currentUserId) {
      // currentUserRank 조회와 prevSeason 보상 조회는 독립적이므로 병렬 실행
      const [userEntryResult, claimedResult, userPrevEntryResult] = await Promise.all([
        // 이번 시즌 점수
        supabaseAdmin.from('leaderboard').select('score')
          .eq('user_id', currentUserId).eq('difficulty', difficulty).eq('year_month', yearMonth).single(),
        // 직전 시즌 수령 이력 (easy 제외)
        difficulty !== 'easy'
          ? supabaseAdmin.from('season_reward_history').select('skor_awarded, rank')
              .eq('year_month', prevYearMonth).eq('user_id', currentUserId).eq('difficulty', difficulty).single()
          : Promise.resolve({ data: null, error: null }),
        // 직전 시즌 유저 점수 (easy 제외, 미수령 시 순위 계산용)
        difficulty !== 'easy'
          ? supabaseAdmin.from('leaderboard').select('score')
              .eq('user_id', currentUserId).eq('difficulty', difficulty).eq('year_month', prevYearMonth).single()
          : Promise.resolve({ data: null, error: null }),
      ]);

      // 이번 시즌 순위
      const userEntry = userEntryResult.data;
      if (userEntry) {
        const { count: higherCount } = await supabaseAdmin
          .from('leaderboard')
          .select('*', { count: 'exact', head: true })
          .eq('difficulty', difficulty)
          .eq('year_month', yearMonth)
          .gt('score', userEntry.score);

        currentUserRank = { rank: (higherCount ?? 0) + 1, score: userEntry.score };
      }

      // 직전 시즌 보상 상태
      if (difficulty !== 'easy') {
        const claimed = claimedResult.data;
        if (claimed) {
          prevSeasonReward = {
            yearMonth: prevYearMonth,
            rank: claimed.rank,
            skorAwarded: claimed.skor_awarded,
            alreadyClaimed: true,
          };
        } else {
          const userPrevEntry = userPrevEntryResult.data;
          if (userPrevEntry) {
            // DB COUNT로 직전 시즌 순위 계산
            const [{ count: prevHigherCount }, { count: prevTotal }] = await Promise.all([
              supabaseAdmin.from('leaderboard').select('*', { count: 'exact', head: true })
                .eq('difficulty', difficulty).eq('year_month', prevYearMonth).gt('score', userPrevEntry.score),
              supabaseAdmin.from('leaderboard').select('*', { count: 'exact', head: true })
                .eq('difficulty', difficulty).eq('year_month', prevYearMonth),
            ]);
            const rank = (prevHigherCount ?? 0) + 1;
            prevSeasonReward = {
              yearMonth: prevYearMonth,
              rank,
              skorAwarded: getReward(difficulty, rank, prevTotal ?? 0),
              alreadyClaimed: false,
            };
          }
        }
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
