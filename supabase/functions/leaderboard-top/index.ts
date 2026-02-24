import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const { difficulty, limit: limitParam } = await req.json().catch(() => ({}));
    const limit = parseInt(limitParam ?? '100', 10);

    // 입력 검증
    const validDifficulties = ['easy', 'normal', 'hard', 'extreme'];
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

    // 리더보드 조회 (profiles와 JOIN하여 이니셜 포함)
    const { data: leaderboard, error: leaderboardError } = await supabaseAdmin
      .from('leaderboard')
      .select(`
        user_id,
        score,
        profiles!inner(initials)
      `)
      .eq('difficulty', difficulty)
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
    }));

    const totalEntries = entries.length;

    // 현재 유저의 순위 조회
    let currentUserRank: { rank: number; score: number } | null = null;
    if (currentUserId) {
      const { data: userEntry } = await supabaseAdmin
        .from('leaderboard')
        .select('score')
        .eq('user_id', currentUserId)
        .eq('difficulty', difficulty)
        .single();

      if (userEntry) {
        const { count: higherCount } = await supabaseAdmin
          .from('leaderboard')
          .select('*', { count: 'exact', head: true })
          .eq('difficulty', difficulty)
          .gt('score', userEntry.score);

        currentUserRank = {
          rank: (higherCount ?? 0) + 1,
          score: userEntry.score,
        };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        difficulty,
        leaderboard: entries,
        currentUserRank,
        totalEntries,
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
