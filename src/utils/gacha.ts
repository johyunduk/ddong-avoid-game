import { supabase } from './supabase';
import { setOwnedCharacters, getOwnedCharacters, setDuplicateCount } from './character';
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
