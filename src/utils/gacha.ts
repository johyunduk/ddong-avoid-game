import { supabase } from './supabase';

export interface PulledCharacter {
  id: string;
  grade: string;
  isNew: boolean;
}

export interface GachaPullResult {
  success: boolean;
  video: 'green' | 'red';
  characters: PulledCharacter[];
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
 * 서버 DB의 보유 캐릭터 목록을 가져와 localStorage에 동기화
 */
export async function syncOwnedCharacters(): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_characters')
    .select('character_id');

  if (error || !data) return ['chibi'];

  const ids = (data as { character_id: string }[]).map(r => r.character_id);
  if (!ids.includes('chibi')) ids.unshift('chibi');

  localStorage.setItem('ownedCharacters', JSON.stringify(ids));
  return ids;
}
