// 뽑기 Edge Function 둘(gacha-pull · gacha-exchange)이 같이 쓰는 응답 · 거절 · 상태 모양.
// 화면 쪽 계약은 src/utils/gacha.ts (GachaPullResult · GachaExchangeResult · GachaErrorCode) — 모양을 바꾸면 둘 다 바꾼다.
// DB 함수는 supabase/migrations/20261011000009_gacha_banners.sql (gacha_pull_commit · gacha_exchange_commit)
import { BANNERS, type BannerDef, type DrawnSlot, type PityExchange } from './banners.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** 거절 이유 — 화면(GachaError.code)이 이걸로 토스트를 나눈다 */
export type GachaRejectCode =
  | 'insufficient_skor'
  | 'banner_closed'
  | 'starter_done'
  | 'starter_pick_required'
  | 'starter_single'
  | 'pity_short'
  | 'pity_target'
  | 'bad_request';

/** 400 거절. error 는 사람이 읽는 문장, code 는 화면이 나누는 값 */
export function reject(code: GachaRejectCode, error: string, extra: Record<string, unknown> = {}): Response {
  return json(400, { error, code, ...extra });
}

/** DB 함수가 RAISE 'gacha:<code>' 로 던지는 거절 — DETAIL 에 잔액 · 포인트 등 */
const RPC_REJECTS: Readonly<Partial<Record<GachaRejectCode, string>>> = {
  insufficient_skor: 'Insufficient SKOR',
  starter_done: 'Starter pulls used up',
  starter_pick_required: 'Pick the guaranteed UR first',
  pity_short: 'Not enough pity points',
  bad_request: 'Bad request',
};

/** DB 함수 오류 → 응답. 거절은 400 + code, 그 밖(연결 · 버그)은 500 */
export function rpcError(error: { message?: string; details?: string | null }): Response {
  const m = /^gacha:(\w+)$/.exec(error.message ?? '');
  const code = m ? (Object.keys(RPC_REJECTS) as GachaRejectCode[]).find(c => c === m[1]) : undefined;
  if (!code) {
    console.error('gacha DB 함수 실패:', error);
    return json(500, { error: 'Internal server error', code: 'server' });
  }
  const n = Number(error.details);
  if (code === 'insufficient_skor') return reject(code, RPC_REJECTS[code]!, { balance: Number.isFinite(n) ? n : 0 });
  if (code === 'pity_short') return reject(code, RPC_REJECTS[code]!, { points: Number.isFinite(n) ? n : 0 });
  return reject(code, RPC_REJECTS[code]!);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 요청의 requestId. 같은 값이 두 번 오면 DB 함수가 첫 결과를 돌려준다.
 * 없으면 새로 만든다 (옛 클라이언트 — 재시도 보호가 없는 것은 전과 같다). 형식이 틀리면 null
 */
export function readRequestId(v: unknown): string | null {
  if (v === undefined || v === null) return crypto.randomUUID();
  return typeof v === 'string' && UUID_RE.test(v) ? v : null;
}

/** [0, 1) 난수 — 뽑기는 crypto 로 */
export function rand(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}

/** gacha_pull_commit · gacha_exchange_commit 이 돌려주는 것 (gacha_log_response) */
export interface CommitResult {
  /** 같은 requestId 의 첫 결과를 돌려준 것 */
  replay: boolean;
  kind: 'pull' | 'exchange';
  bannerId: string;
  results: (DrawnSlot & { isNew: boolean })[];
  pityPoints: number | null;
  balance: number | null;
  ratesVersion: string;
  starter: { pullsDone: number; urHit: boolean; pick: string | null } | null;
}

export interface PityState {
  track: string;
  points: number;
  threshold: number;
  exchange: PityExchange;
  canExchange: boolean;
}

export function pityOf(banner: BannerDef, points: number | null): PityState | null {
  if (!banner.pity) return null;
  const p = points ?? 0;
  return { track: banner.pity.track, points: p, threshold: banner.pity.threshold, exchange: banner.pity.exchange, canExchange: p >= banner.pity.threshold };
}

/** 초보자 상태 — 행이 없으면 처음 상태 */
export function starterOf(row: CommitResult['starter']) {
  const max = BANNERS.find(b => b.kind === 'starter')?.starter?.maxPulls ?? 0;
  return { pullsDone: row?.pullsDone ?? 0, max, urHit: row?.urHit ?? false, pick: row?.pick ?? null };
}
