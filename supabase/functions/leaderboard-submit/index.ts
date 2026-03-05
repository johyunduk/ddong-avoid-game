import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 난이도별 물리적 최대 점수 (2시간 연속 플레이 기준)
const SCORE_CAPS: Record<string, number> = {
  easy: 10000,
  normal: 15000,
  hard: 20000,
  extreme: 30000,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { score, difficulty, userName, sessionId, verification, characterType } = await req.json();

    // 기본 입력 검증
    if (typeof score !== 'number' || score < 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid score' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    // 하드 캡: 물리적으로 불가능한 점수 차단
    if (score > (SCORE_CAPS[difficulty] ?? 10000)) {
      console.warn('Score exceeds hard cap', { score, difficulty });
      return new Response(
        JSON.stringify({ error: 'Score exceeds maximum possible value' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // JWT 인증
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

    // ── 세션 검증: 서버가 기록한 start_time 기준으로 경과 시간 확인 ──────────
    if (sessionId) {
      const { data: session } = await supabaseAdmin
        .from('game_sessions')
        .select('start_time, used, difficulty, user_id')
        .eq('id', sessionId)
        .single();

      if (!session) {
        return new Response(
          JSON.stringify({ error: 'Invalid session' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 세션 소유자 확인
      if (session.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Session user mismatch' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 세션 재사용 방지
      if (session.used) {
        return new Response(
          JSON.stringify({ error: 'Session already used' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 난이도 일치 확인
      if (session.difficulty !== difficulty) {
        return new Response(
          JSON.stringify({ error: 'Session difficulty mismatch' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 서버 시각 기준 경과 시간으로 점수 타당성 검증
      // 콘솔에서 score를 직접 조작해도 세션 시작 후 충분한 시간이 지나지 않으면 거부
      const elapsedMs = Date.now() - new Date(session.start_time).getTime();
      const elapsedSec = elapsedMs / 1000;

      // 세션 만료 체크 (2시간 초과)
      if (elapsedMs > 2 * 60 * 60 * 1000) {
        return new Response(
          JSON.stringify({ error: 'Session expired' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 핵심 검증: 이 점수가 나오려면 최소 N초는 걸렸어야 함
      // 1점 = 100ms, 피버타임·보너스 고려해서 50% 여유 허용
      const minRequiredSec = score * 0.1 * 0.5; // score * 100ms * 50%
      if (elapsedSec < minRequiredSec) {
        console.warn('Session time gate failed', { score, elapsedSec, minRequiredSec });
        return new Response(
          JSON.stringify({ error: 'Score not achievable in elapsed time' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 세션 사용 완료 처리
      await supabaseAdmin
        .from('game_sessions')
        .update({ used: true })
        .eq('id', sessionId);
    } else if (verification) {
      // 세션 없이 구 방식 verification만 있는 경우 (하위 호환)
      const {
        gameStartTime,
        gameEndTime,
        goldCollected = 0,
        diamondCollected = 0,
        topazCollected = 0,
        rainbowCollected = 0,
      } = verification;

      const playDuration = gameEndTime - gameStartTime;
      const timeScore = Math.floor(playDuration / 100);
      const bonusScore =
        goldCollected * 20 +
        diamondCollected * 40 +
        topazCollected * 80 +
        rainbowCollected * 100;
      const expectedScore = timeScore + bonusScore;
      const tolerance = Math.max(expectedScore * 0.2, 10);

      if (score > expectedScore + tolerance) {
        console.warn('Score verification failed', { score, expectedScore, playDuration });
        return new Response(
          JSON.stringify({ error: 'Score verification failed' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

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
      const validCharacterTypes = [
        'chibi',
        'log', 'swap', 'sum', 'fork', 'seed', 'session', 'branch', 'hook', 'socket', 'index',
        'hacker', 'miner', 'maehwa', 'archieve', 'glitch', 'noise',
        'sentinel', 'legacy',
      ];
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
