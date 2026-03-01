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
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data: authData } = await supabase.auth.signInAnonymously();
    session = authData.session;
  }

  const { data, error } = await supabase.functions.invoke('gacha-pull', {
    body: { pullType },
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
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
