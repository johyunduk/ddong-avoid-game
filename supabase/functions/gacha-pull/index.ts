import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── 배경화면 풀 정의 ─────────────────────────────────────────────────────
// 등급 없음. 10종 균등 확률.
// 뽑기당 드롭율 3.5% → 종당 실효 확률 0.35% (캐릭터 UR과 동일 수준)
const WP_DROP_CHANCE = 0.035; // 슬롯당 3.5% → 종당 실효 확률 약 1.17%
const WP_POOL = [
  { id: 'wp_hanok'     },
  { id: 'wp_lake'      },
  { id: 'wp_maehwa'    },
  { id: 'wp_gold_mine' },
];

function pullWallpaper(): { id: string } {
  return WP_POOL[Math.floor(Math.random() * WP_POOL.length)];
}

// ── 뽑기 풀 정의 ────────────────────────────────────────────────────────
// R 80% (10종 균등 배분), SR 19.3% (6종 균등 배분), UR 0.7% (2종 균등 배분)
const SR_W  = 19.3 / 6;   // ≈ 3.217%
const POOL = [
  // ── R등급 ──
  { id: 'log',     grade: 'R',  weight: 8 },
  { id: 'swap',    grade: 'R',  weight: 8 },
  { id: 'sum',     grade: 'R',  weight: 8 },
  { id: 'fork',    grade: 'R',  weight: 8 },
  { id: 'seed',    grade: 'R',  weight: 8 },
  { id: 'session', grade: 'R',  weight: 8 },
  { id: 'branch',  grade: 'R',  weight: 8 },
  { id: 'hook',    grade: 'R',  weight: 8 },
  { id: 'socket',  grade: 'R',  weight: 8 },
  { id: 'index',   grade: 'R',  weight: 8 },
  // ── SR등급 ──
  { id: 'hacker',   grade: 'SR', weight: SR_W },
  { id: 'miner',    grade: 'SR', weight: SR_W },
  { id: 'maehwa',   grade: 'SR', weight: SR_W },
  { id: 'archieve', grade: 'SR', weight: SR_W },
  { id: 'glitch',   grade: 'SR', weight: SR_W },
  { id: 'noise',    grade: 'SR', weight: SR_W },
  // ── UR등급 ──
  { id: 'sentinel', grade: 'UR', weight: 0.35 },
  { id: 'legacy',   grade: 'UR', weight: 0.35 },
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

    // ── 1. SKOR 잔액 + 보유 캐릭터 + 보유 배경화면 병렬 조회 ────────
    const [{ data: skorData }, { data: owned }, { data: ownedWp }] = await Promise.all([
      supabaseAdmin.from('user_skor').select('balance').eq('user_id', user.id).single(),
      supabaseAdmin.from('user_characters').select('character_id').eq('user_id', user.id),
      supabaseAdmin.from('user_wallpapers').select('wallpaper_id').eq('user_id', user.id),
    ]);

    const balance = skorData?.balance ?? 0;
    if (balance < cost) {
      return new Response(
        JSON.stringify({ error: 'Insufficient SKOR', balance }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 2. 슬롯별 결정: 각 슬롯은 배경화면 또는 캐릭터 중 하나
    //       총합 = count, 추가 드롭 없음 ────────────────────────────────
    const ownedSet = new Set((owned ?? []).map((r: { character_id: string }) => r.character_id));
    const ownedWpSet = new Set((ownedWp ?? []).map((r: { wallpaper_id: string }) => r.wallpaper_id));

    const characters: { id: string; grade: string; isNew: boolean }[] = [];
    const wallpapers: { id: string; isNew: boolean }[] = [];

    for (let i = 0; i < count; i++) {
      if (Math.random() < WP_DROP_CHANCE) {
        // 이 슬롯은 배경화면
        const wp = pullWallpaper();
        wallpapers.push({ id: wp.id, isNew: !ownedWpSet.has(wp.id) });
        ownedWpSet.add(wp.id); // 같은 pull 내 중복 isNew 방지
      } else {
        // 이 슬롯은 캐릭터
        const char = pullOne();
        characters.push({ id: char.id, grade: char.grade, isNew: !ownedSet.has(char.id) });
        ownedSet.add(char.id); // 같은 pull 내 중복 isNew 방지
      }
    }

    // ── 3. 신규 배경화면 등록 ────────────────────────────────────────────
    const newWps = wallpapers
      .filter(w => w.isNew)
      .map(w => ({ user_id: user.id, wallpaper_id: w.id }));

    // ── 4. 신규 캐릭터 등록 + 중복 카운트 증가 + SKOR 차감 병렬 처리 ─────
    // 같은 캐릭터가 10연차에서 중복 등장할 수 있으므로 횟수 집계 후 처리
    const newChars = [...new Map(
      characters
        .filter(c => c.isNew)
        .map(c => [c.id, { user_id: user.id, character_id: c.id }])
    ).values()];

    // 중복 캐릭터별 횟수 집계 (같은 캐릭터가 10연차에서 2번 나오면 +2)
    const dupCountMap = new Map<string, number>();
    characters.filter(c => !c.isNew).forEach(c => {
      dupCountMap.set(c.id, (dupCountMap.get(c.id) ?? 0) + 1);
    });

    const newBalance = balance - cost;
    const [charResult, , wpResult, skorResult] = await Promise.all([
      newChars.length > 0
        ? supabaseAdmin.from('user_characters').upsert(newChars, { onConflict: 'user_id,character_id' })
        : Promise.resolve({ error: null }),
      // 중복 카운트 증가: RPC로 atomic increment
      dupCountMap.size > 0
        ? Promise.all([...dupCountMap.entries()].map(([charId, inc]) =>
            supabaseAdmin.rpc('increment_duplicate_count', {
              p_user_id: user.id,
              p_character_id: charId,
              p_amount: inc,
            })
          ))
        : Promise.resolve(null),
      // 신규 배경화면 등록
      newWps.length > 0
        ? supabaseAdmin.from('user_wallpapers').upsert(newWps, { onConflict: 'user_id,wallpaper_id' })
        : Promise.resolve({ error: null }),
      supabaseAdmin.from('user_skor').upsert(
        { user_id: user.id, balance: newBalance, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      ),
    ]);

    if (charResult && 'error' in charResult && charResult.error) {
      console.error('user_characters upsert 실패:', charResult.error);
      return new Response(
        JSON.stringify({ error: 'Failed to save characters', detail: charResult.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (wpResult && 'error' in wpResult && wpResult.error) {
      console.error('user_wallpapers upsert 실패:', wpResult.error);
      return new Response(
        JSON.stringify({ error: 'Failed to save wallpapers', detail: wpResult.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (skorResult && 'error' in skorResult && skorResult.error) {
      console.error('user_skor upsert 실패:', skorResult.error);
    }

    // ── 6. 응답 ───────────────────────────────────────────────────────
    const hasUR = characters.some(c => c.grade === 'UR');

    return new Response(
      JSON.stringify({
        success: true,
        video: hasUR ? 'red' : 'green',
        characters,
        wallpapers,
        remainingSkor: Math.floor(newBalance),
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
