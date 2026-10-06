import { supabase } from './supabase';
import { CHARACTERS, setOwnedCharacters, getOwnedCharacters, setDuplicateCount, type CharacterDef } from './character';
import { setOwnedWallpapers, getOwnedWallpapers } from './wallpaper';

export interface PulledCharacter {
  id: string;
  grade: string;
  isNew: boolean;
}

export interface PulledWallpaper {
  id: string;
  isNew: boolean;
}

export interface GachaPullResult {
  success: boolean;
  video: 'green' | 'red';
  characters: PulledCharacter[];
  wallpapers: PulledWallpaper[];  // 없으면 빈 배열
  remainingSkor: number;
}

/**
 * 뽑기 실행 — 서버에서 SKOR 차감 및 캐릭터 결정
 */
export async function gachaPull(pullType: 'single' | 'multi'): Promise<GachaPullResult> {
  // getUser()는 토큰을 서버 검증 후 만료 시 자동 갱신
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    await supabase.auth.signInAnonymously();
  }

  // SDK가 현재 세션의 Authorization 헤더를 자동으로 포함
  const { data, error } = await supabase.functions.invoke('gacha-pull', {
    body: { pullType },
  });

  if (error) {
    throw new Error(error.message || 'Failed to pull gacha');
  }

  return data as GachaPullResult;
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
    console.error('[syncOwnedCharacters] 조회 실패:', error);
    return ['chibi'];
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
// 확률은 서버(gacha-pull)가 정한다. 화면은 같은 가중치로 계산해 **보여주기만** 한다.
// 아래 값이 서버와 어긋나면 scripts/check-roster.mjs 가 실패시킨다 (verify.ps1)

/** 등급별 **종당** 가중치 — gacha-pull 의 WEIGHT_BY_GRADE 와 같은 값 */
export const GACHA_GRADE_WEIGHT = { R: 8, SR: 19.3 / 8, UR: 0.7 / 3 } as const;
/** 슬롯마다 배경화면이 함께 나올 확률 — gacha-pull 의 WP_DROP_CHANCE 와 같은 값 */
export const GACHA_WP_DROP_CHANCE = 0.035;

type PullGrade = keyof typeof GACHA_GRADE_WEIGHT;
const weightOf = (grade: string): number => GACHA_GRADE_WEIGHT[grade as PullGrade] ?? 0;

/** 뽑기 풀 = 공개 캐릭터 중 기본 보유(chibi)를 뺀 것 — gacha-pull OBTAINABLE_IDS 와 같은 집합 (check-roster) */
export function gachaPool(): CharacterDef[] {
  return CHARACTERS.filter(c => !c.unreleased && c.id !== 'chibi');
}

/** 등급 전체 확률(%)과 종당 확률(%) */
export function gachaRates(): { byGrade: Record<PullGrade, number>; perChar: (grade: string) => number } {
  const pool = gachaPool();
  const total = pool.reduce((sum, c) => sum + weightOf(c.grade), 0) || 1;
  const byGrade: Record<PullGrade, number> = { UR: 0, SR: 0, R: 0 };
  for (const c of pool) {
    if (c.grade in byGrade) byGrade[c.grade as PullGrade] += (weightOf(c.grade) / total) * 100;
  }
  return { byGrade, perChar: (grade: string) => (weightOf(grade) / total) * 100 };
}

/** 확률 글자 — 10% 미만은 소수 둘째 자리, 그 위는 첫째 자리, 끝의 0 은 뗀다 (0.22 · 3.5 · 24.7) */
export function formatRate(percent: number): string {
  return String(parseFloat(percent < 10 ? percent.toFixed(2) : percent.toFixed(1)));
}
