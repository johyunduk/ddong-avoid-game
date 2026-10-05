// 심사실 API — 컨셉 요청 · 테마곡 주문 · 캐릭터 설정 선택.
//
//   GET  /functions/v1/review?list=1&k=<키>        → 배치 목록 (워커·review-status.py·설정 목록)
//   GET  /functions/v1/review?b=<batch>&t=<token>  → 배치 데이터 (캐릭터 설정 화면)
//   POST /functions/v1/review?b=<batch>&t=<token>  → 캐릭터 설정 저장 {character}
//        (확정된 배치에만. proposals 는 PC 의 builder 가 채워 넣는다)
//   GET  /functions/v1/review?music=1&k=<키>       → 곡 주문 목록 + 캐릭터 명단
//   POST /functions/v1/review?music=1&k=<키>       → 곡 주문 등록 {character, note}
//   POST /functions/v1/review?music=<id>&k=<키>    → 곡 판정 {type, selected, note}
//   GET  /functions/v1/review?requests=1&k=<키>    → 컨셉 요청 목록
//   POST /functions/v1/review?request=1&k=<키>     → 컨셉 요청 등록 {text, kind, theme}
//
// 일러스트 후보 심사(후보 고르기 · 배치 결정 제출 · 기각 배치 삭제)는 없앴다 (2026-09-17 —
// 후보는 심사실에 올리지 않고 ComfyUI 출력 폴더에서 사람이 직접 본다). 이미 올라가 있는
// 배치의 batch.json 은 그대로 읽는다 — 확정(accept) 배치의 캐릭터 설정이 여기에 산다.
//
// 인증은 둘 중 하나:
//   t = 배치별 토큰 (batch.json 에 기록. 푸시 알림 링크에 실린다)
//   k = 전체 키 (REVIEW_INDEX_KEY 시크릿. 목록·요청 조회에는 이것만 쓴다)
//
// 심사 화면(HTML)은 별도 배포된 review-site 가 담당한다. Supabase 는 자기 도메인에서
// HTML 을 text/plain 으로만 내려주므로(피싱 방지) 페이지는 여기서 서빙할 수 없다.
//
// 상태는 Storage 의 review/<batch>/batch.json 하나에만 있다 (테이블 없음).
// 배포: supabase functions deploy review --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET = 'review';
const REQ_PREFIX = '_requests'; // 컨셉 요청 (배치 목록에서 제외되도록 _ 로 시작)
const MUSIC_PREFIX = '_music';   // 곡 주문 (같은 이유로 _ 로 시작)
const ROSTER_PATH = '_roster/roster.json'; // 게임에 등록된 캐릭터 명단 (PC 가 갱신)
const MODELS_PATH = '_models.json'; // 고를 수 있는 ComfyUI 체크포인트 (PC 가 갱신)
const SIGNED_TTL = 60 * 60 * 24; // 서명 URL 24시간

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type DecisionType = 'accept' | 'revise' | 'reject';

interface Candidate {
  file: string;
  seed: number | string;
  model?: string;
  selected?: boolean;
}

/** 배치 단위 결정 — 심사의 결과물은 이것 하나다 */
interface Decision {
  type: DecisionType;
  selected: string | null;
  note: string;
}

interface Proposal {
  title: string;
  text: string;
}

/** 확정 후 정하는 게임 설정. proposals 는 builder 가 제안한 선택지다 */
interface CharacterSetup {
  name?: string;
  grade?: '등급외' | 'R' | 'SR' | 'UR';
  basicEffect?: string;
  specialAbility?: string;
  confirmed?: boolean;
  confirmedAt?: string | null;
  proposals?: {
    grade?: string;
    gradeReason?: string;
    basic?: Proposal[];
    special?: Proposal[];
  } | null;
}

/** 곡 주문 — 게임에 이미 있는 캐릭터에 테마곡을 붙인다 */
interface MusicOrder {
  id: string;
  character: string;              // src/utils/character.ts 의 id
  name: string;                   // 표시용 이름 (주문 시점의 명단에서 복사)
  note: string;                   // 사람이 적은 분위기 요청 (선택)
  created: string;
  /** pending → (composer 가 집음) picked → 링크 올라옴 review → done | dropped */
  status: 'pending' | 'picked' | 'review' | 'done' | 'dropped';
  title: string | null;           // composer 가 정한 곡 제목
  tracks: { url: string; label: string }[];   // Suno 공유 링크 (음원은 안 받는다)
  decision: { type: 'pick' | 'revise' | 'drop'; selected: string | null; note: string } | null;
  updatedAt: string | null;
}

interface Batch {
  batch: string;
  label: string;
  token: string;
  dir: string;
  prompt: string;
  negative: string;
  created: string;
  candidates: Candidate[];
  decision?: Decision | null;
  character?: CharacterSetup | null;
  submitted?: boolean;
  submittedAt?: string | null;
  updatedAt?: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// 체크포인트 목록. **여기에 목록을 베껴 적지 않는다** — 단일 진실은 저장소의
// `workflows/comfyui/bindings.json` 이고, `scripts/publish-models.py` 가 밀어 넣는다.
type ModelList = { default: string | null; models: { alias: string; file: string }[] };

async function readModels(sb: ReturnType<typeof createClient>): Promise<ModelList> {
  const d = await sb.storage.from(BUCKET).download(MODELS_PATH);
  if (d.error || !d.data) return { default: null, models: [] };
  try {
    const parsed = JSON.parse(await d.data.text());
    return {
      default: parsed?.default ?? null,
      models: Array.isArray(parsed?.models) ? parsed.models : [],
    };
  } catch {
    return { default: null, models: [] };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const batch = url.searchParams.get('b') ?? '';
  const token = url.searchParams.get('t') ?? '';
  const indexKey = Deno.env.get('REVIEW_INDEX_KEY') ?? '';
  const keyOk = indexKey.length > 0 && (url.searchParams.get('k') ?? '') === indexKey;

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // ── 컨셉 요청 ───────────────────────────────────────────────────────────
  if (url.searchParams.get('requests') === '1' || url.searchParams.get('request') === '1') {
    if (!keyOk) return json({ error: 'forbidden' }, 403);

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null);
      const text = String(body?.text ?? '').trim();
      const kind = body?.kind === 'auto' ? 'auto' : 'manual';
      // auto 일 때 작명 계열: it = 개발 용어 / free = 그 외 (치비·무기·구미·매화 계열)
      const theme = body?.theme === 'free' ? 'free' : body?.theme === 'it' ? 'it' : null;
      if (!text && kind !== 'auto') return json({ error: 'text_required' }, 400);

      // 체크포인트: 올라와 있는 목록의 별칭만 받는다. 없거나 모르는 값이면 null →
      // 생성 쪽이 bindings.json 의 기본 체크포인트를 쓴다.
      const wanted = String(body?.model ?? '').trim();
      const { models: allowed } = await readModels(sb);
      const model = allowed.some((m) => m.alias === wanted) ? wanted : null;

      const now = new Date();
      const id =
        now.toISOString().replace(/[-:T]/g, '').slice(0, 14) +
        '-' +
        Math.random().toString(36).slice(2, 8);
      const doc = {
        id,
        kind, // manual = 사용자가 컨셉을 적음 / auto = 컨셉도 알아서 잡기
        theme,
        model, // ComfyUI 체크포인트 별칭. null 이면 기본값
        text: text.slice(0, 2000),
        created: now.toISOString(),
        status: 'pending', // pending | picked | done | dropped
        batch: null,
        note: '',
      };
      const up = await sb.storage.from(BUCKET).upload(
        `${REQ_PREFIX}/${id}.json`,
        new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
        { upsert: true, contentType: 'application/json' }
      );
      if (up.error) return json({ error: up.error.message }, 500);
      return json({ ok: true, request: doc });
    }

    const listed = await sb.storage.from(BUCKET).list(REQ_PREFIX, { limit: 200 });
    if (listed.error) return json({ error: listed.error.message }, 500);

    const files = (listed.data ?? []).filter((e) => e.name.endsWith('.json'));
    const items = await Promise.all(
      files.map(async (f) => {
        const d = await sb.storage.from(BUCKET).download(`${REQ_PREFIX}/${f.name}`);
        if (d.error || !d.data) return null;
        return JSON.parse(await d.data.text());
      })
    );
    const requests = items.filter((r) => r !== null);
    requests.sort((a, b) => (a!.created < b!.created ? 1 : -1));
    const checkpoints = await readModels(sb);
    return json({ requests, checkpoints });
  }

  // ── 곡 주문 ─────────────────────────────────────────────────────────────
  // 이미지 심사와 달리 배치 폴더가 없다. 주문 하나가 `_music/<id>.json` 뿐이다.
  // **음원은 저장하지 않는다** — 후보는 Suno 공유 링크로 듣는다 (브라우저 다운로드가
  // 자주 끊기고, 심사에는 파일이 필요 없다). selected 에는 그 링크가 들어간다.
  {
    const musicParam = url.searchParams.get('music');
    if (musicParam) {
      if (!keyOk) return json({ error: 'forbidden' }, 403);

      const readOrder = async (id: string): Promise<MusicOrder | null> => {
        const d = await sb.storage.from(BUCKET).download(`${MUSIC_PREFIX}/${id}.json`);
        if (d.error || !d.data) return null;
        return JSON.parse(await d.data.text());
      };
      const writeOrder = async (o: MusicOrder) => {
        return await sb.storage.from(BUCKET).upload(
          `${MUSIC_PREFIX}/${o.id}.json`,
          new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' }),
          { upsert: true, contentType: 'application/json' }
        );
      };

      // ?music=1 → 목록 / 등록
      if (musicParam === '1') {
        if (req.method === 'POST') {
          const body = await req.json().catch(() => null);
          const character = String(body?.character ?? '').trim();
          if (!/^[a-z0-9_-]{1,40}$/i.test(character)) return json({ error: 'character_required' }, 400);
          // 명단(PC 가 publish-roster.py 로 올린 것)에 있는 캐릭터만 받는다 — 게임에 없는 id 로
          // 주문이 쌓이면 워커가 그대로 곡을 만든다. 이름도 클라이언트 값 대신 명단 값을 쓴다
          const rf = await sb.storage.from(BUCKET).download(ROSTER_PATH);
          if (rf.error || !rf.data) return json({ error: 'roster_missing' }, 503);
          const listedChars: { id: string; name: string }[] =
            JSON.parse(await rf.data.text())?.characters ?? [];
          const known = Array.isArray(listedChars) ? listedChars.find((c) => c.id === character) : undefined;
          if (!known) return json({ error: 'unknown_character' }, 400);

          const now = new Date();
          const id =
            now.toISOString().replace(/[-:T]/g, '').slice(0, 14) +
            '-' + Math.random().toString(36).slice(2, 8);
          const order: MusicOrder = {
            id,
            character,
            name: String(known.name ?? character).slice(0, 40),
            note: String(body?.note ?? '').trim().slice(0, 2000),
            created: now.toISOString(),
            status: 'pending',
            title: null,
            tracks: [],
            decision: null,
            updatedAt: null,
          };
          const up = await writeOrder(order);
          if (up.error) return json({ error: up.error.message }, 500);
          return json({ ok: true, order });
        }

        // 명단 (PC 가 갱신해 둔 것)
        let roster: { id: string; name: string; grade: string; illust?: string; thumb?: string }[] = [];
        const rf = await sb.storage.from(BUCKET).download(ROSTER_PATH);
        if (!rf.error && rf.data) {
          const parsed = JSON.parse(await rf.data.text());
          roster = Array.isArray(parsed?.characters) ? parsed.characters : [];
          const withIllust = roster.filter((c) => c.illust);
          if (withIllust.length) {
            const signed = await sb.storage
              .from(BUCKET)
              .createSignedUrls(withIllust.map((c) => `_roster/${c.illust}`), SIGNED_TTL);
            (signed.data ?? []).forEach((sg, i) => {
              if (sg.signedUrl) withIllust[i].thumb = sg.signedUrl;
            });
          }
        }

        const listed = await sb.storage.from(BUCKET).list(MUSIC_PREFIX, { limit: 200 });
        if (listed.error) return json({ error: listed.error.message }, 500);
        const files = (listed.data ?? []).filter((e) => e.name.endsWith('.json'));
        const items = await Promise.all(
          files.map(async (f) => readOrder(f.name.replace(/\.json$/, '')))
        );
        const orders = items.filter((o): o is MusicOrder => o !== null);

        orders.sort((a, b) => (a.created < b.created ? 1 : -1));
        return json({ orders, roster });
      }

      // ?music=<id> → 판정
      if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      if (!/^[a-z0-9-]{1,64}$/i.test(musicParam)) return json({ error: 'invalid_order' }, 400);

      const order = await readOrder(musicParam);
      if (!order) return json({ error: 'not_found' }, 404);

      const body = await req.json().catch(() => null);
      const type = body?.type as 'pick' | 'revise' | 'drop' | undefined;
      if (type !== 'pick' && type !== 'revise' && type !== 'drop') {
        return json({ error: 'type_required' }, 400);
      }
      const selected = typeof body?.selected === 'string' ? body.selected : null;
      if (type === 'pick' && !selected) return json({ error: 'selected_required' }, 400);
      if (selected && !order.tracks.some((t) => t.url === selected)) {
        return json({ error: 'unknown_track' }, 400);
      }

      order.decision = { type, selected, note: String(body?.note ?? '').slice(0, 2000) };
      order.status = type === 'pick' ? 'done' : type === 'drop' ? 'dropped' : 'pending';
      order.updatedAt = new Date().toISOString();

      const up = await writeOrder(order);
      if (up.error) return json({ error: up.error.message }, 500);
      return json({ ok: true, order });
    }
  }

  // ── 배치 목록 ───────────────────────────────────────────────────────────
  if (url.searchParams.get('list') === '1') {
    if (!keyOk) return json({ error: 'forbidden' }, 403);

    const listed = await sb.storage.from(BUCKET).list('', { limit: 200 });
    if (listed.error) return json({ error: listed.error.message }, 500);

    const folders = (listed.data ?? [])
      .filter((e) => e.id === null && !e.name.startsWith('_'))
      .map((e) => e.name);

    const batches = await Promise.all(
      folders.map(async (name) => {
        const f = await sb.storage.from(BUCKET).download(`${name}/batch.json`);
        if (f.error || !f.data) return null;
        const m: Batch = JSON.parse(await f.data.text());
        let thumb = '';
        if (m.candidates.length) {
          const pick = m.candidates.find((c) => c.selected) ?? m.candidates[0];
          const s = await sb.storage
            .from(BUCKET)
            .createSignedUrl(`${name}/${pick.file}`, SIGNED_TTL);
          thumb = s.data?.signedUrl ?? '';
        }
        return {
          batch: m.batch,
          label: m.label,
          created: m.created,
          token: m.token,
          decision: m.decision ?? null,
          character: m.character
            ? { name: m.character.name ?? '', grade: m.character.grade ?? '',
                confirmed: !!m.character.confirmed, hasProposals: !!m.character.proposals }
            : null,
          submitted: !!m.submitted,
          updatedAt: m.updatedAt ?? null,
          total: m.candidates.length,
          thumb,
        };
      })
    );

    const rows = batches.filter((b) => b !== null);
    rows.sort((a, b) => (a!.created < b!.created ? 1 : -1));
    return json({ batches: rows });
  }

  // ── 배치 하나 ───────────────────────────────────────────────────────────
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(batch)) {
    return json({ error: 'invalid_batch' }, 400);
  }

  const metaPath = `${batch}/batch.json`;
  const dl = await sb.storage.from(BUCKET).download(metaPath);
  if (dl.error || !dl.data) return json({ error: 'not_found' }, 404);

  const meta: Batch = JSON.parse(await dl.data.text());
  if (!keyOk && (!meta.token || meta.token !== token)) return json({ error: 'forbidden' }, 403);

  if (req.method === 'GET') {
    const paths = meta.candidates.map((c) => `${batch}/${c.file}`);
    const signed = await sb.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL);
    if (signed.error) return json({ error: signed.error.message }, 500);

    const src: Record<string, string> = {};
    (signed.data ?? []).forEach((s, i) => {
      if (s.signedUrl) src[meta.candidates[i].file] = s.signedUrl;
    });

    return json({
      batch: meta.batch,
      label: meta.label,
      dir: meta.dir,
      created: meta.created,
      prompt: meta.prompt,
      negative: meta.negative,
      submitted: !!meta.submitted,
      updatedAt: meta.updatedAt ?? null,
      decision: meta.decision ?? null,
      character: meta.character ?? null,
      candidates: meta.candidates.map((c) => ({
        file: c.file,
        seed: c.seed,
        model: c.model ?? '',
        selected: !!c.selected,
        src: src[c.file] ?? '',
      })),
    });
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => null);

    // ── 캐릭터 설정 저장 ─────────────────────────────────────────────────
    if (body?.character) {
      if (meta.decision?.type !== 'accept') return json({ error: 'accept_only' }, 409);
      const c = body.character;
      const grades = ['등급외', 'R', 'SR', 'UR'];
      const prev = meta.character ?? {};
      meta.character = {
        ...prev,
        name: String(c.name ?? prev.name ?? '').slice(0, 40),
        grade: grades.includes(c.grade) ? c.grade : prev.grade,
        basicEffect: String(c.basicEffect ?? prev.basicEffect ?? '').slice(0, 500),
        specialAbility: String(c.specialAbility ?? prev.specialAbility ?? '').slice(0, 500),
        confirmed: !!c.confirmed,
        confirmedAt: c.confirmed ? new Date().toISOString() : (prev.confirmedAt ?? null),
      };
      meta.updatedAt = new Date().toISOString();

      const saved = await sb.storage.from(BUCKET).upload(
        metaPath,
        new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }),
        { upsert: true, contentType: 'application/json' }
      );
      if (saved.error) return json({ error: saved.error.message }, 500);
      return json({ ok: true, character: meta.character });
    }

    // 배치 결정(accept/revise/reject) 제출은 일러스트 후보 심사와 함께 없앴다.
    return json({ error: 'character_required' }, 400);
  }

  return json({ error: 'method_not_allowed' }, 405);
});
