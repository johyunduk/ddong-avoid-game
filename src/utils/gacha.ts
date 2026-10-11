import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { CHARACTERS, setOwnedCharacters, getOwnedCharacters, setDuplicateCount, type CharacterDef } from './character';
import { WALLPAPERS, GACHA_WP_IDS, setOwnedWallpapers, getOwnedWallpapers } from './wallpaper';
import {
  BANNERS, DEFAULT_BANNER_ID, bannerRates, isBannerOpen, multiDiscountPct, pityChoices, pullPrice, standardPool,
  type BannerDef, type BannerRates, type GachaWallpaperEntry, type PityExchange, type PullType,
} from '../config/banners';

// 배너 정의 · 확률 규칙의 정본은 src/config/banners.ts 다. 여기는 화면이 쓰는 호출 · 상태 · 표시 함수만 둔다.
// 서버 계약 기준: ~/ddong-fx-work/gacha/banner_spec_v1.md (정의서 v2) §6-2

/** 확정 칸으로 나온 카드 — 'srPlus' = 10연 SR 이상 확정, 'starterUR' = 초보자 50번째 보장 */
export type PullGuarantee = 'srPlus' | 'starterUR';

export interface PulledCharacter {
  id: string;
  grade: string;
  isNew: boolean;
  /** 결과 카드의 작은 글자 ('SR 확정' · '보장'). 보통 칸은 null. gachaPull 이 늘 채운다 */
  guaranteed?: PullGuarantee | null;
}

export interface PulledWallpaper {
  id: string;
  isNew: boolean;
}

/** 배너 하나의 천장 */
export interface GachaPityState {
  track: string;
  points: number;
  threshold: number;
  exchange: PityExchange;
  /** points >= threshold — [교환] 버튼을 켠다 */
  canExchange: boolean;
}

/**
 * 초보자 혜택 상태 — 상시 배너의 처음 max 칸 (정의서 v2 §3). 상시 10연만 센다 (1회는 안 센다).
 * pullsDone < max 인 동안 상시 10연이 할인가(starter.multiPrice)다 — starterWindowOf · pullPriceOf
 */
export interface GachaStarterState {
  /** 초보자 구간에서 쓴 칸 수 — 10의 배수 */
  pullsDone: number;
  max: number;
  /** 초보자 구간 10연에서 UR 이 이미 나왔다 — 50번째 보장이 필요 없다 ('UR 획득 — 보장 없이 진행') */
  urHit: boolean;
  /** 50번째 보장 UR 으로 골라 둔 것 (상시 배너 starter.pickFrom 중 하나). 안 골랐으면 null */
  pick: string | null;
}

export interface GachaPullResult {
  success: boolean;
  /** 실제로 뽑은 배너 */
  bannerId: string;
  video: 'green' | 'red';
  characters: PulledCharacter[];
  wallpapers: PulledWallpaper[];  // 없으면 빈 배열
  remainingSkor: number;
  /** 실제로 빠진 SKOR — 초보자 구간 상시 10연 720 · 보통 10연 900 · 1회 100 */
  cost: number;
  /** 이 뽑기 뒤의 천장. 상시는 초보자 구간이어도 'standard' 줄에 쌓인다 */
  pity: GachaPityState | null;
  /** 이 뽑기 뒤의 초보자 상태 — 상시 배너 응답에만 싣는다. 다른 배너는 null */
  starter: GachaStarterState | null;
  ratesVersion: string;
}

export interface GachaExchangeResult {
  success: boolean;
  bannerId: string;
  /** 받은 캐릭터 — isNew 가 아니면 중복 +1 (각성 재료). 결과 카드에 '교환' */
  character: PulledCharacter;
  /** 교환 뒤의 천장 (기준만큼 줄어 있다) */
  pity: GachaPityState;
  ratesVersion: string;
}

/**
 * 서버가 거절한 이유. 화면은 code 로 토스트를 나눈다.
 * 'network' 는 응답을 못 받은 것이라 **뽑혔는지 모른다** — 화면이 '다시 시도'에서 error.requestId 를 그대로
 * 넘겨 다시 부르면 서버가 첫 결과를 돌려준다 (두 번 차감되지 않는다)
 */
export type GachaErrorCode =
  | 'insufficient_skor'      // SKOR 부족 (error.balance = 서버가 본 잔액)
  | 'banner_closed'          // 닫힌 배너 · 모르는 배너 (지운 pickup_sentinel · pickup_legacy 포함)
  | 'starter_pick_required'  // 초보자 다섯 번째 10연인데 보장 UR 을 안 골랐다 → 고르기 창 뒤 starterPick 을 넣어 다시
  | 'price_changed'          // expectedCost 와 실제 차감액이 다르다 (다른 기기에서 초보자 구간을 다 썼다 등). error.cost = 실제 가격
  | 'starter_done'           // @deprecated v2 서버는 보내지 않는다 — 구간이 끝나면 보통 상시가 된다. 화면이 case 를 지우면 뺀다
  | 'starter_single'         // @deprecated v2 서버는 보내지 않는다 — 1회는 늘 보통 상시. 화면이 case 를 지우면 뺀다
  | 'pity_short'             // 교환: 포인트가 기준에 못 미친다
  | 'pity_target'            // 교환: 고를 수 있는 후보가 아니다 (chooseUR · chooseSR 은 targetId 가 꼭 있어야 한다)
  | 'network'                // 응답을 못 받았다 — 자동으로 다시 보내지 않는다 (invokeGacha 주석)
  | 'bad_request'            // 요청 모양이 틀렸다 (화면 버그) · 같은 requestId 를 다른 일에 다시 썼다
  | 'unauthorized'
  | 'server';                // 그 밖 (5xx · 모르는 응답)

const ERROR_CODES: readonly GachaErrorCode[] = [
  'insufficient_skor', 'banner_closed', 'starter_pick_required', 'price_changed', 'starter_done', 'starter_single',
  'pity_short', 'pity_target', 'network', 'bad_request', 'unauthorized', 'server',
];

export class GachaError extends Error {
  readonly code: GachaErrorCode;
  /** 이 요청의 requestId — 'network' 뒤 다시 부를 때 넘긴다 */
  readonly requestId: string;
  /** HTTP 상태. 응답을 못 받았으면 null */
  readonly status: number | null;
  /** insufficient_skor 일 때 서버가 본 잔액 */
  readonly balance: number | null;
  /** price_changed 일 때 서버가 매기려던 가격 */
  readonly cost: number | null;

  constructor(
    code: GachaErrorCode, message: string, requestId: string, status: number | null,
    balance: number | null = null, cost: number | null = null,
  ) {
    super(message);
    this.name = 'GachaError';
    this.code = code;
    this.requestId = requestId;
    this.status = status;
    this.balance = balance;
    this.cost = cost;
  }
}

/** 요청 하나의 id — 서버가 이 값으로 중복 요청을 거른다 (같은 값이 두 번 오면 첫 결과를 돌려준다) */
export function newRequestId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  // randomUUID 는 https 에서만 있다 — 그 밖에서는 같은 모양(v4)을 직접 만든다
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function ensureSession(): Promise<void> {
  // getUser()는 토큰을 서버 검증 후 만료 시 자동 갱신
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    await supabase.auth.signInAnonymously();
  }
}

async function toGachaError(error: unknown, requestId: string): Promise<GachaError> {
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return new GachaError('network', error.message, requestId, null);
  }
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const body = await res.json().catch(() => null) as { error?: string; code?: string; balance?: number; cost?: number } | null;
    const known = ERROR_CODES.find(c => c === body?.code);
    // 옛 서버(배너 이전)는 code 없이 error 문장만 준다
    const code: GachaErrorCode = known
      ?? (body?.error === 'Insufficient SKOR' ? 'insufficient_skor' : res.status === 401 ? 'unauthorized' : 'server');
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    return new GachaError(code, body?.error ?? error.message, requestId, res.status, num(body?.balance), num(body?.cost));
  }
  return new GachaError('server', error instanceof Error ? error.message : String(error), requestId, null);
}

/**
 * Edge Function 호출 — 한 번만 보낸다. 응답을 못 받으면 GachaError('network') 에 이 requestId 를 실어 던진다.
 *
 * **자동으로 다시 보내지 않는다.** 같은 requestId 를 첫 결과로 돌려주는 것은 배너 서버(20261011000009 이후의
 * gacha-pull)뿐이고, 배너 이전 gacha-pull 은 requestId 를 모른 채 요청마다 차감한다. 이 화면이 그 서버에 붙은
 * 채(클라이언트 선행 배포 · 서버만 롤백) 첫 응답이 끊기면 자동 재시도가 SKOR 를 한 번 더 뺀다 (리뷰 e8997268 P1 재현).
 * 다시 보낼지는 사람이 '다시 시도'로 정하고, 그때 화면이 error.requestId 를 넘긴다 — 배너 서버면 첫 결과가 오고,
 * 옛 서버여도 사람이 한 번 더 누른 것과 같다.
 * 함수 이름은 부르는 쪽에 글자로 둔다 — `functions.invoke('<이름>')` 로 찾는 규칙 (CLAUDE.md)
 */
async function invokeGacha(
  invoke: (body: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>,
  body: Record<string, unknown>,
  requestId: string,
): Promise<Record<string, unknown>> {
  await ensureSession();
  // SDK가 현재 세션의 Authorization 헤더를 자동으로 포함
  const { data, error } = await invoke({ ...body, requestId });
  if (error) throw await toGachaError(error, requestId);
  return data as Record<string, unknown>;
}

export interface GachaPullOptions {
  /** 뽑을 배너 (BANNERS 의 id). 없으면 상시 */
  bannerId?: string;
  /**
   * 상시 10연만 — 초보자 구간이면 50번째 보장 UR 을 이 값으로 저장하고 뽑는다 (구간 밖이면 서버가 무시한다).
   * 골라 둔 값이 있으면 구간 10연마다 실어 보낸다 — 다섯 번째 10연에 고른 값이 없으면 서버가 거절한다
   */
  starterPick?: string;
  /**
   * 화면에 보인 가격 (pullPriceOf). 서버가 잠그고 정한 실제 차감액과 다르면 차감 없이 'price_changed' 로 거절한다 —
   * 720 을 보고 눌렀는데 다른 기기에서 구간을 다 써 900 이 빠지는 일을 막는다. 넘기기를 권한다 (정의서 §3 · §6-2)
   */
  expectedCost?: number;
  /**
   * 보통은 넘기지 않는다 — 부를 때마다 gacha.ts 가 새로 만든다 (누를 때 하나).
   * 'network' 오류 뒤 화면의 '다시 시도'만 그 오류의 requestId 를 넘긴다 (재시도는 같은 값)
   */
  requestId?: string;
}

/**
 * 뽑기 실행 — 서버에서 SKOR 차감 · 천장 · 초보자 · 결정을 한 번에 한다.
 * 실패하면 GachaError 를 던진다 (code 로 거절 이유를 나눈다)
 */
export async function gachaPull(pullType: PullType, opts: GachaPullOptions = {}): Promise<GachaPullResult> {
  const bannerId = opts.bannerId ?? DEFAULT_BANNER_ID;
  const requestId = opts.requestId ?? newRequestId();
  const data = await invokeGacha(
    b => supabase.functions.invoke('gacha-pull', { body: b }),
    { pullType, bannerId, starterPick: opts.starterPick, expectedCost: opts.expectedCost },
    requestId,
  );
  const result: GachaPullResult = {
    success: data.success !== false,
    bannerId: (data.bannerId as string | undefined) ?? bannerId,
    video: data.video === 'red' ? 'red' : 'green',
    characters: ((data.characters ?? []) as PulledCharacter[]).map(c => ({ ...c, guaranteed: c.guaranteed ?? null })),
    wallpapers: (data.wallpapers ?? []) as PulledWallpaper[],
    remainingSkor: Number(data.remainingSkor ?? 0),
    cost: Number(data.cost ?? 0),
    pity: (data.pity as GachaPityState | null | undefined) ?? null,
    starter: (data.starter as GachaStarterState | null | undefined) ?? null,
    ratesVersion: (data.ratesVersion as string | undefined) ?? '',
  };
  rememberState(result.pity, result.starter);
  return result;
}

/**
 * 천장 교환 — 포인트가 기준 이상일 때 1장을 받고 기준만큼 쓴다.
 * targetId: pickupUR 배너는 넘기지 않는다. chooseUR · chooseSR 배너는 exchangeChoicesOf(banner) 중 하나를 꼭 넘긴다
 */
export async function gachaExchange(bannerId: string, targetId?: string, opts: { requestId?: string } = {}): Promise<GachaExchangeResult> {
  const requestId = opts.requestId ?? newRequestId();
  const data = await invokeGacha(b => supabase.functions.invoke('gacha-exchange', { body: b }), { bannerId, targetId }, requestId);
  const character = data.character as PulledCharacter;
  const result: GachaExchangeResult = {
    success: data.success !== false,
    bannerId: (data.bannerId as string | undefined) ?? bannerId,
    character: { ...character, guaranteed: null },
    pity: data.pity as GachaPityState,
    ratesVersion: (data.ratesVersion as string | undefined) ?? '',
  };
  rememberState(result.pity, null);
  return result;
}

// ── 천장 · 초보자 상태 ──────────────────────────────────────────────────
// 서버 표 gacha_pity · gacha_starter 의 본인 행을 RLS 로 읽는다 (쓰기는 Edge Function 만)

export interface GachaState {
  /** track → 천장. 천장이 있는 배너의 줄은 모두 들어 있다 (행이 없으면 0 포인트) */
  pity: Record<string, GachaPityState>;
  /** 초보자 상태. 한 번도 안 뽑았으면 pullsDone 0 */
  starter: GachaStarterState;
}

const STATE_CACHE_KEY = 'ddong_gacha_state_v1';
let stateCache: GachaState | null = null;

/** 배너 하나의 천장 — 천장이 없는 배너는 null */
export function pityStateOf(banner: BannerDef, points: number): GachaPityState | null {
  if (!banner.pity) return null;
  const { track, threshold, exchange } = banner.pity;
  return { track, points, threshold, exchange, canExchange: points >= threshold };
}

/** 초보자 설정이 있는 배너 — 상시 하나 (check-roster 가 지킨다) */
function starterBanner(): BannerDef | undefined {
  return BANNERS.find(b => b.starter !== null);
}

function buildState(points: Record<string, number>, starter: Omit<GachaStarterState, 'max'>): GachaState {
  const pity: Record<string, GachaPityState> = {};
  for (const b of BANNERS) {
    const s = b.pity && pityStateOf(b, points[b.pity.track] ?? 0);
    if (s) pity[s.track] = s;
  }
  return { pity, starter: { ...starter, max: starterBanner()?.starter?.maxPulls ?? 0 } };
}

/**
 * 마지막으로 읽은 상태 — 기기에 남는다. 화면 첫 그림(탭 · 막대)을 깜빡임 없이 그리는 용도고,
 * 판단은 서버가 다시 한다. 한 번도 못 읽었으면 null
 */
export function getCachedGachaState(): GachaState | null {
  if (stateCache) return stateCache;
  try {
    const raw = localStorage.getItem(STATE_CACHE_KEY);
    stateCache = raw ? JSON.parse(raw) as GachaState : null;
  } catch {
    stateCache = null;
  }
  return stateCache;
}

function saveState(state: GachaState): void {
  stateCache = state;
  try {
    localStorage.setItem(STATE_CACHE_KEY, JSON.stringify(state));
  } catch {
    // 저장 못 해도 이번 실행 동안은 메모리 캐시로 충분하다
  }
}

/** 뽑기 · 교환 응답으로 캐시를 고친다 */
function rememberState(pity: GachaPityState | null, starter: GachaStarterState | null): void {
  const cur = getCachedGachaState();
  if (!cur) return;   // 한 번도 안 읽었으면 다음 fetchGachaState 가 채운다
  saveState({
    pity: pity ? { ...cur.pity, [pity.track]: pity } : cur.pity,
    starter: starter ?? cur.starter,
  });
}

/** 서버에서 상태를 읽어 캐시를 고친다. 못 읽으면 null (캐시는 그대로) */
export async function fetchGachaState(): Promise<GachaState | null> {
  const [pityRes, starterRes] = await Promise.all([
    supabase.from('gacha_pity').select('track, points'),
    supabase.from('gacha_starter').select('pulls_done, ur_hit, pick').maybeSingle(),
  ]);
  if (pityRes.error || starterRes.error) {
    console.error('[fetchGachaState] 조회 실패:', pityRes.error ?? starterRes.error);
    return null;
  }
  const points: Record<string, number> = {};
  for (const r of (pityRes.data ?? []) as { track: string; points: number }[]) points[r.track] = r.points;
  const s = starterRes.data as { pulls_done: number; ur_hit: boolean; pick: string | null } | null;
  const state = buildState(points, { pullsDone: s?.pulls_done ?? 0, urHit: s?.ur_hit ?? false, pick: s?.pick ?? null });
  saveState(state);
  return state;
}

/**
 * 넘기기에 보일 배너 — BANNERS 순서 그대로(상시 · 구미 · 무기 · 이벤트), 열린 것만.
 * v2 에서 초보자 배너가 없어져 상태는 보지 않는다 (인자는 v1 호환으로 남겼다). 초보자 줄은 starterWindowOf
 */
export function visibleBanners(_state?: GachaState | null, nowMs: number = Date.now()): BannerDef[] {
  return BANNERS.filter(b => isBannerOpen(b, nowMs));
}

/**
 * 이 배너의 초보자 구간 상태 — 상시 배너이고, 상태를 알고, 구간이 남았을 때만 (아니면 null).
 * 상시 화면의 초보자 줄 · 50번째 보장 토글을 이걸로 켠다 (정의서 §5). 초보자를 여는 별도 스위치는 없다 —
 * 배너가 운영에 나가는 것이 웰컴 보너스 서버 지급 뒤라 순서로 지킨다
 */
export function starterWindowOf(banner: BannerDef, state: GachaState | null): GachaStarterState | null {
  if (!banner.starter || !state) return null;
  return state.starter.pullsDone < state.starter.max ? state.starter : null;
}

/**
 * 화면에 보일 가격 — 초보자 구간의 상시 10연이면 할인가. 상태를 모르면 보통 가격.
 * 뽑기 요청의 expectedCost 로 이 값을 그대로 넘긴다 (서버가 다르게 정하면 price_changed)
 */
export function pullPriceOf(banner: BannerDef, pullType: PullType, state: GachaState | null): number {
  return pullPrice(banner, pullType, state?.starter.pullsDone ?? null);
}

/** 10연 할인 배지 (%) — '1회 × 10' 대비 (보통 10, 초보자 구간 28 — 정의서 §5) */
export function multiDiscountOf(banner: BannerDef, state: GachaState | null): number {
  return multiDiscountPct(banner, state?.starter.pullsDone ?? null);
}

// ── 확률 · 후보 (화면용) ────────────────────────────────────────────────
// 서버와 같은 함수(banners.ts)에 화면의 명단을 넣는다

/** 뽑기 배경화면 — 기본 제공 배경을 뺀 것 */
export function gachaWallpapers(): GachaWallpaperEntry[] {
  return WALLPAPERS.filter(w => GACHA_WP_IDS.includes(w.id)).map(w => ({ id: w.id, eventOnly: w.eventOnly }));
}

/** 상시 풀 — 공개 − chibi − 이벤트 전용 − 픽업 전용. 상시 진열 슬라이드쇼 · 상시 천장 후보와 같은 집합 (UR = 레거시 · 센티넬) */
export function standardGachaPool(): CharacterDef[] {
  return standardPool(CHARACTERS);
}

/** 배너의 확률표 — 확률 보기 창이 rows 를 그대로 그린다 */
export function ratesOf(banner: BannerDef): BannerRates {
  return bannerRates(banner, CHARACTERS, gachaWallpapers());
}

/** 천장 교환 후보 id — 고르기 창 (pickupUR 배너는 하나) */
export function exchangeChoicesOf(banner: BannerDef): string[] {
  return pityChoices(banner, CHARACTERS);
}

/**
 * 서버 DB의 보유 배경화면 목록을 가져와 localStorage에 동기화
 */
export async function syncOwnedWallpapers(): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_wallpapers')
    .select('wallpaper_id');

  if (error || !data) {
    console.error('[syncOwnedWallpapers] 조회 실패:', error);
    return getOwnedWallpapers();
  }

  const rows = data as { wallpaper_id: string }[];
  const serverIds = rows.map(r => r.wallpaper_id);
  const localIds = getOwnedWallpapers();
  const merged = [...new Set([...serverIds, ...localIds])];

  setOwnedWallpapers(merged);
  return merged;
}

/**
 * 서버 DB의 보유 캐릭터 목록을 가져와 localStorage에 동기화
 */
export async function syncOwnedCharacters(): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_characters')
    .select('character_id, duplicate_count');

  if (error || !data) {
    // 실패하면 로컬 보유 목록 그대로 — 예전에는 ['chibi'] 를 돌려줘서 수집 화면이 '보유 목록이 바뀌었다'고 보고
    // 재시작 → 다시 동기화 → 다시 실패를 끝없이 되풀이했다 (오프라인에서 4초에 236번, 버튼이 안 눌림. 2026-10-07)
    console.error('[syncOwnedCharacters] 조회 실패:', error);
    return getOwnedCharacters();
  }

  const rows = data as { character_id: string; duplicate_count: number }[];

  // 중복 카운트를 서버 기준으로 덮어씀 (서버가 source of truth)
  rows.forEach(r => {
    if (r.duplicate_count > 0) {
      setDuplicateCount(r.character_id, r.duplicate_count);
    }
  });

  // 로컬에 있는 캐릭터(addOwnedCharacter로 즉시 저장된 것)와 merge
  const serverIds = rows.map(r => r.character_id);
  const localIds = getOwnedCharacters();
  const merged = [...new Set([...serverIds, ...localIds])];
  if (!merged.includes('chibi')) merged.unshift('chibi');

  console.log('[syncOwnedCharacters] 동기화 완료:', merged);
  setOwnedCharacters(merged);
  return merged;
}

// ── 확률 표시 ─────────────────────────────────────────────────────────

/**
 * 확률 글자 (정의서 §2): 1% 미만은 소수 셋째 자리 · 끝의 0 을 남긴다 (0.449 · 0.150).
 * 10% 미만은 둘째 자리, 그 위는 첫째 자리 — 이 둘은 끝의 0 을 뗀다 (3.5 · 24.7)
 */
export function formatRate(percent: number): string {
  const r3 = percent.toFixed(3);
  if (Number(r3) < 1) return r3;
  return String(parseFloat(percent < 10 ? percent.toFixed(2) : percent.toFixed(1)));
}
