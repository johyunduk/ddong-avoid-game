// 이 파일은 생성된 것이다. 손으로 고치지 마라.
//   생성: node scripts/gen-roster.mjs
//   정본: src/config/banners.ts (머리말 아래는 정본과 글자까지 같다)
//   검사: scripts/check-roster.mjs (verify.ps1 에 물려 있다)
//
// 화면의 확률 표와 서버의 추첨이 같은 bannerRates() 를 쓰도록 정본을 그대로 옮겨 둔다.
// 명단은 ./roster.ts 의 GACHA_ROSTER · GACHA_WALLPAPERS 를 넘긴다.

/**
 * 뽑기 배너 정의 — **정본.**
 * 기준 문서: ~/ddong-fx-work/gacha/banner_spec_v1.md (확정본 2026-10-11). 규칙의 근거는 거기 있다.
 *
 * ## 화면과 서버가 같은 함수를 쓴다
 *
 * 확률은 적지 않는다. `bannerRates()` 가 등급 가중치와 배너 규칙에서 계산하고,
 * 화면의 확률 표와 서버(gacha-pull)의 추첨이 이 함수 하나를 같이 쓴다. 교환 후보도
 * `pityChoices()` 가 계산해 화면의 고르기 창과 서버(gacha-exchange)의 검증이 같이 쓴다.
 *
 * ## 이 파일은 아무것도 import 하지 않는다
 *
 * Edge Function 은 Deno 라 src/ 를 번들에 넣지 못한다. 그래서 이 파일을 **그대로**
 * `supabase/functions/_shared/banners.ts` 로 옮겨 생성한다 (`node scripts/gen-roster.mjs`).
 * 명단(캐릭터 · 배경화면)은 인자로 받는다 — 화면은 CHARACTERS · WALLPAPERS,
 * 서버는 `_shared/roster.ts` 의 GACHA_ROSTER · GACHA_WALLPAPERS 를 넘긴다.
 * 생성물이 낡으면 `scripts/check-roster.mjs` 가 실패시킨다 (verify.ps1).
 *
 * 모든 확률은 **% (0~100)** 다.
 */

export type BannerKind = 'standard' | 'pickup' | 'event' | 'starter';
export type PityExchange = 'pickupUR' | 'chooseUR' | 'chooseSR';
export type GachaGrade = 'UR' | 'SR' | 'R';
export type PullType = 'single' | 'multi';

export interface BannerPity {
  /**
   * 포인트가 쌓이는 줄 (gacha_pity.track). 지금은 배너 id 그대로라 배너마다 따로 쌓인다.
   * 출시 뒤 이월을 켤 때 픽업은 'pickup', 이벤트는 'event' 로 바꾼다 (정의서 §4-4)
   */
  track: string;
  /** 교환에 드는 포인트. 1회 = 1, 10연 = 10 포인트가 쌓인다 */
  threshold: number;
  exchange: PityExchange;
}

export interface BannerDef {
  id: string;
  kind: BannerKind;
  pickupUR: string | null;
  pickupSR: readonly string[];
  /** 픽업 SR 의 전용 배경화면 — 배경 몫의 절반을 나눈다 */
  pickupWP: readonly string[];
  pity: BannerPity | null;
  /** SKOR. 초보자는 1회가 없다 (null) */
  price: { single: number | null; multi: number };
  /** 초보자 뽑기만 — 최대 횟수와 50번째 보장 UR 후보 */
  starter: { maxPulls: number; pickFrom: readonly string[] } | null;
  /** ISO 시각. 지금은 모두 null — 동시에 열려 있다. 출시 때 배너마다 기간을 붙인다 */
  opensAt: string | null;
  closesAt: string | null;
}

/** 캐릭터 명단 한 줄 — CharacterDef 를 그대로 넘겨도 맞는다 */
export interface GachaRosterEntry {
  id: string;
  grade: string;
  unreleased?: boolean;
  /** 이벤트 픽업에서만 나온다 — 상시 풀에서 빠진다 */
  eventOnly?: boolean;
}

/** 뽑기 배경화면 한 장 — 기본 제공 배경(DEFAULT_WP_IDS)은 빼고 넘긴다 */
export interface GachaWallpaperEntry {
  id: string;
  eventOnly?: boolean;
}

/** 확률 계산이 바뀌면 올린다 — 응답의 ratesVersion · gacha_pull_log.rates_version */
export const RATES_VERSION = '2026-10-11a';

/**
 * 등급별 **종당** 가중치. 종이 늘거나 빠져도 종당 가중치는 그대로 두고 등급 합이 따라 변한다
 * (SR 은 기존 8종 산출값, UR 은 기존 3종 산출값 — 종이 늘 때 기존 종을 너프하지 않은 선례).
 * 가중치지 확률이 아니다 — 실제 확률은 가중치 / 상시 풀 합 × 캐릭터 몫이다
 */
export const GRADE_WEIGHT: Readonly<Record<GachaGrade, number>> = { UR: 0.7 / 3, SR: 19.3 / 8, R: 8 };

/** 한 칸이 배경화면일 확률 (%) — 나머지는 캐릭터다 */
export const WALLPAPER_SHARE = 3.5;

/** 기본 보유 캐릭터 — 뽑기에서 나오지 않는다 */
export const DEFAULT_CHARACTER_ID = 'chibi';

/** 1회 · 10연 칸 수 */
export const PULL_COUNT: Readonly<Record<PullType, number>> = { single: 1, multi: 10 };

/**
 * 배너 목록. **화면의 탭 순서가 이 배열 순서다** (초보자 · 상시 · 픽업①~④ · 이벤트).
 * id 는 서버 요청 · 로그 · 천장 줄에 그대로 남는다 — 바꾸지 않는다
 */
export const BANNERS: readonly BannerDef[] = [
  {
    id: 'starter', kind: 'starter',
    pickupUR: null, pickupSR: [], pickupWP: [],
    pity: null,
    price: { single: null, multi: 720 },
    starter: { maxPulls: 50, pickFrom: ['legacy', 'sentinel'] },
    opensAt: null, closesAt: null,
  },
  {
    id: 'standard', kind: 'standard',
    pickupUR: null, pickupSR: [], pickupWP: [],
    pity: { track: 'standard', threshold: 200, exchange: 'chooseUR' },
    price: { single: 100, multi: 900 },
    starter: null,
    opensAt: null, closesAt: null,
  },
  {
    id: 'pickup_gumi', kind: 'pickup',
    pickupUR: 'gumi', pickupSR: ['noise', 'miner'], pickupWP: ['wp_noise', 'wp_gold_mine'],
    pity: { track: 'pickup_gumi', threshold: 200, exchange: 'pickupUR' },
    price: { single: 100, multi: 900 },
    starter: null,
    opensAt: null, closesAt: null,
  },
  {
    id: 'pickup_sentinel', kind: 'pickup',
    pickupUR: 'sentinel', pickupSR: ['glitch', 'archieve'], pickupWP: ['wp_glitch', 'wp_lake'],
    pity: { track: 'pickup_sentinel', threshold: 200, exchange: 'pickupUR' },
    price: { single: 100, multi: 900 },
    starter: null,
    opensAt: null, closesAt: null,
  },
  {
    id: 'pickup_legacy', kind: 'pickup',
    pickupUR: 'legacy', pickupSR: ['knight', 'hacker'], pickupWP: ['wp_fantasy', 'wp_hacker'],
    pity: { track: 'pickup_legacy', threshold: 200, exchange: 'pickupUR' },
    price: { single: 100, multi: 900 },
    starter: null,
    opensAt: null, closesAt: null,
  },
  {
    id: 'pickup_mugi', kind: 'pickup',
    pickupUR: 'mugi', pickupSR: ['k', 'maehwa'], pickupWP: ['wp_k', 'wp_maehwa'],
    pity: { track: 'pickup_mugi', threshold: 200, exchange: 'pickupUR' },
    price: { single: 100, multi: 900 },
    starter: null,
    opensAt: null, closesAt: null,
  },
  {
    id: 'event_trio', kind: 'event',
    pickupUR: null, pickupSR: ['ted', 'heidi', 'red'], pickupWP: ['wp_ted', 'wp_heidi', 'wp_red'],
    pity: { track: 'event_trio', threshold: 100, exchange: 'chooseSR' },
    price: { single: 100, multi: 900 },
    starter: null,
    opensAt: null, closesAt: null,
  },
];

/** 옛 클라이언트(bannerId 없이 부름)가 뽑는 배너 */
export const DEFAULT_BANNER_ID = 'standard';

export function getBanner(id: string): BannerDef | undefined {
  return BANNERS.find(b => b.id === id);
}

/** 지금 열려 있는가 — opensAt 이상, closesAt 미만. 둘 다 null 이면 늘 열림 */
export function isBannerOpen(banner: BannerDef, nowMs: number): boolean {
  if (banner.opensAt !== null && nowMs < Date.parse(banner.opensAt)) return false;
  if (banner.closesAt !== null && nowMs >= Date.parse(banner.closesAt)) return false;
  return true;
}

/** 이 배너 · 이 횟수의 가격. 초보자 1회처럼 없는 조합이면 null */
export function pullPrice(banner: BannerDef, pullType: PullType): number | null {
  return pullType === 'multi' ? banner.price.multi : banner.price.single;
}

const isGrade = (g: string): g is GachaGrade => g === 'UR' || g === 'SR' || g === 'R';

/** 상시 풀 = 공개 − 기본 보유(chibi) − 이벤트 전용. 상시 · 초보자 배너가 뽑고, 픽업 배너 확률의 바탕이 된다 */
export function standardPool<T extends GachaRosterEntry>(roster: readonly T[]): T[] {
  return roster.filter(c => !c.unreleased && !c.eventOnly && c.id !== DEFAULT_CHARACTER_ID);
}

/** 상시 배경화면 = 뽑기 배경화면 − 이벤트 전용 */
export function standardWallpapers<T extends GachaWallpaperEntry>(wallpapers: readonly T[]): T[] {
  return wallpapers.filter(w => !w.eventOnly);
}

/** 확률 세 가지 (%) */
export interface RateCell {
  /** 한 칸 확률 — 1회 뽑기와 10연의 보통 칸 */
  slot: number;
  /** 10연 확정 칸 확률 — SR 이상 캐릭터만 값이 있고 R · 배경화면은 0 (정의서 §2-4) */
  guarantee: number;
  /** 10연 칸당 실효 확률 — 확정을 포함한 10칸 평균 */
  multi: number;
}

/** 확률 보기 창의 한 줄 — 등급 · 구분이 같은 종의 묶음. 한 줄 안의 종은 확률이 모두 같다 */
export interface RateRow {
  kind: 'character' | 'wallpaper';
  /** 배경화면 줄은 null */
  grade: GachaGrade | null;
  /** 픽업 묶음인가 — 픽업 배너의 픽업 종, 이벤트 배너의 이벤트 픽업 종 */
  pickup: boolean;
  /** 이 줄의 종 id (명단 순서) */
  ids: string[];
  /** 종당 */
  each: RateCell;
  /** 줄 합 */
  total: RateCell;
}

/** 종 하나 — 서버 추첨은 이 목록을 slot(보통 칸) · guarantee(확정 칸) 가중치로 고른다 */
export interface RateEntry {
  kind: 'character' | 'wallpaper';
  id: string;
  grade: GachaGrade | null;
  pickup: boolean;
  rate: RateCell;
}

export interface BannerRates {
  bannerId: string;
  ratesVersion: string;
  /** 표의 줄 — UR 픽업 · UR 그 외 · SR 픽업 · SR 그 외 · R · 배경 픽업 · 배경 그 외 순. 빈 줄은 없다 */
  rows: RateRow[];
  /** 종 하나씩 — rows 와 같은 순서 */
  entries: RateEntry[];
  /** 등급 합 (WP = 배경화면) */
  byGrade: Record<GachaGrade | 'WP', RateCell>;
  /** 한 칸이 SR 이상 캐릭터일 확률 */
  srPlusSlot: number;
  /** 10연에서 확정이 발동할 확률 = 앞 9칸에 SR 이상 캐릭터가 없을 확률 */
  guaranteeTrigger: number;
}

/**
 * 배너의 확률표 (정의서 §2). 규칙:
 * - 한 칸 = 배경화면 WALLPAPER_SHARE · 캐릭터 나머지. 캐릭터 등급 합은 상시 풀의 가중치 비율 그대로
 * - 픽업이 있는 등급은 그 등급 합의 절반을 픽업이 나누고, 나머지 절반을 상시 종 중 픽업이 아닌 것이 나눈다
 * - 배경화면도 같다: 픽업 전용 배경이 절반, 나머지 상시 배경이 절반
 * - 10연 확정 칸: SR 이상 캐릭터만, 한 칸 확률의 비율 그대로 (합 100%)
 * - 10연 실효 = (9p + q·g + (1 − q)·p) / 10 — q = 확정 발동 확률, g = 확정 칸 확률
 *
 * 초보자 배너는 상시와 같은 표다. 초보자 50번째 보장(UR)은 이 표에 넣지 않는다 — 문구로 공개한다 (§7).
 * 명단에 없는 픽업 id 나 모르는 등급이 있으면 던진다 — 조용히 틀린 확률로 뽑느니 바로 터지는 쪽이 낫다
 */
export function bannerRates(
  banner: BannerDef,
  roster: readonly GachaRosterEntry[],
  wallpapers: readonly GachaWallpaperEntry[],
): BannerRates {
  const pool = standardPool(roster);
  for (const c of pool) {
    if (!isGrade(c.grade)) throw new Error(`bannerRates: '${c.id}' 의 등급 '${c.grade}' 에 가중치가 없다`);
  }
  const poolWeight = pool.reduce((s, c) => s + GRADE_WEIGHT[c.grade as GachaGrade], 0);
  if (!(poolWeight > 0)) throw new Error('bannerRates: 상시 풀이 비었다');

  const pickIds = [...(banner.pickupUR ? [banner.pickupUR] : []), ...banner.pickupSR];
  const picks = pickIds.map(id => {
    const c = roster.find(r => r.id === id);
    if (!c) throw new Error(`bannerRates: ${banner.id} 의 픽업 '${id}' 가 명단에 없다`);
    return c;
  });
  for (const id of banner.pickupWP) {
    if (!wallpapers.some(w => w.id === id)) throw new Error(`bannerRates: ${banner.id} 의 픽업 배경 '${id}' 가 뽑기 배경화면에 없다`);
  }

  const charShare = 100 - WALLPAPER_SHARE;
  const draft: { kind: RateEntry['kind']; grade: GachaGrade | null; pickup: boolean; ids: string[]; each: number }[] = [];
  /** 합 total 을 픽업 · 그 외로 반씩 — 한쪽이 비면 다른 쪽이 전부 갖는다 */
  const split = (kind: RateEntry['kind'], grade: GachaGrade | null, total: number, pickIdsOf: string[], otherIds: string[]) => {
    const pickTotal = pickIdsOf.length === 0 ? 0 : otherIds.length === 0 ? total : total / 2;
    const otherTotal = total - pickTotal;
    if (pickIdsOf.length > 0) draft.push({ kind, grade, pickup: true, ids: pickIdsOf, each: pickTotal / pickIdsOf.length });
    if (otherIds.length > 0) draft.push({ kind, grade, pickup: false, ids: otherIds, each: otherTotal / otherIds.length });
  };

  for (const grade of ['UR', 'SR', 'R'] as const) {
    const base = pool.filter(c => c.grade === grade);
    const total = (charShare * base.length * GRADE_WEIGHT[grade]) / poolWeight;
    const gradePicks = picks.filter(c => c.grade === grade).map(c => c.id);
    const others = base.filter(c => !gradePicks.includes(c.id)).map(c => c.id);
    split('character', grade, total, gradePicks, others);
  }
  {
    const base = standardWallpapers(wallpapers);
    const others = base.filter(w => !banner.pickupWP.includes(w.id)).map(w => w.id);
    split('wallpaper', null, WALLPAPER_SHARE, [...banner.pickupWP], others);
  }

  // 10연 확정 칸 · 실효
  const isSrPlus = (d: { kind: string; grade: GachaGrade | null }) => d.kind === 'character' && (d.grade === 'UR' || d.grade === 'SR');
  const srPlusSlot = draft.filter(isSrPlus).reduce((s, d) => s + d.each * d.ids.length, 0);
  const q = Math.pow(1 - srPlusSlot / 100, 9);
  const cell = (d: (typeof draft)[number]): RateCell => {
    const slot = d.each;
    const guarantee = isSrPlus(d) && srPlusSlot > 0 ? (slot / srPlusSlot) * 100 : 0;
    return { slot, guarantee, multi: (9 * slot + q * guarantee + (1 - q) * slot) / 10 };
  };
  const times = (c: RateCell, n: number): RateCell => ({ slot: c.slot * n, guarantee: c.guarantee * n, multi: c.multi * n });
  const plus = (a: RateCell, b: RateCell): RateCell => ({ slot: a.slot + b.slot, guarantee: a.guarantee + b.guarantee, multi: a.multi + b.multi });

  const rows: RateRow[] = draft.map(d => {
    const each = cell(d);
    return { kind: d.kind, grade: d.grade, pickup: d.pickup, ids: d.ids, each, total: times(each, d.ids.length) };
  });
  const entries: RateEntry[] = rows.flatMap(r => r.ids.map(id => ({ kind: r.kind, id, grade: r.grade, pickup: r.pickup, rate: r.each })));
  const zero: RateCell = { slot: 0, guarantee: 0, multi: 0 };
  const byGrade: Record<GachaGrade | 'WP', RateCell> = { UR: zero, SR: zero, R: zero, WP: zero };
  for (const r of rows) {
    const key = r.kind === 'wallpaper' ? 'WP' : (r.grade as GachaGrade);
    byGrade[key] = plus(byGrade[key], r.total);
  }

  return { bannerId: banner.id, ratesVersion: RATES_VERSION, rows, entries, byGrade, srPlusSlot, guaranteeTrigger: q * 100 };
}

/** 뽑힌 칸 하나 */
export interface DrawnSlot {
  kind: 'character' | 'wallpaper';
  id: string;
  grade: GachaGrade | null;
  /**
   * 확정 칸으로 나온 것 — 10연 SR 이상 확정이면 'srPlus'.
   * 초보자 50번째 보장('starterUR')은 여기서 정하지 않는다 — 초보자 상태를 잠그고 보는 DB 함수(gacha_pull_commit)가 바꿔 넣는다
   */
  guaranteed: 'srPlus' | 'starterUR' | null;
}

/** 가중치 key 로 하나 고른다. r 은 [0, 1) — 가중치 0 인 종은 안 나온다 */
function pickEntry(entries: readonly RateEntry[], key: 'slot' | 'guarantee', r: number): RateEntry {
  const total = entries.reduce((s, e) => s + e.rate[key], 0);
  let x = r * total;
  let last: RateEntry | undefined;
  for (const e of entries) {
    const w = e.rate[key];
    if (!(w > 0)) continue;
    last = e;
    if (x < w) return e;
    x -= w;
  }
  if (!last) throw new Error(`drawSlots: '${key}' 가중치가 모두 0 이다`);
  return last;   // 부동소수 끝자리로 합을 넘긴 경우
}

/**
 * 한 번의 뽑기 — 칸 count 개 (정의서 §2 · §2-4). rand 는 [0, 1) 난수를 내는 함수 (서버는 crypto 기반).
 * 10연이면 앞 9칸에 SR 이상 캐릭터가 하나도 없을 때 10번째 칸을 확정 칸 표(guarantee)로 뽑는다. 1회 뽑기에는 확정이 없다
 */
export function drawSlots(rates: BannerRates, count: number, rand: () => number): DrawnSlot[] {
  const out: DrawnSlot[] = [];
  const srPlus = (s: DrawnSlot) => s.kind === 'character' && (s.grade === 'UR' || s.grade === 'SR');
  for (let i = 0; i < count; i++) {
    const guaranteed = count === PULL_COUNT.multi && i === count - 1 && !out.some(srPlus);
    const e = pickEntry(rates.entries, guaranteed ? 'guarantee' : 'slot', rand());
    out.push({ kind: e.kind, id: e.id, grade: e.grade, guaranteed: guaranteed ? 'srPlus' : null });
  }
  return out;
}

/**
 * 천장 교환 후보 (정의서 §4-2). 손으로 적지 않는다 — 상시 UR 구성이 바뀌면 후보도 따라 바뀐다.
 * - pickupUR: [그 배너의 픽업 UR]
 * - chooseUR: 상시 풀의 UR
 * - chooseSR: 그 배너의 픽업 SR (이벤트 셋). 전용 배경은 주지 않는다
 * 천장이 없는 배너(초보자)는 빈 배열
 */
export function pityChoices(banner: BannerDef, roster: readonly GachaRosterEntry[]): string[] {
  if (!banner.pity) return [];
  switch (banner.pity.exchange) {
    case 'pickupUR':
      return banner.pickupUR ? [banner.pickupUR] : [];
    case 'chooseUR':
      return standardPool(roster).filter(c => c.grade === 'UR').map(c => c.id);
    case 'chooseSR':
      return [...banner.pickupSR];
  }
}
