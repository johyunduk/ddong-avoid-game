import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { difficulty } = await req.json();

    const validDifficulties = ['easy', 'normal', 'hard', 'extreme', 'physical'];
    if (!validDifficulties.includes(difficulty)) {
      return new Response(
        JSON.stringify({ error: 'Invalid difficulty' }),
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

    // 세션 생성 + 퀘스트 진행도 조회 병렬 실행
    const [sessionResult, questResult] = await Promise.all([
      supabaseAdmin
        .from('game_sessions')
        .insert({ user_id: user.id, difficulty })
        .select('id')
        .single(),
      supabaseAdmin
        .from('quest_progress')
        .select('gold_total, diamond_total, topaz_total, rainbow_total')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (sessionResult.error || !sessionResult.data) {
      console.error('세션 생성 실패:', sessionResult.error);
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (questResult.error) {
      console.warn('quest_progress 조회 실패 (기본값 사용):', questResult.error.message);
    }
    const questProgress = questResult.data ?? {
      gold_total: 0, diamond_total: 0, topaz_total: 0, rainbow_total: 0,
    };

    return new Response(
      JSON.stringify({ sessionId: sessionResult.data.id, questProgress }),
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
