import { supabase } from './supabase';

/**
 * 로그인 상태를 보장합니다.
 * 비로그인 상태라면 익명 로그인을 자동으로 수행합니다.
 *
 * 나중에 Toss SDK 연동 시 이 함수 내부만 교체하면 됩니다.
 */
export async function ensureLoggedIn(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      throw new Error(`익명 로그인 실패: ${error.message}`);
    }
  }
}

/**
 * 현재 로그인된 유저 ID를 반환합니다.
 *
 * 나중에 Toss SDK 연동 시 이 함수 내부만 교체하면 됩니다.
 * 이 함수를 사용하는 나머지 코드는 변경 불필요.
 */
export async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('로그인되지 않은 상태입니다. ensureLoggedIn()을 먼저 호출하세요.');
  }
  return user.id;
}

/**
 * 현재 로그인된 유저 객체를 반환합니다. (없으면 null)
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
