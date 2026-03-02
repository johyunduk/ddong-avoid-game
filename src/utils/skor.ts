import { supabase } from './supabase';

export interface SkorSubmitData {
  score: number;
  goldCollected: number;
  diamondCollected: number;
  topazCollected: number;
  rainbowCollected: number;
}

export interface SkorSubmitResponse {
  success: boolean;
  skorEarned: number;
  bracketCap: number;
  questRewards: { quest: string; reward: number }[];
  totalSkorAdded: number;
  remainingBalance: number;
  weeklyCapRemaining: number;
}

/**
 * 게임오버 시 SKOR 정제 수익을 서버에 제출
 */
export async function submitSkor(data: SkorSubmitData): Promise<SkorSubmitResponse> {
  // getSession()은 만료된 access token을 refresh token으로 자동 갱신함
  let { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    // 세션이 아예 없으면 익명 로그인 재시도
    const { data: authData } = await supabase.auth.signInAnonymously();
    session = authData.session;
  }

  // access_token을 헤더에 명시적으로 주입 (SDK 자동 주입이 누락되는 엣지케이스 방어)
  const { data: result, error } = await supabase.functions.invoke('skor-submit', {
    body: data,
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
  });

  if (error) {
    throw new Error(error.message || 'Failed to submit skor');
  }

  return result as SkorSubmitResponse;
}

const SKOR_BALANCE_CACHE_KEY = 'skorBalanceCache';

/** 마지막으로 알고 있는 SKOR 잔액을 로컬에서 즉시 반환 (없으면 null) */
export function getCachedSkorBalance(): number | null {
  const raw = localStorage.getItem(SKOR_BALANCE_CACHE_KEY);
  return raw !== null ? Number(raw) : null;
}

/** SKOR 잔액을 로컬에 캐싱 */
export function cacheSkorBalance(balance: number): void {
  localStorage.setItem(SKOR_BALANCE_CACHE_KEY, String(Math.floor(balance)));
}

/**
 * 현재 SKOR 잔액 조회 (DB) 후 캐시 갱신
 * 신규 유저(행 없음)는 5000 SKOR 웰컴 보너스로 초기화
 */
export async function getSkorBalance(): Promise<number> {
  // 세션 확보 (없으면 익명 로그인) — submitSkor와 동일한 패턴
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data: authData } = await supabase.auth.signInAnonymously();
    session = authData.session;
  }
  const userId = session?.user?.id;

  const { data } = await supabase
    .from('user_skor')
    .select('balance')
    .maybeSingle(); // 행이 없으면 null 반환 (신규 유저 처리)

  if (!data) {
    // 신규 유저: 5000 SKOR 웰컴 보너스로 초기화
    const WELCOME_BONUS = 5000;
    await supabase.from('user_skor').insert({
      user_id: userId,
      balance: WELCOME_BONUS,
      weekly_earned: 0,
    });
    cacheSkorBalance(WELCOME_BONUS);
    return WELCOME_BONUS;
  }

  const balance = data.balance as number;
  cacheSkorBalance(balance);
  return balance;
}
