import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SKOR 가중치
const WEIGHTS = {
  gold: 0.1,
  diamond: 0.3,
  topaz: 0.7,
  rainbow: 2.0,
};

// 점수 브래킷별 게임당 SKOR 상한
function getBracketCap(score: number): number {
  if (score < 1000) return 8;
  if (score < 2000) return 14;
  if (score < 3000) return 18;
  return 22;
}

// 주간 SKOR 상한
const WEEKLY_CAP = 200;

// 반복 퀘스트 정의
const QUESTS = [
  { key: 'gold',    interval: 300, reward: 5  },
  { key: 'diamond', interval: 150, reward: 8  },
  { key: 'topaz',   interval: 80,  reward: 10 },
  { key: 'rainbow', interval: 50,  reward: 15 },
] as const;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      score,
      goldCollected = 0,
      diamondCollected = 0,
      topazCollected = 0,
      rainbowCollected = 0,
    } = await req.json();

    if (typeof score !== 'number' || score < 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid score' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 인증
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
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

    // ── 1. 게임 수익 SKOR 계산 ─────────────────────────────────────
    const rawSkor =
      goldCollected * WEIGHTS.gold +
      diamondCollected * WEIGHTS.diamond +
      topazCollected * WEIGHTS.topaz +
      rainbowCollected * WEIGHTS.rainbow;

    const bracketCap = getBracketCap(score);
    const gameSkor = Math.min(rawSkor, bracketCap);

    // ── 2. 퀘스트 진행도 업데이트 및 보상 계산 ─────────────────────
    const { data: existingProgress } = await supabaseAdmin
      .from('quest_progress')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const prevProgress = existingProgress ?? {
      gold_total: 0, diamond_total: 0, topaz_total: 0, rainbow_total: 0
    };

    const newProgress = {
      gold_total:    prevProgress.gold_total    + goldCollected,
      diamond_total: prevProgress.diamond_total + diamondCollected,
      topaz_total:   prevProgress.topaz_total   + topazCollected,
      rainbow_total: prevProgress.rainbow_total + rainbowCollected,
    };

    const newQuestRewards: { quest: string; reward: number }[] = [];
    let questSkor = 0;

    for (const quest of QUESTS) {
      const prevTotal = prevProgress[`${quest.key}_total` as keyof typeof prevProgress] as number;
      const newTotal  = newProgress[`${quest.key}_total` as keyof typeof newProgress] as number;

      const prevMilestone = Math.floor(prevTotal / quest.interval);
      const newMilestone  = Math.floor(newTotal  / quest.interval);

      const achieved = newMilestone - prevMilestone;
      if (achieved > 0) {
        const reward = achieved * quest.reward;
        newQuestRewards.push({ quest: quest.key, reward });
        questSkor += reward;
      }
    }

    // ── 3. 주간 캡 적용 ────────────────────────────────────────────
    const { data: existingSkor } = await supabaseAdmin
      .from('user_skor')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const now = new Date();
    const currentWeekStart = getWeekStart(now);

    let weeklyEarned = existingSkor?.weekly_earned ?? 0;
    const storedWeekStart = existingSkor?.week_start;

    // 주간 리셋 체크
    if (!storedWeekStart || storedWeekStart < currentWeekStart) {
      weeklyEarned = 0;
    }

    const weeklyRemaining = Math.max(0, WEEKLY_CAP - weeklyEarned);
    const totalRaw = gameSkor + questSkor;
    const totalSkorAdded = Math.min(totalRaw, weeklyRemaining);

    const currentBalance = existingSkor?.balance ?? 0;
    const newBalance = currentBalance + totalSkorAdded;

    // ── 4. DB 업데이트 ──────────────────────────────────────────────
    await supabaseAdmin
      .from('user_skor')
      .upsert({
        user_id: user.id,
        balance: Math.floor(newBalance),
        weekly_earned: Math.floor(weeklyEarned + totalSkorAdded),
        week_start: currentWeekStart,
        updated_at: now.toISOString(),
      }, { onConflict: 'user_id' });

    await supabaseAdmin
      .from('quest_progress')
      .upsert({ user_id: user.id, ...newProgress }, { onConflict: 'user_id' });

    return new Response(
      JSON.stringify({
        success: true,
        skorEarned: Math.floor(gameSkor),
        bracketCap,
        questRewards: newQuestRewards,
        totalSkorAdded: Math.floor(totalSkorAdded),
        remainingBalance: Math.floor(newBalance),
        weeklyCapRemaining: Math.floor(weeklyRemaining - totalSkorAdded),
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

// 해당 날짜가 속한 주의 월요일(YYYY-MM-DD) 반환
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=일, 1=월 ... 6=토
  const diff = (day === 0 ? -6 : 1 - day); // 월요일로 이동
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}
