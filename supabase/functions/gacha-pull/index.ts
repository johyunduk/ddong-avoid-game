import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── 뽑기 풀 정의 ────────────────────────────────────────────────────────
// SR 85% (6종 균등 배분), UR 15% (2종 균등 배분)
const POOL = [
  { id: 'hacker',   grade: 'SR', weight: 85 / 6 },
  { id: 'miner',    grade: 'SR', weight: 85 / 6 },
  { id: 'maehwa',   grade: 'SR', weight: 85 / 6 },
  { id: 'archieve', grade: 'SR', weight: 85 / 6 },
  { id: 'glitch',   grade: 'SR', weight: 85 / 6 },
  { id: 'noise',    grade: 'SR', weight: 85 / 6 },
  { id: 'sentinel', grade: 'UR', weight: 7.5 },
  { id: 'legacy',   grade: 'UR', weight: 7.5 },
];

function pullOne(): { id: string; grade: string } {
  const total = POOL.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of POOL) {
    r -= c.weight;
    if (r <= 0) return { id: c.id, grade: c.grade };
  }
  return { id: POOL[POOL.length - 1].id, grade: POOL[POOL.length - 1].grade };
}

// ── 요청 처리 ───────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { pullType } = await req.json(); // 'single' | 'multi'

    if (pullType !== 'single' && pullType !== 'multi') {
      return new Response(
        JSON.stringify({ error: 'Invalid pullType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cost = pullType === 'multi' ? 900 : 100;
    const count = pullType === 'multi' ? 10 : 1;

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

    // ── 1. SKOR 잔액 확인 ────────────────────────────────────────────
    const { data: skorData } = await supabaseAdmin
      .from('user_skor')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    const balance = skorData?.balance ?? 0;
    if (balance < cost) {
      return new Response(
        JSON.stringify({ error: 'Insufficient SKOR', balance }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 2. 캐릭터 결정 ────────────────────────────────────────────────
    const pulls = Array.from({ length: count }, () => pullOne());

    // ── 3. isNew 판별 (보유 캐릭터 조회) ─────────────────────────────
    const { data: owned } = await supabaseAdmin
      .from('user_characters')
      .select('character_id')
      .eq('user_id', user.id);

    const ownedSet = new Set((owned ?? []).map((r: { character_id: string }) => r.character_id));

    const characters = pulls.map(p => ({
      id: p.id,
      grade: p.grade,
      isNew: !ownedSet.has(p.id),
    }));

    // ── 4. 신규 캐릭터 DB 등록 ────────────────────────────────────────
    const newChars = characters
      .filter(c => c.isNew)
      .map(c => ({ user_id: user.id, character_id: c.id }));

    if (newChars.length > 0) {
      await supabaseAdmin
        .from('user_characters')
        .upsert(newChars, { onConflict: 'user_id,character_id' });
    }

    // ── 5. SKOR 차감 ──────────────────────────────────────────────────
    const newBalance = balance - cost;
    await supabaseAdmin
      .from('user_skor')
      .upsert(
        { user_id: user.id, balance: newBalance, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    // ── 6. 응답 ───────────────────────────────────────────────────────
    const hasUR = characters.some(c => c.grade === 'UR');

    return new Response(
      JSON.stringify({
        success: true,
        video: hasUR ? 'red' : 'green',
        characters,
        remainingSkor: Math.round(newBalance * 10) / 10,
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
