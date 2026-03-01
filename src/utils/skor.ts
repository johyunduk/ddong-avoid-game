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

/**
 * 현재 SKOR 잔액 조회
 */
export async function getSkorBalance(): Promise<number> {
  const { data } = await supabase
    .from('user_skor')
    .select('balance')
    .maybeSingle(); // 행이 없으면 null 반환 (신규 유저 처리)

  return (data?.balance as number) ?? 0;
}
