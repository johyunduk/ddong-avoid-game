import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CHARACTER_GRADES } from '../_shared/roster.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── 배경화면 풀 정의 ─────────────────────────────────────────────────────
// 등급 없음. 아래 WP_POOL 의 종이 모두 같은 확률.
// 슬롯마다 WP_DROP_CHANCE(3.5%) 로 배경화면이 나오고, 그 안에서 종을 균등하게 고른다
// → 종당 실효 확률 = 3.5% ÷ 12종 ≈ 0.29% (2026-10-09 대표 결정 A안: 종이 늘어도 3.5% 는 그대로 두고 나눈다)
// 화면 표시는 src/utils/gacha.ts 의 GACHA_WP_DROP_CHANCE, 종 목록은 src/utils/wallpaper.ts 의 GACHA_WP_IDS 와 같아야 한다
// (scripts/check-roster.mjs 가 둘 다 검사한다)
const WP_DROP_CHANCE = 0.035; // 슬롯당 3.5%
const WP_POOL = [
  { id: 'wp_hanok'     },
  { id: 'wp_lake'      },
  { id: 'wp_maehwa'    },
  { id: 'wp_gold_mine' },
  { id: 'wp_fantasy'   },
  // SR 캐릭터 배경화면 일곱 장 (2026-10-09)
  { id: 'wp_ted'       },
  { id: 'wp_heidi'     },
  { id: 'wp_red'       },
  { id: 'wp_k'         },
  { id: 'wp_hacker'    },
  { id: 'wp_glitch'    },
  { id: 'wp_noise'     },
];

function pullWallpaper(): { id: string } {
  return WP_POOL[Math.floor(Math.random() * WP_POOL.length)];
}

// ── 뽑기 풀 정의 ────────────────────────────────────────────────────────
// R 종당 ≈7.44% (10종), SR 종당 ≈2.24% (11종 → 총 ≈24.7%), UR 종당 ≈0.217% (4종 → 총 ≈0.87%)
// 종을 늘릴 때 **종당 가중치는 그대로 두고 대역 총합이 늘어나게** 한다 (UR_W 주석의 선례).
// 가중치 합이 100 이 아니므로 아래 숫자는 가중치지 확률이 아니다 — 실제 확률은
// weight / POOL_TOTAL 이다. UR 4번째를 넣기 전에는 합이 정확히 100.0 이었다.
const SR_W  = 19.3 / 8;         // 가중치 ≈2.413 (기존 8종 산출값 유지 — 11종이어도 기존 SR 너프 없음)
const UR_W  = 0.7  / 3;         // 종당 ≈0.233% (기존 3종 산출값 유지 — 4종이어도 종당 확률 동일, 기존 UR 너프 없음)
/** 등급별 종당 가중치 */
const WEIGHT_BY_GRADE: Record<string, number> = { R: 8, SR: SR_W, UR: UR_W };

/**
 * **뽑을 수 있는 캐릭터 id 만** 적는다. 등급과 가중치는 적지 않는다 —
 * 등급은 `_shared/roster.ts`(= character.ts 에서 생성) 에서 오고, 가중치는 등급에서 온다.
 *
 * 여기 등급을 같이 적어 두면 character.ts 에서 등급을 올렸을 때 뽑기 확률만 옛 등급에
 * 남는다. 실제로 그 부류의 사고가 랭킹 쪽에서 났다 (명단을 베껴 둔 화이트리스트).
 *
 * chibi 는 기본 보유라 넣지 않는다. 미공개 캐릭터를 넣을지는 별도 판단이다.
 */
const OBTAINABLE_IDS = [
  'log', 'swap', 'sum', 'fork', 'seed', 'session', 'branch', 'hook', 'socket', 'index',
  'hacker', 'miner', 'maehwa', 'archieve', 'glitch', 'noise', 'knight', 'k', 'red', 'heidi',
  'mugi', 'gumi', 'sentinel', 'legacy', 'ted',
];

const POOL = OBTAINABLE_IDS.map((id) => {
  const grade = CHARACTER_GRADES[id];
  // 명단에 없는 id 가 들어오면 가중치가 NaN 이 되어 뽑기가 조용히 망가진다.
  // 조용히 틀리느니 배포 즉시 터지는 쪽이 낫다
  if (!grade) throw new Error(`gacha POOL: '${id}' 가 캐릭터 명단에 없다 (_shared/roster.ts)`);
  const weight = WEIGHT_BY_GRADE[grade];
  if (weight === undefined) throw new Error(`gacha POOL: 등급 '${grade}' 의 가중치가 없다 ('${id}')`);
  return { id, grade, weight };
});

const POOL_TOTAL = POOL.reduce((s, c) => s + c.weight, 0);

function pullOne(): { id: string; grade: string } {
  let r = Math.random() * POOL_TOTAL;
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
