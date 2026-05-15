import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

/** user_skor 잔액 + 주간 집계 업데이트 (캐릭터/난이도 보상 공통) */
async function updateUserSkor(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  userId: string,
  reward: number
): Promise<number> {
  const { data: existingSkor } = await supabaseAdmin
    .from('user_skor')
    .select('balance, weekly_earned, week_start')
    .eq('user_id', userId)
    .single();

  const newBalance = Math.floor((existingSkor?.balance ?? 0) + reward);
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  const weekStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMonday
  ));
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const isSameWeek = existingSkor?.week_start === weekStartStr;
  const newWeeklyEarned = isSameWeek
    ? Math.floor((existingSkor?.weekly_earned ?? 0) + reward)
    : Math.floor(reward);

  await supabaseAdmin.from('user_skor').upsert({
    user_id: userId,
    balance: newBalance,
    weekly_earned: newWeeklyEarned,
    week_start: weekStartStr,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  return newBalance;
}

const CHAR_REWARDS: Record<number, number> = { 1: 5000, 2: 3000, 3: 1500 };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { difficulty, characterType } = await req.json();

    // JWT 인증 (공통)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const currentYearMonth = getCurrentYearMonth();
    const prevYearMonth = getPrevYearMonth(currentYearMonth);

    // ── 캐릭터별 보상 수령 ─────────────────────────────────────────────────
    if (characterType) {
      const { data: existingCharReward } = await supabaseAdmin
        .from('season_reward_history_char')
        .select('skor_awarded, rank')
        .eq('year_month', prevYearMonth)
        .eq('user_id', user.id)
        .eq('character_type', characterType)
        .single();

      if (existingCharReward) {
        return new Response(
          JSON.stringify({
            success: true, alreadyClaimed: true,
            rank: existingCharReward.rank, skorAwarded: existingCharReward.skor_awarded,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: userPrevEntry } = await supabaseAdmin
        .from('leaderboard_extreme_char')
        .select('score')
        .eq('user_id', user.id).eq('year_month', prevYearMonth)
        .eq('character_type', characterType).single();

      if (!userPrevEntry) {
        return new Response(
          JSON.stringify({ success: true, alreadyClaimed: false, rank: null, skorAwarded: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { count: above } = await supabaseAdmin
        .from('leaderboard_extreme_char')
        .select('*', { count: 'exact', head: true })
        .eq('year_month', prevYearMonth).eq('character_type', characterType)
        .gt('score', userPrevEntry.score);

      const rank = (above ?? 0) + 1;
      const reward = CHAR_REWARDS[rank] ?? 0;

      if (reward === 0) {
        return new Response(
          JSON.stringify({ success: true, alreadyClaimed: false, rank, skorAwarded: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: charHistoryError } = await supabaseAdmin
        .from('season_reward_history_char')
        .insert({ year_month: prevYearMonth, user_id: user.id, character_type: characterType, rank, skor_awarded: reward });

      if (charHistoryError) {
        if (charHistoryError.code === '23505') {
          return new Response(
            JSON.stringify({ success: true, alreadyClaimed: true, rank, skorAwarded: reward }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ error: 'Failed to record reward' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const newBalance = await updateUserSkor(supabaseAdmin, user.id, reward);
      return new Response(
        JSON.stringify({ success: true, alreadyClaimed: false, rank, skorAwarded: reward, newBalance }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // ── 기존 난이도별 보상 수령 ──────────────────────────────────────────────

    const validDifficulties = ['normal', 'hard', 'extreme', 'physical'];
    if (!validDifficulties.includes(difficulty)) {
      return new Response(
        JSON.stringify({ error: 'Invalid difficulty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 보상 수령 기간 검증: 직전 달 기록만 수령 가능
    // (새 달이 되면 이전 이전 달은 자동으로 접근 불가)
    // 클라이언트가 임의의 year_month를 body에 넣어 오래된 달 청구 시도를 차단하기 위해
    // 서버에서 항상 현재 기준 직전 달로 고정

    // 이미 수령했는지 확인
    const { data: existingReward } = await supabaseAdmin
      .from('season_reward_history')
      .select('skor_awarded, rank')
      .eq('year_month', prevYearMonth)
      .eq('user_id', user.id)
      .eq('difficulty', difficulty)
      .single();

    if (existingReward) {
      return new Response(
        JSON.stringify({
          success: true,
          alreadyClaimed: true,
          rank: existingReward.rank,
          skorAwarded: existingReward.skor_awarded,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 직전 달 리더보드에서 유저 점수 조회
    const { data: userPrevEntry } = await supabaseAdmin
      .from('leaderboard')
      .select('score')
      .eq('difficulty', difficulty)
      .eq('year_month', prevYearMonth)
      .eq('user_id', user.id)
      .single();

    if (!userPrevEntry) {
      // 해당 달에 기록 없음
      return new Response(
        JSON.stringify({ success: true, alreadyClaimed: false, rank: null, skorAwarded: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DB COUNT로 순위 계산 (전체 행 조회 불필요)
    const [{ count: higherCount }, { count: totalPlayers }] = await Promise.all([
      supabaseAdmin.from('leaderboard').select('*', { count: 'exact', head: true })
        .eq('difficulty', difficulty).eq('year_month', prevYearMonth).gt('score', userPrevEntry.score),
      supabaseAdmin.from('leaderboard').select('*', { count: 'exact', head: true })
        .eq('difficulty', difficulty).eq('year_month', prevYearMonth),
    ]);

    const rank = (higherCount ?? 0) + 1;
    const reward = getReward(difficulty, rank, totalPlayers ?? 0);

    // 보상 이력 INSERT (UNIQUE 제약으로 race condition 방지)
    const { error: historyError } = await supabaseAdmin
      .from('season_reward_history')
      .insert({
        year_month: prevYearMonth,
        user_id: user.id,
        difficulty: difficulty,
        rank,
        skor_awarded: reward,
      });

    if (historyError) {
      if (historyError.code === '23505') {
        // 동시 요청으로 이미 INSERT됨 → alreadyClaimed 처리
        return new Response(
          JSON.stringify({ success: true, alreadyClaimed: true, rank, skorAwarded: reward }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.error('History insert error:', historyError);
      return new Response(
        JSON.stringify({ error: 'Failed to record reward' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newBalance = await updateUserSkor(supabaseAdmin, user.id, reward);

    return new Response(
      JSON.stringify({
        success: true,
        alreadyClaimed: false,
        rank,
        skorAwarded: reward,
        newBalance,
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
