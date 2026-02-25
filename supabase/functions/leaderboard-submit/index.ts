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
    // 요청 본문 파싱
    const { score, difficulty, userName, verification, characterType } = await req.json();

    // 입력 검증
    if (typeof score !== 'number' || score < 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid score' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 점수 검증 (verification 데이터가 있을 때만)
    if (verification) {
      const {
        gameStartTime,
        gameEndTime,
        goldCollected = 0,
        diamondCollected = 0,
        topazCollected = 0,
        rainbowCollected = 0,
      } = verification;

      const playDuration = gameEndTime - gameStartTime;
      const timeScore = Math.floor(playDuration / 100); // 100ms당 1점
      const bonusScore =
        goldCollected * 20 +
        diamondCollected * 40 +
        topazCollected * 80 +
        rainbowCollected * 100;
      const expectedScore = timeScore + bonusScore;

      // 허용 오차: 예상 점수의 20% 또는 최소 10점 (타이머 오차 등 고려)
      const tolerance = Math.max(expectedScore * 0.2, 10);

      if (score > expectedScore + tolerance) {
        console.warn('Score verification failed', { score, expectedScore, timeScore, bonusScore, playDuration });
        return new Response(
          JSON.stringify({ error: 'Score verification failed' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const validDifficulties = ['easy', 'normal', 'hard', 'extreme'];
    if (!validDifficulties.includes(difficulty)) {
      return new Response(
        JSON.stringify({ error: 'Invalid difficulty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!userName || !/^[A-Z]{3}$/.test(userName)) {
      return new Response(
        JSON.stringify({ error: 'Invalid userName: must be 3 uppercase letters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // JWT에서 사용자 인증
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 유저 컨텍스트 클라이언트 (RLS 적용)
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

    // Service Role 클라이언트 (RLS 우회, 점수 upsert용)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // profiles 테이블에 이니셜 업데이트
    await supabaseAdmin
      .from('profiles')
      .update({ initials: userName })
      .eq('id', user.id);

    // 기존 점수 조회
    const { data: existing } = await supabaseAdmin
      .from('leaderboard')
      .select('score')
      .eq('user_id', user.id)
      .eq('difficulty', difficulty)
      .single();

    const previousScore = existing?.score ?? null;
    const isNewRecord = previousScore === null || score > previousScore;

    // 최고 점수만 저장 (upsert)
    if (isNewRecord) {
      const validCharacterTypes = ['chibi', 'miner', 'maehwa', 'astronaut'];
      const safeCharacterType = validCharacterTypes.includes(characterType) ? characterType : 'chibi';

      const { error: upsertError } = await supabaseAdmin
        .from('leaderboard')
        .upsert(
          {
            user_id: user.id,
            difficulty,
            score,
            character_type: safeCharacterType,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,difficulty' }
        );

      if (upsertError) {
        console.error('Upsert error:', upsertError);
        return new Response(
          JSON.stringify({ error: 'Failed to save score' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 현재 순위 계산
    const { count: rank } = await supabaseAdmin
      .from('leaderboard')
      .select('*', { count: 'exact', head: true })
      .eq('difficulty', difficulty)
      .gt('score', isNewRecord ? score : (previousScore ?? 0));

    return new Response(
      JSON.stringify({
        success: true,
        isNewRecord,
        previousScore,
        newScore: isNewRecord ? score : (previousScore ?? score),
        rank: rank !== null ? rank + 1 : null,
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
