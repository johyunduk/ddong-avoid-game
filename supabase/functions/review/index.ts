// 캐릭터 일러스트 후보 심사 API.
//
//   GET  /functions/v1/review?list=1&k=<키>        → 배치 목록 (썸네일 + 결정 상태)
//   GET  /functions/v1/review?b=<batch>&t=<token>  → 배치 데이터 + 이미지 서명 URL
//   POST /functions/v1/review?b=<batch>&t=<token>  → 결정 저장 {decision, submitted}
//   DELETE /functions/v1/review?b=<batch>&t=<token> → 배치 삭제 (기각된 것만)
//   POST /functions/v1/review?b=<batch>&t=<token>  → 캐릭터 설정 저장 {character}
//        (확정된 배치에만. proposals 는 PC 의 builder 가 채워 넣는다)
//   GET  /functions/v1/review?requests=1&k=<키>    → 컨셉 요청 목록
//   POST /functions/v1/review?request=1&k=<키>     → 컨셉 요청 등록 {text, kind, theme}
//
// 심사 결과는 **배치 단위 결정 하나**다.
//   accept : 이 컨셉으로 확정 — selected 필수 (4장 중 1장)
//   revise : 다시 — selected 가 있으면 그 장 기준으로 다듬고, 없으면 컨셉째 수정
//   reject : 컨셉 폐기
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
const SIGNED_TTL = 60 * 60 * 24; // 서명 URL 24시간

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

      const now = new Date();
      const id =
        now.toISOString().replace(/[-:T]/g, '').slice(0, 14) +
        '-' +
        Math.random().toString(36).slice(2, 8);
      const doc = {
        id,
        kind, // manual = 사용자가 컨셉을 적음 / auto = 컨셉도 알아서 잡기
        theme,
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
    return json({ requests });
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

    const type = body?.decision?.type as DecisionType | undefined;
    if (type !== 'accept' && type !== 'revise' && type !== 'reject') {
      return json({ error: 'decision_required' }, 400);
    }
    const selected =
      typeof body.decision.selected === 'string' ? body.decision.selected : null;
    if (type === 'accept' && !selected) return json({ error: 'selected_required' }, 400);
    if (selected && !meta.candidates.some((c) => c.file === selected)) {
      return json({ error: 'unknown_candidate' }, 400);
    }

    meta.decision = {
      type,
      selected,
      note: String(body.decision.note ?? '').slice(0, 2000),
    };
    meta.candidates = meta.candidates.map((c) => ({ ...c, selected: c.file === selected }));
    meta.submitted = !!body.submitted;
    meta.updatedAt = new Date().toISOString();
    if (meta.submitted) meta.submittedAt = meta.updatedAt;

    const up = await sb.storage.from(BUCKET).upload(
      metaPath,
      new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }),
      { upsert: true, contentType: 'application/json' }
    );
    if (up.error) return json({ error: up.error.message }, 500);

    return json({ ok: true, submitted: meta.submitted, decision: meta.decision });
  }

  // ── 삭제 (기각된 배치만) ────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (meta.decision?.type !== 'reject') {
      return json({ error: 'reject_only' }, 409);
    }
    const listed = await sb.storage.from(BUCKET).list(batch, { limit: 200 });
    if (listed.error) return json({ error: listed.error.message }, 500);

    const paths = (listed.data ?? []).map((e) => `${batch}/${e.name}`);
    if (paths.length) {
      const removed = await sb.storage.from(BUCKET).remove(paths);
      if (removed.error) return json({ error: removed.error.message }, 500);
    }
    return json({ ok: true, deleted: paths.length });
  }

  return json({ error: 'method_not_allowed' }, 405);
});
